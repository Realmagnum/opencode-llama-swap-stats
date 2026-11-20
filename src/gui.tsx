import { createEffect, createSignal, onCleanup } from "solid-js"
import { createMutationGate } from "opencode-plugin-dom"
import { Show } from "solid-js"
import type { Accessor } from "solid-js"
import { Plugin, SettingsPage, Slot, Store, Style } from "@opencode/plugin/gui"
import type { Ipc, IpcClient, Persisted, SessionScreen } from "@opencode/plugin/gui"
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
    `)

    ctx.add(Slot, {
      at: "session.header",
      render: (input) => <SessionMonitor screen={input.screen} active={() => input.active} />,
    })
    // The sidebar header has no plugin slot, so the gateway pill is this plugin's
    // own button, inserted beside the Session Timestamps clock. Nothing the host
    // owns is moved: relocating its TitlebarItem made the host rebuild it under
    // the pointer, and the two fought at the pass rate. The gate wakes only for a
    // batch that can move the button, at most once per interval.
    function setupHeaderButton() {
      if (typeof document === "undefined") return

      const HEADER_ANCHOR = '[data-ocst-kind="toggle"], button[aria-controls="vertical-tabs-sidebar"]'
      const ICON = `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><path d="M2.5 10h1.8M6.8 6.2v7.6M10 3.4v13.2M13.2 7.4v5.2M17.5 9.4v1.2"/></svg>`
      let button: HTMLButtonElement | undefined

      const ensure = () => {
        if (button) return button

        button = document.createElement("button")
        button.type = "button"
        button.className = "llama-swap-header-toggle"
        button.dataset.llamaHeaderToggle = ""
        button.innerHTML = ICON
        button.addEventListener("click", (event) => {
          event.preventDefault()
          event.stopPropagation()
          openGatewayDashboard()
        })

        return button
      }

      /** The header control the button sits before, when the header is on screen. */
      const header = () => {
        const clock = document.querySelector<HTMLElement>('[data-ocst-kind="toggle"]')
        const toggle = Array.from(
          document.querySelectorAll<HTMLElement>('button[aria-controls="vertical-tabs-sidebar"]'),
        ).find((element) => !element.closest('[data-slot="collapsed-sidebar-toggle"]'))
        const anchor = clock ?? toggle

        return anchor?.parentElement ? { container: anchor.parentElement, before: anchor } : undefined
      }

      const paint = (element: HTMLButtonElement) => {
        const status = gatewayStatus()
        const modelName = status?.modelId?.split("*")[0] ?? "llama-swap"
        const label =
          status?.live.state === "generating" && status.live.tokS !== undefined
            ? `${status.live.tokS.toFixed(1)} ${ctx.t("unit.toks")}`
            : status?.warning && status.live.tokS === undefined
              ? `${modelName} · ${ctx.t("widget.waiting")}`
              : modelName
        const title = status?.modelId ? `${status.modelId} — ${ctx.t("widget.title")}` : ctx.t("widget.title")

        if (element.getAttribute("aria-label") !== label) element.setAttribute("aria-label", label)
        if (element.title !== title) element.title = title
        element.dataset.on = status?.live.state === "generating" ? "true" : "false"
      }

      /**
       * True when `element` sits before `other` among the same parent's children.
       * A sibling walk, not `compareDocumentPosition`: the header is a handful of
       * children, and the check stays easy to test with a fake DOM.
       */
      const elementPrecedes = (element: Element, other: Element) => {
        if (element === other || element.parentElement !== other.parentElement) return false

        for (let node = element.nextElementSibling; node; node = node.nextElementSibling) {
          if (node === other) return true
        }

        return false
      }

      const place = () => {
        const element = ensure()

        if (!settings().alwaysShowCurrentLoad) {
          element.remove()

          return
        }

        paint(element)

        const slot = header()

        if (!slot) {
          element.remove()

          return
        }

        // "Somewhere before the anchor" rather than "immediately before it": another
        // plugin may legitimately insert its own control in between, and demanding
        // the exact sibling made the two re-insert themselves at the pass rate.
        if (!elementPrecedes(element, slot.before)) slot.container.insertBefore(element, slot.before)
      }

      // Runs for every batch, so it does no lookup of its own: only a change inside
      // the header, or to the button itself, can move it.
      const relevant = (records: readonly MutationRecord[]) => {
        for (const record of records) {
          if (record.type !== "childList") continue

          const target = record.target

          if (!(target instanceof Element)) continue
          if (target === document.body) return true
          if (target.closest(HEADER_ANCHOR)) return true
          if (button && (target === button || button.contains(target))) return true

          for (const added of record.addedNodes) {
            if (added === button) return true
            if (added instanceof Element && added.querySelector(HEADER_ANCHOR)) return true
          }

          for (const removed of record.removedNodes) {
            if (removed === button) return true
            if (removed instanceof Element && removed.querySelector(HEADER_ANCHOR)) return true
          }
        }

        return false
      }

      const gate = createMutationGate({ run: place, relevant, interval: 250 })

      // The pill follows the gateway's live state and the setting that hides it,
      // repainting on its own rather than waiting for a DOM batch.
      createEffect(() => {
        gatewayStatus()
        settings().alwaysShowCurrentLoad
        gate.schedule()
      })

      place()

      onCleanup(() => {
        gate.stop()
        button?.remove()
      })
    }

    setupHeaderButton()

    // Match the Session Timestamps clock beside it: a ghost 28px button with a
    // 16px muted icon and the same radius and hover wash.
    ctx.add(Style, `
      .llama-swap-header-toggle {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 28px;
        height: 28px;
        flex: none;
        padding: 0;
        border: 0;
        border-radius: 6px;
        background: transparent;
        color: var(--v2-icon-icon-muted, light-dark(#5f5f5f, #8a8a8a));
        cursor: pointer;
        app-region: no-drag;
        -webkit-app-region: no-drag;
        transition: color 120ms ease, background-color 120ms ease;
      }
      .llama-swap-header-toggle svg { width: 16px; height: 16px; }
      .llama-swap-header-toggle:hover,
      .llama-swap-header-toggle:focus-visible {
        background: var(--v2-overlay-simple-overlay-hover, light-dark(rgba(0, 0, 0, 0.05), rgba(255, 255, 255, 0.06)));
        color: var(--v2-text-text-base, light-dark(#1f1f1f, #eeeeee));
      }
      .llama-swap-header-toggle[data-on="true"] { color: var(--v2-text-text-base, light-dark(#1f1f1f, #eeeeee)); }
    `)

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
