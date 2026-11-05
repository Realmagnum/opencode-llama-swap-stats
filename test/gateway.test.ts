import { test } from "node:test"
import assert from "node:assert"
import {
  gatewayRoot,
  parseMetrics,
  parsePrometheus,
  resolveBoundProviderId,
  resolveGatewayBase,
  resolveGatewayModel,
  shapeStatus,
  formatK,
  formatGB,
  formatPercent,
  formatWatts,
} from "../src/gateway.ts"
import type { ProviderRef } from "../src/gateway.ts"

const providers: ProviderRef[] = [
  { id: "anthropic", name: "Anthropic", baseURL: "https://api.anthropic.com" },
  {
    id: "llama-swap",
    name: "llama-swap",
    baseURL: "http://srv-test.ts.rmg7.com:9292/v1",
  },
  { id: "other", name: "Other 9292", baseURL: "http://other.example:9292/v1" },
]

test("gatewayRoot strips the trailing /v1", () => {
  assert.equal(gatewayRoot("http://h:9292/v1"), "http://h:9292")
  assert.equal(gatewayRoot("http://h:9292/v1/"), "http://h:9292")
  assert.equal(gatewayRoot("http://h:9292"), "http://h:9292")
  assert.equal(gatewayRoot("https://h"), "https://h")
  assert.equal(gatewayRoot(""), undefined)
  assert.equal(gatewayRoot(undefined), undefined)
  // Paths other than /v1 are left alone.
  assert.equal(gatewayRoot("http://h:9292/v1/extra"), "http://h:9292/v1/extra")
})

test("resolveGatewayBase follows the stored settings", () => {
  assert.equal(
    resolveGatewayBase({ boundProviderId: "auto" }, providers),
    "http://srv-test.ts.rmg7.com:9292",
  )
  assert.equal(
    resolveGatewayBase({ boundProviderId: "llama-swap" }, providers),
    "http://srv-test.ts.rmg7.com:9292",
  )
  assert.equal(
    resolveGatewayBase({ boundProviderId: "anthropic" }, providers),
    "https://api.anthropic.com",
  )
  assert.equal(
    resolveGatewayBase(
      { boundProviderId: "auto", customBaseUrl: "http://custom.example:9292/v1" },
      providers,
    ),
    "http://custom.example:9292",
  )
  assert.equal(
    resolveGatewayBase(
      { boundProviderId: "auto", customBaseUrl: "   " },
      providers,
    ),
    "http://srv-test.ts.rmg7.com:9292",
  )
  assert.equal(
    resolveGatewayBase({ boundProviderId: "nope" }, providers),
    undefined,
  )
})

test("resolveGatewayBase falls back to the :9292 port", () => {
  assert.equal(
    resolveGatewayBase({ boundProviderId: "auto" }, [
      { id: "other", name: "Other", baseURL: "http://other.example:9292/v1" },
    ]),
    "http://other.example:9292",
  )
  assert.equal(resolveGatewayBase({ boundProviderId: "auto" }, []), undefined)
  assert.equal(
    resolveGatewayBase(
      { boundProviderId: "auto" },
      [{ id: "x", name: "No URL" }],
    ),
    undefined,
  )
})

test("resolveBoundProviderId", () => {
  assert.equal(
    resolveBoundProviderId({ boundProviderId: "auto" }, providers),
    "llama-swap",
  )
  assert.equal(
    resolveBoundProviderId(
      { boundProviderId: "auto" },
      [{ id: "other", name: "Other", baseURL: "http://other.example:9292/v1" }],
    ),
    "other",
  )
  assert.equal(
    resolveBoundProviderId({ boundProviderId: "auto" }, []),
    undefined,
  )
  assert.equal(
    resolveBoundProviderId({ boundProviderId: "anthropic" }, providers),
    "anthropic",
  )
})

test("gateway-wide mode chooses the model loaded by Playground before profile pin", () => {
  const models = [
    { id: "profile-model", status: { value: "unloaded" } },
    { id: "playground-model", status: { value: "loaded" } },
  ]
  assert.equal(resolveGatewayModel(models, "profile-model"), "playground-model")
  assert.equal(resolveGatewayModel([{ id: "only-model" }], "profile-model"), "profile-model")
  assert.equal(resolveGatewayModel([{ id: "only-model" }]), "only-model")
  assert.equal(resolveGatewayModel([]), undefined)
})

