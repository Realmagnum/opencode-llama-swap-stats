import type { Accessor } from "solid-js"
import { Show } from "solid-js"
import type { GatewayStatus } from "../contract"
import { formatK, formatPercent } from "../gateway"

/**
 * The compact pill rendered in the session header slot. It reflects the
 * gateway's live state:
 *  - idle: model name + KV usage,
 *  - generating: live tok/s and cache reuse rate,
 *  - offline: gray "offline" label.
 * Clicking it opens the detailed dashboard dialog.
 */
export function HeaderWidget(props: {
  visible: Accessor<boolean>
  status: Accessor<GatewayStatus | undefined>
  globalMode?: Accessor<boolean>
  open: () => void
  t: (key: string) => string
}) {
  const generating = () => props.status()?.live.state === "generating"
  const offline = () =>
    props.status() === undefined || props.status()?.error !== undefined

  /** The model's recognizable short name: the first "*" segment of its id. */
  const shortName = () => {
    const s = props.status()
    if (!s) return "llama-swap"
    return s.modelId?.split("*")[0] ?? s.modelName ?? "llama-swap"
  }

  const label = () => {
    const s = props.status()
    const globalMode = props.globalMode?.() ?? false
    if (offline()) return props.t("widget.offline")
    if (!s) return globalMode ? props.t("widget.loading") : shortName()
    if (s.warning && s.live.tokS === undefined)
      return `${shortName()} · ${props.t("widget.waiting")}`
    if (generating()) {
      const tok = s.live.tokS !== undefined ? `${s.live.tokS.toFixed(1)} ${props.t("unit.toks")}` : ""
      const hit =
        s.kv?.cacheRatio !== undefined
          ? ` · ${formatPercent(s.kv.cacheRatio)} ${props.t("widget.cache")}`
          : ""
      return globalMode ? `${tok}${hit}` : `${shortName()} · ${tok}${hit}`
    }
    if (s.kv?.used !== undefined && s.kv?.total !== undefined)
      return `${shortName()} · ${formatK(s.kv.used)}/${formatK(s.kv.total)} ${props.t("widget.kv")}`
    return shortName()
  }

  const dotColor = () => {
    if (offline()) return "#6b7280"
    if (props.status()?.warning && props.status()?.live.tokS === undefined) return "#f59e0b"
    return generating() ? "#22c55e" : "#65a30d"
  }

  const tooltip = () => {
    const model = props.status()?.modelId
    const base = props.t("widget.title")
    return model ? `${model}\n${base}` : base
  }

  return (
    <Show when={props.visible}>
      <button
        onClick={props.open}
        title={tooltip()}
        style={{
          display: "inline-flex",
          "align-items": "center",
          gap: "6px",
          padding: "3px 8px",
          "border-radius": "999px",
          border: "1px solid #333",
          background: "rgba(255,255,255,0.04)",
          color: "#e5e5e5",
          font: "inherit",
          "font-size": "11px",
          cursor: "pointer",
          "max-width": "220px",
          "white-space": "nowrap",
        }}
      >
        <span
          style={{
            width: "7px",
            height: "7px",
            "border-radius": "50%",
            background: dotColor(),
            display: "inline-block",
            animation: generating()
              ? "llama-swap-pulse 1.2s ease-in-out infinite"
              : "none",
          }}
        />
        <span
          title={props.status()?.modelId ?? tooltip()}
          style={{ overflow: "hidden", "text-overflow": "ellipsis" }}
        >
          {label()}
        </span>
      </button>
    </Show>
  )
}
