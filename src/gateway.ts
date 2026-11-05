import type { GatewayStatus } from "./contract"

/** The shape of the provider list the window receives over the Ipc. */
export interface ProviderRef {
  id: string
  name: string
  baseURL?: string
}

/** A single slot object from GET /upstream/{model}/slots. */
export interface UpstreamSlotRaw {
  id?: number
  n_ctx?: number
  is_processing?: boolean
  n_prompt_tokens?: number
}

/** The shape of the entry in GET /v1/models that matches the model id. */
export interface ModelMetaRaw {
  id: string
  name?: string
  description?: string
  context_length?: number
  status?: { value?: string }
  meta?: { llamaswap?: { n_ctx?: number } }
}

/** What GET /api/profiles returns. */
export interface ProfilesRaw {
  active?: string
  profiles?: Array<{
    id: string
    description?: string
    pins?: { assistant?: string }
  }>
}

/** The latest sample of one GPU from GET /api/performance. */
export interface GpuSampleRaw {
  name?: string
  temp_c?: number
  gpu_util_pct?: number
  mem_used_mb?: number
  mem_total_mb?: number
  power_draw_w?: number
}

/** The latest system sample from GET /api/performance. */
export interface SysSampleRaw {
  mem_used_mb?: number
  mem_total_mb?: number
  load_avg_1?: number
  cpu_util_per_core?: number[]
}

/**
 * Strips the trailing path (usually "/v1") from a provider base URL,
 * yielding the gateway root. "http://h:9292/v1" -> "http://h:9292".
 */
export function gatewayRoot(baseURL: string | undefined): string | undefined {
  if (!baseURL?.trim()) return undefined
  let u = baseURL.trim().replace(/\/+$/, "")
  u = u.replace(/\/v1\/?$/, "")
  return u || undefined
}

/**
 * Resolves the gateway root from the stored settings and the provider list.
 * Returns undefined when nothing matches.
 */
export function resolveGatewayBase(
  settings: { boundProviderId: string; customBaseUrl?: string },
  providers: readonly ProviderRef[],
): string | undefined {
  if (settings.customBaseUrl?.trim()) return gatewayRoot(settings.customBaseUrl)
  if (settings.boundProviderId === "auto") {
    const byName = providers.find(
      (p) => p.id === "llama-swap" || p.name.toLowerCase().includes("llama-swap"),
    )
    if (byName?.baseURL) return gatewayRoot(byName.baseURL)
    const byPort = providers.find((p) => p.baseURL?.includes(":9292"))
    if (byPort?.baseURL) return gatewayRoot(byPort.baseURL)
    return undefined
  }
  const p = providers.find((x) => x.id === settings.boundProviderId)
  return gatewayRoot(p?.baseURL)
}

/**
 * The provider id the widget binds to. "auto" resolves to the discovered
 * provider id, or undefined when nothing matches.
 */
export function resolveBoundProviderId(
  settings: { boundProviderId: string },
  providers: readonly ProviderRef[],
): string | undefined {
  if (settings.boundProviderId === "auto") {
    const byName = providers.find(
      (p) => p.id === "llama-swap" || p.name.toLowerCase().includes("llama-swap"),
    )
    const byPort = providers.find((p) => p.baseURL?.includes(":9292"))
    return byName?.id ?? byPort?.id
  }
  return settings.boundProviderId
}

/**
 * Parses a Prometheus exposition body into metric name -> value.
 * Lines with labels are ignored; only bare series are returned.
 * "llamacpp:predicted_tokens_seconds 45.6\n# HELP ...\n" ->
 * { "llamacpp:predicted_tokens_seconds": 45.6 }
 */
export function parsePrometheus(text: string): Record<string, number> {
  const out: Record<string, number> = {}
  for (const line of text.split("\n")) {
    if (line.startsWith("#") || line.trim() === "") continue
    // The value is the last token; a labeled series has its value before the label block.
    const match = line.match(/^([a-zA-Z0-9_:]+)\s+([0-9eE.+-]+)\s*(?:\{.*\})?$/)
    if (!match) continue
    const name = match[1]
    if (name in out) continue
    const value = Number(match[2])
    if (!Number.isFinite(value)) continue
    out[name] = value
  }
  return out
}

