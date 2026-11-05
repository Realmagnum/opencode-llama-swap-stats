import type { Accessor, JSX } from "solid-js"
import { Show } from "solid-js"
import type { GatewayStatus } from "../contract"
import { formatGB, formatK, formatPercent, formatWatts } from "../gateway"

const row: Record<string, string> = {
  display: "flex",
  "justify-content": "space-between",
  gap: "12px",
  "font-size": "12px",
  "line-height": "1.6",
  color: "#d4d4d4",
}

const label: Record<string, string> = { color: "#a3a3a3" }
const value: Record<string, string> = {
  "font-variant-numeric": "tabular-nums",
  "text-align": "right",
}

function Section(props: {
  title: string
  children: JSX.Element
  visible: Accessor<boolean>
}) {
  return (
    <Show when={props.visible}>
      <div style={{ "margin-bottom": "10px" }}>
        <div
          style={{
            "font-size": "10px",
            "text-transform": "uppercase",
            "letter-spacing": "0.08em",
            color: "#8b8b8b",
            "margin-bottom": "4px",
          }}
        >
          {props.title}
        </div>
        <div>{props.children}</div>
      </div>
    </Show>
  )
}

/**
 * The dashboard dialog opened by clicking the header pill. It shows the
 * gateway snapshot: live speed, prefill, KV cache reuse, speculative
 * decoding acceptance and host hardware telemetry.
 */
