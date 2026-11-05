import { Schema } from "effect"
import { Ipc } from "@opencode/plugin/gui"

/**
 * The Ipc bridge to the main process. Every call to the llama-swap gateway
 * runs in main, where there is no browser CSP or CORS. The window calls
 * these methods through `ctx.main(Gateway)`.
 */

/** One snapshot of the gateway, as shown by the header widget and the popover. */
export const GatewayStatusSchema = Schema.Struct({
  modelId: Schema.optional(Schema.String),
  modelName: Schema.optional(Schema.String),
  modelDescription: Schema.optional(Schema.String),
  contextLength: Schema.optional(Schema.Number),
  /** "loaded", "unloaded", or "unknown". */
  status: Schema.optional(Schema.String),
  live: Schema.Struct({
    /** "idle", "generating", or "unknown". */
    state: Schema.String,
    /** Instantaneous decode rate, tokens/second. */
    tokS: Schema.optional(Schema.Number),
    /** Average decode rate over the counters' lifetime. */
    tokSMean: Schema.optional(Schema.Number),
    /** Instantaneous prefill rate, tokens/second. */
    prefillTokS: Schema.optional(Schema.Number),
    requestsProcessing: Schema.optional(Schema.Number),
    busySlots: Schema.optional(Schema.Number),
  }),
  kv: Schema.optional(
    Schema.Struct({
      /** Prompt tokens resident in the slots right now. */
      used: Schema.optional(Schema.Number),
      /** The slots' context limit, in tokens. */
      total: Schema.optional(Schema.Number),
      /** Cumulative share of prompt tokens served from the cache, 0..1. */
      cacheRatio: Schema.optional(Schema.Number),
      /** Cumulative prompt tokens served from the cache. */
      cachedTokens: Schema.optional(Schema.Number),
    }),
  ),
  spec: Schema.optional(
    Schema.Struct({
      draftsTotal: Schema.optional(Schema.Number),
      draftTokensTotal: Schema.optional(Schema.Number),
      acceptedTokensTotal: Schema.optional(Schema.Number),
      /** Accepted draft tokens / offered draft tokens, 0..1. */
      acceptance: Schema.optional(Schema.Number),
      /** Average accepted tokens per draft round. */
      acceptedPerDraft: Schema.optional(Schema.Number),
    }),
  ),
  hardware: Schema.optional(
    Schema.Struct({
      gpuUtilPct: Schema.optional(Schema.Number),
      gpuTempC: Schema.optional(Schema.Number),
      gpuMemUsedMB: Schema.optional(Schema.Number),
      gpuMemTotalMB: Schema.optional(Schema.Number),
      powerDrawW: Schema.optional(Schema.Number),
      ramUsedMB: Schema.optional(Schema.Number),
      ramTotalMB: Schema.optional(Schema.Number),
      loadAvg: Schema.optional(Schema.Number),
    }),
  ),
  /** The gateway's version, e.g. "v265", when known. */
  version: Schema.optional(Schema.String),
  /** How many models the gateway lists. */
  modelCount: Schema.optional(Schema.Number),
  error: Schema.optional(Schema.String),
  warning: Schema.optional(Schema.String),
})

export type GatewayStatus = typeof GatewayStatusSchema.Type

export const Gateway = Ipc.define({
  id: "llama-swap-stats.gateway",
  methods: {
    /** The providers configured in OpenCode, with their base URLs. */
    listProviders: {
      output: Schema.Struct({
        providers: Schema.Array(
          Schema.Struct({
            id: Schema.String,
            name: Schema.String,
            baseURL: Schema.optional(Schema.String),
          }),
        ),
      }),
    },
    /** Health check against the gateway's /api/version. */
    testConnection: {
      input: Schema.Struct({ baseURL: Schema.String }),
      output: Schema.Struct({
        ok: Schema.Boolean,
        version: Schema.optional(Schema.String),
        ms: Schema.optional(Schema.Number),
        error: Schema.optional(Schema.String),
      }),
    },
    /** Fetch a live snapshot for a selected session model or the gateway's active profile. */
    getStatus: {
      input: Schema.Struct({
        baseURL: Schema.String,
        modelId: Schema.optional(Schema.String),
        includeHardware: Schema.Boolean,
      }),
      output: GatewayStatusSchema,
    },
  },
})