/**
 * Normalize llama.cpp metrics returned by llama-swap. Depending on the
 * upstream/version, `/metrics` can be Prometheus exposition or a JSON snapshot.
 * Keep the canonical Prometheus names consumed by shapeStatus so both formats
 * share one rendering path.
 */
export function parseMetrics(text: string): Record<string, number> {
  try {
    const raw: unknown = JSON.parse(text)
    if (raw && typeof raw === "object" && !Array.isArray(raw)) {
      const body = raw as {
        live?: Record<string, unknown>
        requests?: Array<Record<string, unknown>>
        hardware?: Record<string, unknown>
        engine?: Record<string, unknown>
      }
      const out: Record<string, number> = {}
      const put = (key: string, value: unknown) => {
        if (typeof value === "number" && Number.isFinite(value)) out[key] = value
      }
      put("llamacpp:predicted_tokens_seconds", body.live?.tok_s)
      put("llamacpp:json_tok_s_mean", body.live?.tok_s_mean ?? body.hardware?.tok_s_mean)
      put("llamacpp:prompt_tokens_seconds", body.live?.prefill_tok_s_mean ?? body.hardware?.prefill_tok_s_mean)

      const requests = body.requests ?? []
      if (requests.length > 0) {
        const latest = requests[0]
        put("llamacpp:json_hit_rate", latest.hit_rate)
        put("llamacpp:json_reused", latest.reused)
        put("llamacpp:json_prompt_tokens", latest.prompt_tokens)
        put("llamacpp:json_drafts_offered", latest.drafts_offered)
        put("llamacpp:json_drafts_accepted", latest.drafts_accepted)
      }
      // JSON snapshots provide explicit live state; preserve it as a numeric
      // processing gauge for shapeStatus, even when slots are unavailable.
      if (body.live?.state === "generating") out["llamacpp:requests_processing"] = 1
      else if (body.live?.state === "idle") out["llamacpp:requests_processing"] = 0
      put("llamacpp:json_busy_slots", body.live?.busy_slots)
      put("llamacpp:json_requests_processing", body.live?.requests_processing)
      return out
    }
  } catch {
    // The standard llama.cpp exposition format is not JSON.
  }
  return parsePrometheus(text)
}

/**
 * Turns the raw gateway data into the snapshot the UI renders.
 * Pure and deterministic, so it is unit-tested without network.
 */
