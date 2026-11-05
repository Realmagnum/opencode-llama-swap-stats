import type { Accessor } from "solid-js"
import { createSignal, For, Show } from "solid-js"
import {
  DEFAULT_SETTINGS,
  POLL_MAX_MS,
  POLL_MIN_MS,
  type PluginSettings,
} from "./settings"
import type { ProviderRef } from "./gateway"

/** The result of a connection test, as returned by the Ipc. */
export interface TestResult {
  ok: boolean
  version?: string
  ms?: number
  error?: string
}

interface Props {
  settings: () => PluginSettings
  /** undefined while the provider list is still loading */
  providers: Accessor<readonly ProviderRef[] | undefined>
  resolvedBase: Accessor<string | undefined>
  resolvedProviderId: Accessor<string | undefined>
  update(patch: Partial<PluginSettings>): void
  reset(): void
  t: (key: string) => string
  test: (baseURL: string) => Promise<TestResult>
}

const sectionHeader: Record<string, string> = {
  "font-size": "14px",
  "font-weight": "600",
  "margin-top": "24px",
  "margin-bottom": "12px",
  color: "var(--text-default, #eceff4)",
  "border-bottom": "1px solid var(--border-subtle, rgba(255, 255, 255, 0.1))",
  "padding-bottom": "6px",
}

const cardStyle: Record<string, string> = {
  background: "var(--background-surface, rgba(255, 255, 255, 0.03))",
  border: "1px solid var(--border-default, rgba(255, 255, 255, 0.08))",
  "border-radius": "8px",
  padding: "16px",
  display: "flex",
  "flex-direction": "column",
  gap: "14px",
}

const fieldRow: Record<string, string> = {
  display: "flex",
  "justify-content": "space-between",
  "align-items": "center",
  gap: "16px",
}

const labelStyle: Record<string, string> = {
  "font-size": "13px",
  color: "var(--text-default, #eceff4)",
  display: "flex",
  "flex-direction": "column",
  gap: "2px",
}

const subLabelStyle: Record<string, string> = {
  "font-size": "11px",
  color: "var(--text-subdued, #94a3b8)",
}

const inputStyle: Record<string, string> = {
  background: "var(--background-input, rgba(0, 0, 0, 0.25))",
  border: "1px solid var(--border-default, rgba(255, 255, 255, 0.15))",
  color: "var(--text-default, #eceff4)",
  "border-radius": "6px",
  padding: "6px 10px",
  "font-size": "13px",
  outline: "none",
  width: "340px",
}

const buttonStyle: Record<string, string> = {
  background: "var(--background-action-neutral, rgba(255, 255, 255, 0.08))",
  border: "1px solid var(--border-default, rgba(255, 255, 255, 0.15))",
  color: "var(--text-default, #eceff4)",
  "border-radius": "6px",
  padding: "6px 12px",
  "font-size": "12px",
  cursor: "pointer",
}