test("parsePrometheus reads bare series and skips labels and help", () => {
  const text = [
    "# HELP llamacpp:predicted_tokens_seconds gauge",
    "# TYPE llamacpp:predicted_tokens_seconds gauge",
    "llamacpp:predicted_tokens_seconds 45.6114",
    "llamacpp:requests_processing 0",
    "llamacpp:spec_decode_num_accepted_tokens_per_pos_total{position=\"0\"} 394",
    "llamacpp:nan nan",
  ].join("\n")
  const out = parsePrometheus(text)
  assert.equal(out["llamacpp:predicted_tokens_seconds"], 45.6114)
  assert.equal(out["llamacpp:requests_processing"], 0)
  assert.equal(out["llamacpp:spec_decode_num_accepted_tokens_per_pos_total"], undefined)
  assert.equal(out["llamacpp:nan"], undefined)
})

test("parseMetrics normalizes llama-swap JSON snapshots and retains Prometheus fallback", () => {
  const json = parseMetrics(JSON.stringify({
    live: { state: "generating", tok_s: 34.8, tok_s_mean: 40.4, prefill_tok_s_mean: 845 },
    requests: [{ prompt_tokens: 9811, reused: 1270, hit_rate: 0.5, drafts_offered: 20, drafts_accepted: 12 }],
  }))
  assert.equal(json["llamacpp:predicted_tokens_seconds"], 34.8)
  assert.equal(json["llamacpp:json_tok_s_mean"], 40.4)
  assert.equal(json["llamacpp:prompt_tokens_seconds"], 845)
  assert.equal(json["llamacpp:requests_processing"], 1)
  assert.equal(json["llamacpp:json_prompt_tokens"], 9811)
  assert.equal(json["llamacpp:json_hit_rate"], 0.5)
  assert.equal(json["llamacpp:json_reused"], 1270)
  assert.equal(json["llamacpp:json_drafts_offered"], 20)
  assert.equal(json["llamacpp:json_drafts_accepted"], 12)

  const status = shapeStatus({ metrics: json })
  assert.equal(status.live.state, "generating")
  assert.equal(status.live.tokSMean, 40.4)
  assert.equal(status.live.busySlots, 1)
  assert.equal(status.kv?.cacheRatio, 0.5)
  assert.equal(status.kv?.cachedTokens, 1270)
  assert.equal(status.spec?.draftTokensTotal, 20)
  assert.equal(status.spec?.acceptedTokensTotal, 12)

  const prometheus = parseMetrics("llamacpp:predicted_tokens_seconds 45.6")
  assert.equal(prometheus["llamacpp:predicted_tokens_seconds"], 45.6)
})

test("shapeStatus reflects the live gateway state", () => {
  const metrics: Record<string, number> = {
    "llamacpp:predicted_tokens_seconds": 45.6,
    "llamacpp:tokens_predicted_total": 1705,
    "llamacpp:tokens_predicted_seconds_total": 35.6,
    "llamacpp:prompt_tokens_seconds": 326.4,
    "llamacpp:prompt_tokens_total": 80963,
    "llamacpp:prompt_tokens_cached_total": 404734,
    "llamacpp:requests_processing": 1,
    "llamacpp:n_busy_slots_per_decode": 1,
    "llamacpp:spec_decode_num_drafts_total": 531,
    "llamacpp:spec_decode_num_accepted_tokens_total": 1174,
    "llamacpp:spec_decode_num_draft_tokens_total": 2112,
  }
  const slots = [
    { id: 0, n_ctx: 262144, is_processing: false },
    { id: 1, n_ctx: 262144, is_processing: true, n_prompt_tokens: 79864 },
  ]
  const meta = {
    id: "mirai-s-llama.cpp*mtp4-ngram-2slot-27b*262k-UNC",
    name: "mirai-s-llama.cpp*mtp4-ngram-2slot-27b*262k-UNC",
    description: "Playground model description",
    context_length: 262144,
    status: { value: "loaded" },
  }
  const s = shapeStatus({
    modelId: meta.id,
    meta,
    slots,
    metrics,
    version: "v265",
    modelCount: 27,
  })

  assert.equal(s.live.state, "generating")
  assert.equal(s.live.tokS, 45.6)
  assert.equal(s.live.tokSMean, 1705 / 35.6)
  assert.equal(s.live.prefillTokS, 326.4)
  assert.equal(s.live.requestsProcessing, 1)
  assert.equal(s.live.busySlots, 1)
  assert.equal(s.kv?.used, 79864)
  assert.equal(s.kv?.total, 262144)
  assert.equal(s.kv?.cacheRatio, 404734 / (80963 + 404734))
  assert.equal(s.kv?.cachedTokens, 404734)
  assert.equal(s.spec?.acceptance, 1174 / 2112)
  assert.equal(s.spec?.acceptedPerDraft, 1174 / 531)
  assert.equal(s.modelName, meta.name)
  assert.equal(s.modelDescription, meta.description)
  assert.equal(s.contextLength, 262144)
  assert.equal(s.status, "loaded")
  assert.equal(s.version, "v265")
  assert.equal(s.modelCount, 27)
})