export function StatsPopover(props: {
  status: Accessor<GatewayStatus | undefined>
  showHardware: Accessor<boolean>
  showSpeculative: Accessor<boolean>
  t: (key: string) => string
}) {
  const s = () => props.status()

  return (
    <div
      class="llama-swap-stats-dialog-content"
      style={{ display: "flex", "flex-direction": "column", gap: "4px", width: "100%" }}
    >
      <Show when={s()?.modelDescription}>
        <div
          style={{
            "white-space": "pre-wrap",
            "overflow-wrap": "anywhere",
            "max-height": "35vh",
            "overflow-y": "auto",
            "font-size": "11px",
            "line-height": "1.5",
            color: "#a3a3a3",
            "padding-bottom": "8px",
            "margin-bottom": "8px",
            "border-bottom": "1px solid rgba(255,255,255,0.1)",
          }}
        >
          {s()?.modelDescription}
        </div>
      </Show>
      <Show when={s()?.warning}>
        <div
          style={{
            padding: "6px 8px",
            "margin-bottom": "8px",
            "border-radius": "5px",
            background: "rgba(245,158,11,0.12)",
            color: "#fbbf24",
            "font-size": "11px",
          }}
        >
          {s()?.warning}
        </div>
      </Show>

      <Section title={props.t("stats.section.speed")} visible={() => true}>
        <div style={row}>
          <span style={label}>{props.t("stats.row.generate")}</span>
          <span style={value}>
            {s()?.live.tokS !== undefined
              ? `${s()?.live.tokS?.toFixed(1)} tok/s`
              : "—"}
          </span>
        </div>
        <div style={row}>
          <span style={label}>{props.t("stats.row.mean")}</span>
          <span style={value}>
            {s()?.live.tokSMean !== undefined
              ? `${s()?.live.tokSMean?.toFixed(1)} tok/s`
              : "—"}
          </span>
        </div>
        <div style={row}>
          <span style={label}>{props.t("stats.row.prefill")}</span>
          <span style={value}>
            {s()?.live.prefillTokS !== undefined
              ? `${s()?.live.prefillTokS?.toFixed(0)} tok/s`
              : "—"}
          </span>
        </div>
        <div style={row}>
          <span style={label}>{props.t("stats.row.busy")}</span>
          <span style={value}>
            {s()?.live.busySlots !== undefined
              ? `${s()?.live.busySlots ?? 0}${
                  s()?.live.requestsProcessing
                    ? ` · ${s()?.live.requestsProcessing ?? 0}`
                    : ""
                }`
              : "—"}
          </span>
        </div>
      </Section>

      <Section title={props.t("stats.section.kv")} visible={() => true}>
        <div style={row}>
          <span style={label}>{props.t("stats.row.kv")}</span>
          <span style={value}>
            {s()?.kv?.used !== undefined && s()?.kv?.total !== undefined
              ? `${formatK(s()?.kv?.used ?? 0)} / ${formatK(s()?.kv?.total ?? 0)}`
              : "—"}
          </span>
        </div>
        <div style={row}>
          <span style={label}>{props.t("stats.row.cache")}</span>
          <span style={value}>
            {s()?.kv?.cacheRatio !== undefined
              ? formatPercent(s()?.kv?.cacheRatio ?? 0)
              : "—"}
          </span>
        </div>
        <div style={row}>
          <span style={label}>{props.t("stats.row.reused")}</span>
          <span style={value}>
            {s()?.kv?.cachedTokens !== undefined
              ? formatK(s()?.kv?.cachedTokens ?? 0)
              : "—"}
          </span>
        </div>
        <div style={row}>
          <span style={label}>{props.t("stats.row.context")}</span>
          <span style={value}>
            {s()?.contextLength !== undefined ? formatK(s()?.contextLength ?? 0) : "—"}
          </span>
        </div>
      </Section>

      <Section
        title={props.t("stats.section.spec")}
        visible={props.showSpeculative}
      >
        <div style={row}>
          <span style={label}>{props.t("stats.row.drafts")}</span>
          <span style={value}>
            {s()?.spec?.acceptance !== undefined
              ? `${s()?.spec?.acceptedTokensTotal ?? 0}/${s()?.spec?.draftTokensTotal ?? 0} (${formatPercent(s()?.spec?.acceptance ?? 0)})`
              : "—"}
          </span>
        </div>
        <div style={row}>
          <span style={label}>{props.t("stats.row.accepted")}</span>
          <span style={value}>
            {s()?.spec?.acceptedPerDraft !== undefined
              ? `${s()?.spec?.acceptedPerDraft?.toFixed(1)} tok`
              : "—"}
          </span>
        </div>
      </Section>

      <Section
        title={props.t("stats.section.hw")}
        visible={props.showHardware}
      >
        <div style={row}>
          <span style={label}>GPU</span>
          <span style={value}>
            {s()?.hardware?.gpuUtilPct !== undefined
              ? `${s()?.hardware?.gpuUtilPct ?? 0}% · ${s()?.hardware?.gpuTempC ?? "—"}°C`
              : "—"}
          </span>
        </div>
        <div style={row}>
          <span style={label}>VRAM</span>
          <span style={value}>
            {s()?.hardware?.gpuMemUsedMB !== undefined &&
            s()?.hardware?.gpuMemTotalMB !== undefined
              ? `${formatGB(s()?.hardware?.gpuMemUsedMB ?? 0)} / ${formatGB(s()?.hardware?.gpuMemTotalMB ?? 0)}`
              : "—"}
          </span>
        </div>
        <div style={row}>
          <span style={label}>{props.t("stats.row.power")}</span>
          <span style={value}>
            {s()?.hardware?.powerDrawW !== undefined
              ? formatWatts(s()?.hardware?.powerDrawW ?? 0)
              : "—"}
          </span>
        </div>
        <div style={row}>
          <span style={label}>{props.t("stats.row.ram")}</span>
          <span style={value}>
            {s()?.hardware?.ramUsedMB !== undefined &&
            s()?.hardware?.ramTotalMB !== undefined
              ? `${formatGB(s()?.hardware?.ramUsedMB ?? 0)} / ${formatGB(s()?.hardware?.ramTotalMB ?? 0)}`
              : "—"}
          </span>
        </div>
        <div style={row}>
          <span style={label}>{props.t("stats.row.load")}</span>
          <span style={value}>
            {s()?.hardware?.loadAvg !== undefined
              ? s()?.hardware?.loadAvg?.toFixed(2)
              : "—"}
          </span>
        </div>
      </Section>

      <Show when={s()?.modelCount !== undefined || s()?.version !== undefined}>
        <span style={{ "font-size": "11px", color: "#8b8b8b" }}>
          {s()?.version !== undefined ? `gateway ${s()?.version} · ` : ""}
          {s()?.modelCount !== undefined
            ? `${s()?.modelCount ?? 0} ${props.t("stats.row.models")} · `
            : ""}
          {s()?.contextLength !== undefined
            ? `${formatK(s()?.contextLength ?? 0)} ${props.t("stats.row.context")}`
            : ""}
        </span>
      </Show>
    </div>
  )
}
