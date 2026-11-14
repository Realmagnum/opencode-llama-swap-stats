import { createEffect, createSignal, onCleanup } from "solid-js"
import { Show } from "solid-js"
import type { Accessor } from "solid-js"
import { Plugin, SettingsPage, Slot, Store, Style, TitlebarItem } from "@opencode/plugin/gui"
import type { Ipc, IpcClient, Persisted, SessionScreen, TitlebarItem as TitlebarItemType } from "@opencode/plugin/gui"
import { Gateway, type GatewayStatus } from "./contract"
import { HeaderWidget } from "./components/header-widget"
import { StatsPopover } from "./components/stats-popover"
import {
  DEFAULT_SETTINGS,
  LlamaSwapSettingsSchema,
  POLL_MAX_MS,
  POLL_MIN_MS,
  type PluginSettings,
  type StoredSettings,
} from "./settings"
import {
  gatewayRoot,
  parseMetrics,
  resolveBoundProviderId,
  resolveGatewayBase,
  resolveGatewayModel,
  shapeStatus,
  formatPercent,
  type GpuSampleRaw,
  type ModelMetaRaw,
  type ProfilesRaw,
  type ProviderRef,
  type SysSampleRaw,
  type UpstreamSlotRaw,
} from "./gateway"
import { SettingsView } from "./settings-view"

/**
 * The GUI half. The window renders the header widget and the dashboard
 * dialog; the main process (below) performs every HTTP request to the
 * gateway, so the renderer's CSP and CORS never get involved.
 */