test("shapeStatus reports idle without metrics", () => {
  const s = shapeStatus({
    modelId: "m",
    meta: { id: "m", status: { value: "loaded" } },
    slots: [{ id: 0, n_ctx: 1000 }],
  })
  assert.equal(s.live.state, "idle")
  assert.equal(s.kv?.total, 1000)
  assert.equal(s.kv?.used, undefined)
  assert.equal(s.spec, undefined)
  assert.equal(s.hardware, undefined)
})

test("KV context usage follows the active slot and does not use historical request prompt", () => {
  const active = shapeStatus({
    slots: [
      { id: 0, n_ctx: 262144, is_processing: false, n_prompt_tokens: 12000 },
      { id: 1, n_ctx: 262144, is_processing: true, n_prompt_tokens: 6405 },
    ],
    metrics: { "llamacpp:json_prompt_tokens": 9811 },
  })
  assert.equal(active.kv?.used, 6405)
  assert.equal(active.kv?.total, 262144)

  const idle = shapeStatus({
    slots: [
      { id: 0, n_ctx: 262144, is_processing: false, n_prompt_tokens: 12000 },
      { id: 1, n_ctx: 262144, is_processing: false, n_prompt_tokens: 6405 },
    ],
    metrics: { "llamacpp:json_prompt_tokens": 9811 },
  })
  assert.equal(idle.kv?.used, 12000)

  const missingSlots = shapeStatus({ metrics: { "llamacpp:json_prompt_tokens": 9811 } })
  assert.equal(missingSlots.kv, undefined)
})

test("busy-slots-per-decode alone does not mean generation is active", () => {
  const s = shapeStatus({
    metrics: {
      "llamacpp:requests_processing": 0,
      "llamacpp:n_busy_slots_per_decode": 1,
    },
    slots: [{ id: 0, n_ctx: 1000, is_processing: false }],
  })
  assert.equal(s.live.state, "idle")
  assert.equal(s.live.busySlots, 1)
})

test("shapeStatus with hardware samples", () => {
  const s = shapeStatus({
    modelId: "m",
    performance: {
      gpu: {
        name: "RTX 4060 Ti",
        temp_c: 65,
        gpu_util_pct: 92,
        mem_used_mb: 15316,
        mem_total_mb: 16380,
        power_draw_w: 153.6,
      },
      sys: { mem_used_mb: 22902, mem_total_mb: 65292, load_avg_1: 0.12 },
    },
  })
  assert.equal(s.hardware?.gpuUtilPct, 92)
  assert.equal(s.hardware?.gpuTempC, 65)
  assert.equal(s.hardware?.gpuMemUsedMB, 15316)
  assert.equal(s.hardware?.gpuMemTotalMB, 16380)
  assert.equal(s.hardware?.powerDrawW, 153.6)
  assert.equal(s.hardware?.ramUsedMB, 22902)
  assert.equal(s.hardware?.ramTotalMB, 65292)
  assert.equal(s.hardware?.loadAvg, 0.12)
})

test("shapeStatus without metrics or slots has no kv", () => {
  const s = shapeStatus({ modelId: "m", version: "v265", modelCount: 27 })
  assert.equal(s.live.state, "unknown")
  assert.equal(s.kv, undefined)
})

test("formatters", () => {
  assert.equal(formatK(900), "900")
  assert.equal(formatK(1200), "1.2k")
  assert.equal(formatK(113441), "113k")
  assert.equal(formatGB(10240), "10.0 GB")
  assert.equal(formatGB(16380), "16.0 GB")
  assert.equal(formatPercent(0.793), "79%")
  assert.equal(formatWatts(153.6), "154 W")
})
