import { Schema } from "effect"

/**
 * "auto" means: find the provider whose id or name is "llama-swap" (or whose
 * base URL points at port 9292) and follow it. Anything else is a provider id.
 */
export const LlamaSwapSettingsSchema = Schema.Struct({
  boundProviderId: Schema.String,
  /** Manually overrides the gateway root URL, e.g. "http://srv-test.ts.rmg7.com:9292". */
  customBaseUrl: Schema.optional(Schema.String),
  /** How often the window polls the gateway while the widget is visible. */
  pollIntervalMs: Schema.Number,
  /** Hide the widget unless the routed session uses the bound provider. */
  hideWhenInactive: Schema.Boolean,
  /** Always show the gateway's active-profile load, regardless of session model. */
  alwaysShowCurrentLoad: Schema.optional(Schema.Boolean),
  showHardwareStats: Schema.Boolean,
  showSpeculativeStats: Schema.Boolean,
})

export type StoredSettings = typeof LlamaSwapSettingsSchema.Type

export interface PluginSettings {
  boundProviderId: string
  customBaseUrl: string
  pollIntervalMs: number
  hideWhenInactive: boolean
  alwaysShowCurrentLoad: boolean
  showHardwareStats: boolean
  showSpeculativeStats: boolean
}

export const DEFAULT_SETTINGS: PluginSettings = {
  boundProviderId: "auto",
  customBaseUrl: "",
  pollIntervalMs: 500,
  hideWhenInactive: true,
  alwaysShowCurrentLoad: false,
  showHardwareStats: true,
  showSpeculativeStats: true,
}

export const POLL_MIN_MS = 500
export const POLL_MAX_MS = 10000