export function shapeStatus(input: {
  modelId?: string
  meta?: ModelMetaRaw
  slots?: UpstreamSlotRaw[]
  metrics?: Record<string, number>
  performance?: { gpu?: GpuSampleRaw; sys?: SysSampleRaw }
  profiles?: ProfilesRaw
  version?: string
  modelCount?: number
  error?: string
  warning?: string
}): GatewayStatus {
  const m = input.metrics
  const slots = input.slots ?? []
  const active = slots.find((s) => s.is_processing === true) ?? slots[0]
  const usedContext = active?.is_processing === true
    ? active.n_prompt_tokens
    : slots.reduce((max, slot) => Math.max(max, slot.n_prompt_tokens ?? 0), 0) || undefined

  const promptTotal = m?.["llamacpp:prompt_tokens_total"] ?? 0
  const promptCached = m?.["llamacpp:prompt_tokens_cached_total"] ?? 0
  const promptAll = promptTotal + promptCached
  const cacheRatio = m?.["llamacpp:json_hit_rate"] ?? (promptAll > 0 ? promptCached / promptAll : undefined)

  const draftTokens = m?.["llamacpp:spec_decode_num_draft_tokens_total"] ?? m?.["llamacpp:json_drafts_offered"] ?? 0
  const acceptedTokens = m?.["llamacpp:spec_decode_num_accepted_tokens_total"] ?? m?.["llamacpp:json_drafts_accepted"] ?? 0
  const drafts = m?.["llamacpp:spec_decode_num_drafts_total"] ?? m?.["llamacpp:json_drafts_offered"] ?? 0
  const spec =
    draftTokens > 0 || drafts > 0
      ? {
          draftsTotal: drafts,
          draftTokensTotal: draftTokens,
          acceptedTokensTotal: acceptedTokens,
          acceptance: draftTokens > 0 ? acceptedTokens / draftTokens : undefined,
          acceptedPerDraft: drafts > 0 ? acceptedTokens / drafts : undefined,
        }
      : undefined

  const state =
    m !== undefined
      ? ((m["llamacpp:requests_processing"] ?? 0) > 0 ||
         active?.is_processing === true)
        ? "generating"
        : "idle"
      : input.meta?.status?.value === "loaded"
        ? "idle"
        : "unknown"

  return {
    modelId: input.modelId,
    modelName: input.meta?.name ?? input.modelId,
    modelDescription: input.meta?.description,
    contextLength:
      input.meta?.context_length ??
      input.meta?.meta?.llamaswap?.n_ctx ??
      active?.n_ctx,
    status: input.meta?.status?.value ?? (m ? "unknown" : "unknown"),
    live: {
      state,
      tokS: m?.["llamacpp:predicted_tokens_seconds"] ?? undefined,
      tokSMean: m?.["llamacpp:json_tok_s_mean"] ??
        (m && m["llamacpp:tokens_predicted_seconds_total"] > 0
          ? m["llamacpp:tokens_predicted_total"] / m["llamacpp:tokens_predicted_seconds_total"]
          : undefined),
      prefillTokS: m?.["llamacpp:prompt_tokens_seconds"] ?? undefined,
      requestsProcessing: m?.["llamacpp:json_requests_processing"] ?? m?.["llamacpp:requests_processing"] ?? undefined,
      busySlots: m?.["llamacpp:json_busy_slots"] ?? m?.["llamacpp:n_busy_slots_per_decode"] ??
        (state === "generating" ? 1 : state === "idle" ? 0 : undefined),
    },
    kv:
      slots.length > 0 || m?.["llamacpp:json_hit_rate"] !== undefined || m?.["llamacpp:json_reused"] !== undefined
        ? {
            // /slots is the live source for current context occupancy. The
            // JSON requests list is historical and must not be used as a live
            // fallback when slots are absent or temporarily empty.
            used: usedContext,
            total:
              active?.n_ctx ?? input.meta?.context_length,
            cacheRatio,
            cachedTokens: m?.["llamacpp:json_reused"] ?? (promptCached > 0 ? promptCached : undefined),
          }
        : undefined,
    spec,
    hardware:
      input.performance?.gpu || input.performance?.sys
        ? {
            gpuUtilPct: input.performance?.gpu?.gpu_util_pct,
            gpuTempC: input.performance?.gpu?.temp_c,
            gpuMemUsedMB: input.performance?.gpu?.mem_used_mb,
            gpuMemTotalMB: input.performance?.gpu?.mem_total_mb,
            powerDrawW: input.performance?.gpu?.power_draw_w,
            ramUsedMB: input.performance?.sys?.mem_used_mb,
            ramTotalMB: input.performance?.sys?.mem_total_mb,
            loadAvg: input.performance?.sys?.load_avg_1,
          }
        : undefined,
    version: input.version,
    modelCount: input.modelCount,
    error: input.error,
    warning: input.warning,
  }
}

/** Resolve the model to inspect in persistent gateway-load mode.
 * Prefer a model whose API status is loaded, then the active profile pin.
 */
export function resolveGatewayModel(
  models: readonly ModelMetaRaw[],
  activeProfileModel?: string,
): string | undefined {
  return (
    models.find((model) => model.status?.value === "loaded")?.id ??
    activeProfileModel ??
    models[0]?.id
  )
}

/** 113441 -> "113k", 1200 -> "1.2k", 900 -> "900". */
export function formatK(n: number): string {
  if (n < 1000) return String(n)
  if (n < 10_000) return `${(n / 1000).toFixed(1)}k`
  return `${Math.round(n / 1000)}k`
}

/** Megabytes -> "15.1 GB". */
export function formatGB(mb: number): string {
  return `${(mb / 1024).toFixed(1)} GB`
}

/** A ratio of 0.793 -> "79%". */
export function formatPercent(ratio: number): string {
  return `${Math.round(ratio * 100)}%`
}

/** 153.6 -> "154 W". */
export function formatWatts(w: number): string {
  return `${Math.round(w)} W`
}