export default Plugin.define({
  stores: {
    settings: Store.global(LlamaSwapSettingsSchema, DEFAULT_SETTINGS),
  },
  i18n: {
    en: {
      "widget.title": "Llama-Swap monitor — click for live stats",
      "widget.offline": "llama-swap offline",
      "widget.gatewayPrefix": "gateway",
      "widget.loading": "connecting…",
      "widget.waiting": "waiting for model",
      "widget.cache": "cache",
      "widget.kv": "KV",
      "unit.toks": "tok/s",
      "unit.token": "tok",
      "stats.title": "Llama-Swap",
      "stats.modelLabel": "Model",
      "stats.modelFull": "Full model name",
      "stats.hdrGen": "generating…",
      "stats.section.speed": "Speed",
      "stats.section.kv": "KV cache",
      "stats.section.spec": "Speculative decoding",
      "stats.section.hw": "Hardware",
      "stats.row.generate": "Live",
      "stats.row.mean": "Mean",
      "stats.row.prefill": "Prefill",
      "stats.row.busy": "Active model / slots",
      "stats.row.kv": "Slot context used (estimate)",
      "stats.row.cache": "Last request hit rate",
      "stats.row.reused": "Cached tokens",
      "stats.row.drafts": "Draft acceptance",
      "stats.row.accepted": "Accepted per draft",
      "stats.row.power": "Power",
      "stats.row.ram": "RAM",
      "stats.row.load": "Load",
      "stats.row.models": "models",
      "stats.row.context": "context",
      "stats.gateway": "gateway",
      "stats.openUi": "Open gateway",
      "stats.close": "Close",
      "dialog.title": "Llama-Swap stats",
      "dialog.gatewayLoad": "Loaded model",
      "dialog.loading": "loading model…",
      "settings.title": "Llama-Swap stats",
      "settings.description":
        "Live monitoring of your llama-swap gateway: generation speed, prompt-cache reuse, speculative decoding acceptance and hardware telemetry.",
      "settings.provider": "Provider",
      "settings.providerLabel": "Bound provider",
      "settings.providerAuto": "auto (detect llama-swap)",
      "settings.resolvedTo": "resolves to",
      "settings.noMatch": "no llama-swap provider found",
      "settings.noGateway": "no gateway URL to test",
      "settings.gatewayUrl": "Gateway URL",
      "settings.gatewayUrlHint": "Leave empty to use the provider's base URL",
      "settings.resolvedBase": "gateway root",
      "settings.test": "Test connection",
      "settings.testOk": "connected",
      "settings.polling": "Behavior",
      "settings.pollInterval": "Poll interval",
      "settings.pollIntervalHint": "How often the widget refreshes",
      "settings.hideInactive": "Hide the widget unless the session uses this provider",
      "settings.alwaysShowLoad": "Always show loaded model in every session",
      "settings.alwaysShowLoadHint": "Uses the loaded model from the gateway instead of the session model",
      "settings.hw": "Show hardware stats",
      "settings.spec": "Show speculative decoding stats",
      "settings.reset": "Reset to defaults",
      "settings.loadingProviders": "loading providers…",
    },
    ru: {
      "widget.title": "Монитор Llama-Swap — нажмите для подробной статистики",
      "widget.offline": "llama-swap не в сети",
      "widget.gatewayPrefix": "gateway",
      "widget.loading": "подключение…",
      "widget.waiting": "ожидание модели",
      "widget.cache": "кэш",
      "widget.kv": "KV",
      "unit.toks": "ток/с",
      "unit.token": "ток.",
      "stats.title": "Llama-Swap",
      "stats.modelLabel": "Модель",
      "stats.modelFull": "Полное название модели",
      "stats.hdrGen": "генерация…",
      "stats.section.speed": "Скорость",
      "stats.section.kv": "KV-кэш",
      "stats.section.spec": "Спекулятивное декодирование",
      "stats.section.hw": "Железо",
      "stats.row.generate": "Текущая",
      "stats.row.mean": "Средняя",
      "stats.row.prefill": "Префилл",
      "stats.row.busy": "Активная модель / слоты",
      "stats.row.kv": "Контекст слота (оценка)",
      "stats.row.cache": "Попадание последнего запроса",
      "stats.row.reused": "Токены из кэша",
      "stats.row.drafts": "Принятие черновиков",
      "stats.row.accepted": "Принято за черновик",
      "stats.row.power": "Потребление",
      "stats.row.ram": "ОЗУ",
      "stats.row.load": "Нагрузка",
      "stats.row.models": "моделей",
      "stats.row.context": "контекст",
      "stats.gateway": "gateway",
      "stats.openUi": "Открыть gateway",
      "stats.close": "Закрыть",
      "dialog.title": "Статистика Llama-Swap",
      "dialog.gatewayLoad": "Загруженная модель",
      "dialog.loading": "загрузка модели…",
      "settings.title": "Статистика Llama-Swap",
      "settings.description":
        "Живой мониторинг вашего llama-swap gateway: скорость генерации, попадания в кэш промптов, принятие спекулятивных черновиков и телеметрия железа.",
      "settings.provider": "Провайдер",
      "settings.providerLabel": "Связанный провайдер",
      "settings.providerAuto": "авто (найти llama-swap)",
      "settings.resolvedTo": "привязан к",
      "settings.noMatch": "провайдер llama-swap не найден",
      "settings.noGateway": "нет URL gateway для проверки",
      "settings.gatewayUrl": "URL gateway",
      "settings.gatewayUrlHint": "Оставьте пустым, чтобы использовать URL провайдера из opencode.json",
      "settings.resolvedBase": "корень gateway",
      "settings.test": "Проверить связь",
      "settings.testOk": "подключено",
      "settings.polling": "Поведение",
      "settings.pollInterval": "Интервал опроса",
      "settings.pollIntervalHint": "Как часто виджет обновляется",
      "settings.hideInactive": "Скрывать виджет, если сессия на другом провайдере",
      "settings.alwaysShowLoad": "Всегда показывать загруженную модель в любой сессии",
      "settings.alwaysShowLoadHint": "Используется загруженная модель gateway, а не модель сессии",
      "settings.hw": "Показывать статистику железа",
      "settings.spec": "Показывать статистику спекулятивного декодирования",
      "settings.reset": "Сбросить к значениям по умолчанию",
      "settings.loadingProviders": "загрузка провайдеров…",
    },
  },
  setup(ctx) {
    const client = ctx.main(Gateway)

    const settings = (): PluginSettings => ({
      ...DEFAULT_SETTINGS,
      ...ctx.stores.settings.value,
    })

    const [providers, setProviders] =
      createSignal<readonly ProviderRef[] | undefined>(undefined)

    void client
      .listProviders()
      .then((r) => setProviders(r.providers))
      .catch((err) => console.error("llama-swap-stats: listProviders failed", err))

    const gatewayBase = () => resolveGatewayBase(settings(), providers() ?? [])
    const boundProviderId = () => resolveBoundProviderId(settings(), providers() ?? [])
    const [gatewayStatus, setGatewayStatus] = createSignal<GatewayStatus | undefined>()

    let gatewayTicking = false
    const pollGatewayLoad = async () => {
      if (gatewayTicking) return
      gatewayTicking = true
      try {
        const baseURL = gatewayBase()
        if (!settings().alwaysShowCurrentLoad || !baseURL) {
          setGatewayStatus(undefined)
          return
        }
        setGatewayStatus(await client.getStatus({
          baseURL,
          includeHardware: settings().showHardwareStats,
        }))
      } catch (error) {
        setGatewayStatus({ live: { state: "unknown" }, error: String(error) })
        console.error("llama-swap-stats: global gateway poll failed", error)
      } finally {
        gatewayTicking = false
      }
    }

    // This poller belongs to the plugin window, not a session screen. It
    // keeps working on routes such as Playground where session.header is absent.
    createEffect(() => {
      const enabled = settings().alwaysShowCurrentLoad
      const base = gatewayBase()
      const interval = Math.min(POLL_MAX_MS, Math.max(POLL_MIN_MS, settings().pollIntervalMs))
      if (!enabled || !base) {
        setGatewayStatus(undefined)
        return
      }
      void pollGatewayLoad()
      const timer = setInterval(() => void pollGatewayLoad(), interval)
      onCleanup(() => clearInterval(timer))
    })

    const openGatewayDashboard = () => ctx.dialogs.open((dialog) => (
      <ctx.ui.Dialog
        title={gatewayStatus()?.modelId ?? ctx.t("dialog.gatewayLoad")}
        description={gatewayStatus()?.version
          ? `${ctx.t("stats.gateway")} ${gatewayStatus()?.version} · ${gatewayStatus()?.status ?? ""}`
          : undefined}
        size="fit"
        footer={<div style={{ display: "flex", gap: "8px", width: "100%", "justify-content": "flex-end" }}>
          <Show when={gatewayBase()}>
            <ctx.ui.Button variant="ghost" onClick={() => {
              const base = gatewayBase()
              if (base) ctx.system.openExternal(`${base}/`)
            }}>{ctx.t("stats.openUi")}</ctx.ui.Button>
          </Show>
          <ctx.ui.Button variant="neutral" onClick={dialog.close} autofocus>{ctx.t("stats.close")}</ctx.ui.Button>
        </div>}
      >
        <StatsPopover status={gatewayStatus} showHardware={() => settings().showHardwareStats} showSpeculative={() => settings().showSpeculativeStats} t={(key) => ctx.t(key)} />
      </ctx.ui.Dialog>
    ))

    ctx.add(TitlebarItem, (): TitlebarItemType | undefined => {
      if (!settings().alwaysShowCurrentLoad) return undefined
      const status = gatewayStatus()
      const modelName = status?.modelId?.split("*")[0] ?? "llama-swap"
      const label = status?.live.state === "generating" && status.live.tokS !== undefined
        ? `${status.live.tokS.toFixed(1)} ${ctx.t("unit.toks")}${status.kv?.cacheRatio !== undefined ? ` · ${formatPercent(status.kv.cacheRatio)} ${ctx.t("widget.cache")}` : ""}`
        : status?.warning && status.live.tokS === undefined
          ? `${modelName} · ${ctx.t("widget.waiting")}`
          : modelName
      return {
        id: "gateway-load",
        icon: "waveform",
        label,
        title: status?.modelId ? `${status.modelId} — ${ctx.t("widget.title")}` : ctx.t("widget.title"),
        run: openGatewayDashboard,
      }
    })

    function SessionMonitor(props: {
      screen: SessionScreen
      active: Accessor<boolean>
    }) {
      const [status, setStatus] = createSignal<GatewayStatus | undefined>()
      const sessionVisible = () => {
        const model = props.screen.composer.model()
        const bound = boundProviderId()
        return !!model && model.providerID === bound
      }
      let ticking = false
      let tickAgain = false

      const visible = () => {
        if (!props.active() || !gatewayBase()) return false
        if (settings().alwaysShowCurrentLoad) return true
        return !settings().hideWhenInactive || sessionVisible()
      }

      const tick = async () => {
        if (ticking) {
          tickAgain = true
          return
        }
        ticking = true
        try {
          if (settings().alwaysShowCurrentLoad) {
            setStatus(gatewayStatus())
            return
          }
          const model = props.screen.composer.model()
          const base = gatewayBase()
          const bound = boundProviderId()
          // Never fall back to the gateway's active profile here: the snapshot
          // must describe this exact session's selected model.
          if (!props.active() || !base) {
            setStatus(undefined)
            return
          }
          const globalLoad = settings().alwaysShowCurrentLoad
          if (!globalLoad && (!model || model.providerID !== bound)) {
            setStatus(undefined)
            return
          }
          const requestedModel = globalLoad ? undefined : model?.modelID
          const next = await client.getStatus({
            baseURL: base,
            modelId: requestedModel,
            includeHardware: settings().showHardwareStats,
          })
          const currentModel = props.screen.composer.model()
          if (globalLoad && settings().alwaysShowCurrentLoad && props.active()) {
            setStatus(next)
            return
          }
          if (
            props.active() &&
            !settings().alwaysShowCurrentLoad &&
            currentModel?.providerID === bound &&
            currentModel?.modelID === requestedModel
          ) {
            setStatus(next)
          } else {
            setStatus(undefined)
          }
        } catch (err) {
          setStatus({ live: { state: "unknown" }, error: String(err) })
          console.error("llama-swap-stats: getStatus failed", err)
        } finally {
          ticking = false
          if (tickAgain) {
            tickAgain = false
            void tick()
          }
        }
      }

      createEffect(() => {
        const interval = Math.min(POLL_MAX_MS, Math.max(POLL_MIN_MS, settings().pollIntervalMs))
        const timer = setInterval(() => void tick(), interval)
        onCleanup(() => clearInterval(timer))
      })
      createEffect(() => {
        props.active()
        const model = props.screen.composer.model()
        const matchesProvider = sessionVisible()
        const alwaysShow = settings().alwaysShowCurrentLoad
        settings().showHardwareStats
        if (!alwaysShow && (!model || !matchesProvider)) setStatus(undefined)
        void tick()
      })

      const openDashboard = () => ctx.dialogs.open((dialog) => (
          <ctx.ui.Dialog
          title={settings().alwaysShowCurrentLoad
            ? `${ctx.t("dialog.gatewayLoad")}: ${status()?.modelId ?? ctx.t("dialog.loading")}`
            : status()?.modelId ?? ctx.t("dialog.title")}
          description={status()?.version ? `${ctx.t("stats.gateway")} ${status()?.version} · ${status()?.status ?? ""}` : undefined}
          size="fit"
          footer={
            <div style={{ display: "flex", gap: "8px", width: "100%", "justify-content": "flex-end" }}>
              <Show when={gatewayBase() !== undefined}>
                <ctx.ui.Button variant="ghost" onClick={() => {
                  const base = gatewayBase()
                  if (base) ctx.system.openExternal(`${base}/`)
                }}>{ctx.t("stats.openUi")}</ctx.ui.Button>
              </Show>
              <ctx.ui.Button variant="neutral" onClick={dialog.close} autofocus>{ctx.t("stats.close")}</ctx.ui.Button>
            </div>
          }
        >
          <StatsPopover status={status} showHardware={() => settings().showHardwareStats} showSpeculative={() => settings().showSpeculativeStats} t={(k) => ctx.t(k)} />
        </ctx.ui.Dialog>
      ))

      return <HeaderWidget
        visible={visible}
        status={status}
        globalMode={() => settings().alwaysShowCurrentLoad}
        open={openDashboard}
        t={(k) => ctx.t(k)}
      />
    }

    ctx.add(Style, `
      @keyframes llama-swap-pulse {
        0%, 100% { opacity: 1; transform: scale(1); }
        50% { opacity: 0.4; transform: scale(0.8); }
      }
      [data-component=dialog-v2]:has(.llama-swap-stats-dialog-content) {
        justify-content: flex-end;
        padding-right: 24px;
      }
      [data-component=dialog-v2]:has(.llama-swap-stats-dialog-content) [data-slot=dialog-container] {
        height: auto;
      }
    `)

    ctx.add(Style, `
      @keyframes llama-swap-pulse {
        0%, 100% { opacity: 1; transform: scale(1); }
        50% { opacity: 0.4; transform: scale(0.8); }
      }
      [data-component=dialog-v2]:has(.llama-swap-stats-dialog-content) {
        justify-content: flex-end;
        padding-right: 24px;
      }
      [data-component=dialog-v2]:has(.llama-swap-stats-dialog-content) [data-slot=dialog-container] {
        height: auto;
      }

      /* Distinct highlight for plugin navigation item in Settings sidebar */
      .settings-nav-groups [data-slot="tabs-v2-trigger-wrapper"][data-value="llama-swap-stats"] [data-slot="tabs-v2-trigger"] svg {
        color: #9d7cd8 !important;
      }

      /* Plugin settings gear button in Extensions -> Plugins list */
      .plugin-settings-gear-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 24px;
        height: 24px;
        padding: 0;
        border-radius: 4px;
        background: transparent;
        border: none;
        color: var(--v2-text-text-muted, #8a8a8a);
        cursor: pointer;
        transition: color 0.15s ease, background-color 0.15s ease;
        flex-shrink: 0;
      }
      .plugin-settings-gear-btn:hover {
        color: #b392f0 !important;
        background-color: var(--v2-background-bg-layer-02, rgba(255, 255, 255, 0.08));
      }
      .plugin-settings-gear-btn svg {
        width: 16px;
        height: 16px;
      }
    `)

    function setupExtensionSettingsGearInjection(pluginId: string, pageId: string) {
      if (typeof document === "undefined") return

      const GEAR_SVG = `<svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M7.62516 4.46094L5.05225 3.86719L3.86475 5.05469L4.4585 7.6276L2.0835 9.21094V10.7943L4.4585 12.3776L3.86475 14.9505L5.05225 16.138L7.62516 15.5443L9.2085 17.9193H10.7918L12.3752 15.5443L14.9481 16.138L16.1356 14.9505L15.5418 12.3776L17.9168 10.7943V9.21094L15.5418 7.6276L16.1356 5.05469L14.9481 3.86719L12.3752 4.46094L10.7918 2.08594H9.2085L7.62516 4.46094Z" stroke="currentColor"/><path d="M12.5002 10.0026C12.5002 11.3833 11.3809 12.5026 10.0002 12.5026C8.61945 12.5026 7.50016 11.3833 7.50016 10.0026C7.50016 8.62189 8.61945 7.5026 10.0002 7.5026C11.3809 7.5026 12.5002 8.62189 12.5002 10.0026Z" stroke="currentColor"/></svg>`

      function navigateToSettings() {
        const trigger = document.querySelector(
          `.settings-nav-groups [data-slot="tabs-v2-trigger-wrapper"][data-value="${pageId}"] button, .settings-nav-groups [data-slot="tabs-v2-trigger-wrapper"][data-value="${pageId}"] [data-slot="tabs-v2-trigger"]`
        ) as HTMLElement | null

        if (trigger) {
          trigger.click()
          return
        }

        const url = new URL(window.location.href)
        url.searchParams.set("tab", pageId)
        window.history.pushState({}, "", url.toString())
        window.dispatchEvent(new PopStateEvent("popstate"))
      }

      function injectGearButton() {
        const rows = document.querySelectorAll(".settings-extension-row")
        for (const row of Array.from(rows)) {
          const nameEl = row.querySelector(".settings-extension-name")
          if (!nameEl) continue

          const text = nameEl.textContent?.trim() || ""
          if (text.includes(pluginId)) {
            const actions = row.querySelector(".settings-servers-actions")
            if (actions && !actions.querySelector(`.${pageId}-settings-btn`)) {
              const btn = document.createElement("button")
              btn.type = "button"
              btn.className = `plugin-settings-gear-btn ${pageId}-settings-btn`
              btn.title = "Open settings"
              btn.setAttribute("aria-label", "Open settings")
              btn.innerHTML = GEAR_SVG

              btn.addEventListener("click", (e) => {
                e.preventDefault()
                e.stopPropagation()
                navigateToSettings()
              })

              actions.insertBefore(btn, actions.firstElementChild)
            }
          }
        }
      }

      injectGearButton()
      const observer = new MutationObserver(() => injectGearButton())
      observer.observe(document.body, { childList: true, subtree: true })
    }

    ctx.add(Slot, {
      at: "session.header",
      render: (input) => <SessionMonitor screen={input.screen} active={() => input.active} />,
    })
    // TitlebarItems render in the sidebar footer. The monitor belongs beside the
    // titlebar controls instead, so its pill is moved into the sidebar header and
    // kept next to the Session Timestamps clock; the footer is its home when the
    // header (or that clock) is not on screen.
    function setupHeaderIcon() {
      if (typeof document === "undefined") return

      let frame: number | undefined

      const place = () => {
        frame = undefined

        const item = Array.from(document.querySelectorAll<HTMLElement>('[data-slot="titlebar-update"]')).find((element) =>
          element.querySelector("button")?.getAttribute("aria-label")?.includes("Llama-Swap"),
        )

        if (!item) return

        const button = item.querySelector("button")
        const label = button?.getAttribute("aria-label")

        if (button && label && button.title !== label) button.title = label

        const clock = document.querySelector<HTMLElement>('[data-ocst-kind="toggle"]')
        const toggle = Array.from(
          document.querySelectorAll<HTMLElement>('button[aria-controls="vertical-tabs-sidebar"]'),
        ).find((element) => !element.closest('[data-slot="collapsed-sidebar-toggle"]'))
        const anchor = clock ?? toggle
        const header = anchor?.parentElement
        const footer = document.querySelector<HTMLElement>('[data-slot="vertical-tabs-footer"]')

        const move = (parent: HTMLElement, before: HTMLElement) => {
          if (item.parentElement === parent && item.nextElementSibling === before) return
          parent.insertBefore(item, before)
          item.setAttribute("data-llama-header-item", "")
        }

        if (header && anchor) {
          move(header, anchor)

          return
        }

        if (footer && item.parentElement !== footer) {
          footer.append(item)
          item.removeAttribute("data-llama-header-item")
        }
      }

      const schedule = () => {
        if (frame !== undefined) return
        frame = requestAnimationFrame(place)
      }

      const observer = new MutationObserver(schedule)
      observer.observe(document.body, { childList: true, subtree: true })
      place()

      onCleanup(() => {
        observer.disconnect()
        if (frame !== undefined) cancelAnimationFrame(frame)
      })
    }

    // Match the Session Timestamps clock beside it: a ghost 28px button with a
    // 16px muted icon and the same radius and hover wash, not the filled accent
    // pill the footer uses.
    ctx.add(Style, `
      [data-llama-header-item] {
        align-self: auto !important;
        border-radius: 6px !important;
        background: transparent !important;
        transition: none !important;
      }
      [data-llama-header-item] > button {
        border-radius: 6px !important;
        color: var(--v2-icon-icon-muted, #8a8a8a);
        transition: color 120ms ease, background-color 120ms ease;
      }
      [data-llama-header-item] > button > span svg {
        width: 16px;
        height: 16px;
      }
      [data-llama-header-item]:hover > button,
      [data-llama-header-item]:focus-within > button {
        background: var(--v2-overlay-simple-overlay-hover, rgba(255, 255, 255, 0.06));
        color: var(--v2-text-text-base, #eeeeee);
      }
      [data-llama-header-item] [data-slot="titlebar-update-label"] { display: none !important; }
    `)

    setupHeaderIcon()


    ctx.add(SettingsPage, () => ({
      id: "llama-swap-stats",
      icon: "waveform" as const,
      title: ctx.t("settings.title"),
      render: () => (
        <SettingsTab
          store={ctx.stores.settings}
          providers={providers}
          resolvedBase={gatewayBase}
          resolvedProviderId={boundProviderId}
          t={(k) => ctx.t(k)}
          client={client}
        />
      ),
    }))

    setupExtensionSettingsGearInjection("llama-swap-stats", "llama-swap-stats")
  },
  main(ctx) {
    ctx.log.write("info", "llama-swap-stats main ready", {
      version: ctx.app.version,
    })

    let metaCache: { root: string; at: number; models: ModelMetaRaw[] } | undefined
    let versionCache: { at: number; version: string } | undefined

    const withTimeout = async <T,>(
      parentSignal: AbortSignal,
      timeoutMs: number,
      run: (signal: AbortSignal) => Promise<T>,
    ): Promise<T> => {
      const controller = new AbortController()
      const abort = () => controller.abort(parentSignal.reason)
      parentSignal.addEventListener("abort", abort, { once: true })
      const timer = setTimeout(() => controller.abort(new Error(`timeout after ${timeoutMs}ms`)), timeoutMs)
      try {
        return await run(controller.signal)
      } finally {
        clearTimeout(timer)
        parentSignal.removeEventListener("abort", abort)
      }
    }

    const fetchJson = async <T,>(
      url: string,
      signal: AbortSignal,
    ): Promise<T> => {
      return withTimeout(signal, 8000, async (requestSignal) => {
        const res = await fetch(url, { signal: requestSignal })
        if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`)
        return res.json() as Promise<T>
      })
    }
    const fetchText = async (url: string, signal: AbortSignal): Promise<string> => {
      return withTimeout(signal, 3000, async (requestSignal) => {
        const res = await fetch(url, { signal: requestSignal })
        if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`)
        return res.text()
      })
    }

    const fetchModels = async (
      root: string,
      signal: AbortSignal,
      maxAgeMs = 60_000,
    ): Promise<ModelMetaRaw[]> => {
      if (metaCache && metaCache.root === root && Date.now() - metaCache.at < maxAgeMs)
        return metaCache.models
      const body = (await fetchJson(`${root}/v1/models`, signal)) as
        | ModelMetaRaw[]
        | { data?: ModelMetaRaw[] }
      const models: ModelMetaRaw[] = Array.isArray(body) ? body : (body.data ?? [])
      metaCache = { root, at: Date.now(), models }
      return models
    }

    const fetchVersion = async (
      root: string,
      signal: AbortSignal,
    ): Promise<string | undefined> => {
      if (versionCache && Date.now() - versionCache.at < 10 * 60_000)
        return versionCache.version
      try {
        const body = (await fetchJson(`${root}/api/version`, signal)) as {
          version?: string
        }
        if (body.version)
          versionCache = { at: Date.now(), version: body.version }
        return body.version ?? versionCache?.version
      } catch {
        return versionCache?.version
      }
    }

    ctx.provide(Gateway, {
      listProviders: async (_input, _caller) => {
        const { data } = await ctx.client.provider.list()
        return {
          providers: data.map((p) => ({
            id: p.id,
            name: p.name ?? p.id,
            baseURL: p.settings?.baseURL,
          })),
        }
      },
      testConnection: async (input, caller) => {
        const root = gatewayRoot(input.baseURL)
        if (!root) return { ok: false, error: "empty URL" }
        const started = Date.now()
        try {
          const body = (await fetchJson(`${root}/api/version`, caller.signal)) as {
            version?: string
          }
          return { ok: true, version: body.version, ms: Date.now() - started }
        } catch (err) {
          return { ok: false, error: String(err) }
        }
      },
      getStatus: async (input, caller) => {
        const root = gatewayRoot(input.baseURL)
        if (!root) throw new Error("empty gateway root")
        try {
          let modelId = input.modelId
          // Playground can load/switch models while OpenCode's session model
          // remains unchanged. Refresh this catalog almost immediately in
          // gateway-wide mode so its `loaded` status tracks Playground.
          const modelsPromise = fetchModels(root, caller.signal, input.modelId ? 60_000 : 750)
          if (!modelId) {
            const [profiles, models] = await Promise.all([
              fetchJson<ProfilesRaw>(`${root}/api/profiles`, caller.signal),
              modelsPromise,
            ])
            const activeProfile = profiles.profiles?.find((profile) => profile.id === profiles.active)
            modelId = resolveGatewayModel(models, activeProfile?.pins?.assistant)
          }
          if (!modelId) {
            return shapeStatus({
              version: await fetchVersion(root, caller.signal),
              modelCount: (await modelsPromise).length,
              error: "active profile has no pinned assistant model",
            })
          }
          const modelIdEnc = encodeURIComponent(modelId)
          const [models, slotsResult, metricsResult] = await Promise.all([
            modelsPromise,
            fetchJson<UpstreamSlotRaw[]>(
              `${root}/upstream/${modelIdEnc}/slots`,
              caller.signal,
            ).then((value) => ({ value })).catch((error) => ({ error })),
            fetchText(`${root}/upstream/${modelIdEnc}/metrics`, caller.signal)
              .then((value) => ({ value }))
              .catch((error) => ({ error })),
          ])

          let meta: ModelMetaRaw | undefined
          for (const m of models) {
            if (m.id === modelId) {
              meta = m
              break
            }
          }

          let performance: { gpu?: GpuSampleRaw; sys?: SysSampleRaw } | undefined
          if (input.includeHardware) {
            try {
              const perf = (await fetchJson(
                `${root}/api/performance`,
                caller.signal,
              )) as { gpu_stats?: GpuSampleRaw[]; sys_stats?: SysSampleRaw[] }
              performance = {
                gpu: perf.gpu_stats?.[perf.gpu_stats.length - 1],
                sys: perf.sys_stats?.[perf.sys_stats.length - 1],
              }
            } catch {
              performance = undefined
            }
          }

          const metricsText = "value" in metricsResult ? metricsResult.value : ""
          const slots = "value" in slotsResult ? slotsResult.value : []
          const warning = [
            "error" in slotsResult ? `slots: ${String(slotsResult.error)}` : undefined,
            "error" in metricsResult ? `metrics: ${String(metricsResult.error)}` : undefined,
          ].filter(Boolean).join("; ") || undefined

          return shapeStatus({
            modelId,
            meta,
            slots,
            metrics: parseMetrics(metricsText),
            performance,
            version: await fetchVersion(root, caller.signal),
            modelCount: models.length,
            warning,
          })
        } catch (err) {
          return {
            live: { state: "unknown" },
            modelId: input.modelId,
            error: String(err),
          }
        }
      },
    })
  },
})

/**
 * The settings page. The provider list, the resolved gateway root and the
 * resolved provider id are passed in as accessors so the page re-renders
 * when they arrive or change.
 */
type GatewayClient = typeof Gateway extends Ipc<infer S> ? IpcClient<S> : never

function SettingsTab(props: {
  store: Persisted<StoredSettings>
  providers: Accessor<readonly ProviderRef[] | undefined>
  resolvedBase: Accessor<string | undefined>
  resolvedProviderId: Accessor<string | undefined>
  t: (key: string) => string
  client: GatewayClient
}) {
  const settings = (): PluginSettings => ({
    ...DEFAULT_SETTINGS,
    ...props.store.value,
  })

  const update = (patch: Partial<PluginSettings>) => {
    props.store.update((draft) => {
      Object.assign(draft, patch)
      return undefined
    })
  }

  const reset = () => {
    props.store.set(DEFAULT_SETTINGS)
  }

  return (
    <SettingsView
      settings={settings}
      providers={props.providers}
      resolvedBase={props.resolvedBase}
      resolvedProviderId={props.resolvedProviderId}
      update={update}
      reset={reset}
      t={props.t}
      test={(url) => props.client.testConnection({ baseURL: url })}
    />
  )
}