export function SettingsView(props: Props) {
  const c = () => ({ ...DEFAULT_SETTINGS, ...props.settings() })
  const [testResult, setTestResult] = createSignal<TestResult | undefined>(undefined)

  let testing = false
  const runTest = () => {
    if (testing) return
    const base = c().customBaseUrl || props.resolvedBase()
    if (!base) {
      setTestResult({ ok: false, error: props.t("settings.noGateway") })
      return
    }
    testing = true
    void props
      .test(base)
      .then((r) => setTestResult(r))
      .catch((e) => setTestResult({ ok: false, error: String(e) }))
      .finally(() => (testing = false))
  }

  return (
    <div
      style={{
        "max-width": "700px",
        padding: "16px 8px 48px",
        font: "13px/1.5 system-ui, sans-serif",
      }}
    >
      <div style={{ "margin-bottom": "20px" }}>
        <div style={{ display: "flex", "align-items": "center", gap: "8px", "margin-bottom": "4px" }}>
          <h2
            style={{
              "font-size": "18px",
              "font-weight": "600",
              margin: "0",
              color: "var(--text-default, #eceff4)",
            }}
          >
            {props.t("settings.title")}
          </h2>
          <span
            style={{
              "font-size": "11px",
              "font-weight": "500",
              color: "#b392f0",
              background: "rgba(157, 124, 216, 0.15)",
              border: "1px solid rgba(157, 124, 216, 0.35)",
              "border-radius": "10px",
              padding: "1px 7px",
              "line-height": "1.4",
            }}
          >
            Plugin
          </span>
        </div>
        <p style={{ "font-size": "12.5px", color: "var(--text-subdued, #94a3b8)", margin: "0" }}>
          {props.t("settings.description")}
        </p>
      </div>

      {/* Provider */}
      <div style={sectionHeader}>{props.t("settings.provider")}</div>
      <div style={cardStyle}>
        <div style={fieldRow}>
          <div style={labelStyle}>
            <span>{props.t("settings.providerLabel")}</span>
            <span style={subLabelStyle}>
              {props.resolvedProviderId() !== undefined
                ? `${props.t("settings.resolvedTo")}: ${props.resolvedProviderId()}`
                : props.t("settings.noMatch")}
            </span>
          </div>
          <Show when={props.providers() !== undefined}>
            <select
              style={inputStyle}
              value={c().boundProviderId}
              onChange={(e) => props.update({ boundProviderId: e.currentTarget.value })}
            >
              <option value="auto">{props.t("settings.providerAuto")}</option>
              <For each={props.providers() ?? []}>
                {(p) => (
                  <option value={p.id}>
                    {p.name} ({p.id})
                  </option>
                )}
              </For>
            </select>
          </Show>
          <Show when={props.providers() === undefined}>
            <span style={subLabelStyle}>{props.t("settings.loadingProviders")}</span>
          </Show>
        </div>
        <div style={fieldRow}>
          <div style={labelStyle}>
            <span>{props.t("settings.gatewayUrl")}</span>
            <span style={subLabelStyle}>{props.t("settings.gatewayUrlHint")}</span>
          </div>
          <input
            type="text"
            style={inputStyle}
            placeholder={props.resolvedBase() ?? ""}
            value={c().customBaseUrl}
            onInput={(e) => props.update({ customBaseUrl: e.currentTarget.value })}
          />
        </div>
        <Show when={props.resolvedBase() !== undefined}>
          <div style={fieldRow}>
            <span style={subLabelStyle}>
              {`${props.t("settings.resolvedBase")}: ${props.resolvedBase() ?? ""}`}
            </span>
            <button type="button" style={buttonStyle} onClick={runTest}>
              {props.t("settings.test")}
            </button>
          </div>
        </Show>
        <Show when={testResult()}>
          <div style={{ "font-size": "12px" }}>
            <Show when={testResult()?.ok === true}>
              <span style={{ color: "#22c55e" }}>
                {testResult()?.version
                  ? `${props.t("settings.testOk")} · ${testResult()?.version} · ${testResult()?.ms} ms`
                  : props.t("settings.testOk")}
              </span>
            </Show>
            <Show when={testResult()?.ok === false}>
              <span style={{ color: "#f87171" }}>{testResult()?.error ?? "?"}</span>
            </Show>
          </div>
        </Show>
      </div>

      {/* Polling & visibility */}
      <div style={sectionHeader}>{props.t("settings.polling")}</div>
      <div style={cardStyle}>
        <div style={fieldRow}>
          <div style={labelStyle}>
            <span>{props.t("settings.pollInterval")}</span>
            <span style={subLabelStyle}>
              {props.t("settings.pollIntervalHint")} ({c().pollIntervalMs} ms)
            </span>
          </div>
          <input
            type="range"
            min={POLL_MIN_MS}
            max={POLL_MAX_MS}
            step="100"
            value={c().pollIntervalMs}
            onInput={(e) => props.update({ pollIntervalMs: Number(e.currentTarget.value) })}
          />
        </div>
        <div style={fieldRow}>
          <div style={labelStyle}>
            <span>{props.t("settings.hideInactive")}</span>
          </div>
          <input
            type="checkbox"
            checked={c().hideWhenInactive}
            onChange={(e) => props.update({ hideWhenInactive: e.currentTarget.checked })}
          />
        </div>
        <div style={fieldRow}>
          <div style={labelStyle}>
            <span>{props.t("settings.alwaysShowLoad")}</span>
            <span style={subLabelStyle}>{props.t("settings.alwaysShowLoadHint")}</span>
          </div>
          <input
            type="checkbox"
            checked={c().alwaysShowCurrentLoad}
            onChange={(e) => props.update({ alwaysShowCurrentLoad: e.currentTarget.checked })}
          />
        </div>
        <div style={fieldRow}>
          <div style={labelStyle}>
            <span>{props.t("settings.hw")}</span>
          </div>
          <input
            type="checkbox"
            checked={c().showHardwareStats}
            onChange={(e) => props.update({ showHardwareStats: e.currentTarget.checked })}
          />
        </div>
        <div style={fieldRow}>
          <div style={labelStyle}>
            <span>{props.t("settings.spec")}</span>
          </div>
          <input
            type="checkbox"
            checked={c().showSpeculativeStats}
            onChange={(e) => props.update({ showSpeculativeStats: e.currentTarget.checked })}
          />
        </div>
      </div>

      {/* Reset */}
      <div style={{ "margin-top": "24px", display: "flex", "justify-content": "flex-end" }}>
        <button type="button" style={{ ...buttonStyle, color: "#f87171" }} onClick={props.reset}>
          {props.t("settings.reset")}
        </button>
      </div>
    </div>
  )
}
