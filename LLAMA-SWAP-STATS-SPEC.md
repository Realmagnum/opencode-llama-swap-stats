# Спецификация: opencode-llama-swap-stats

## Цель

Показывать в шапке сессии OpenCode Desktop живую статистику llama-swap gateway (реальные tok/s, попадания в кэш, принятие спекулятивных черновиков, телеметрия железа), а не только статичные токены сессии.

## Архитектура

По образцу `opencode-translate-selection`:

- **Серверная половина** (`src/index.ts`) — `Plugin.define` только с `id: "llama-swap-stats"` и пустым `setup`.
- **Ipc-контракт** (`src/contract.ts`) — `Ipc.define` (effect Schema), id `llama-swap-stats.gateway`. Методы:
  - `listProviders` → список провайдеров из `ctx.client.provider.list()` (`{id, name, baseURL}`);
  - `testConnection({baseURL})` → `GET {root}/api/version`, ответ `{ok, version?, ms?, error?}`;
  - `getStatus({baseURL, modelId?, includeHardware})` → снимок `GatewayStatus`.
- **GUI-вход** (`src/gui.tsx`) — `Plugin.define` с `stores`, `i18n` (en/ru), `setup` (window) и `main` (Electron main). HTTP к gateway выполняется в main через `ctx.provide(Gateway, impl)`, window вызывает `ctx.main(Gateway).getStatus(...)` — CSP/CORS не участвуют.
- **Сборка** — vite `gui()` из `@opencode/plugin/gui/vite`: bundle `dist/gui-experimental.cjs`, effect/solid-js/@opencode/electron/node как external.

## Правила связи с gateway

- Корень gateway: `gatewayRoot(baseURL)` — удаляет хвост `/v1` из base URL провайдера.
- Auto-поиск: провайдер, чей id/name содержит `llama-swap` (case-insensitive), либо чей base URL содержит `:9292`. Иначе — явный id из настроек.
- `resolveBoundProviderId` даёт id провайдера, к которому привязан виджет.
- `hideWhenInactive` (по умолчанию true): виджет скрыт, если модель маршрутизированной сессии (`ctx.screen.current()?.composer.model()`) не принадлежит связанному провайдеру.
- Опрос: один таймер на window, `createEffect` + `setInterval`, интервал из настроек (ограничен 500 мс…10 000 мс).

## Выбор модели

- Запрашивается только модель из `screen.composer.model()` данной сессии, если её `providerID` совпадает со связанным провайдером. ID URL-encoded в `/upstream/{model}/...`.
- Нет fallback на активный профиль gateway: это исключает отображение в сессии статистики другой модели.
- Исключение по явной настройке `alwaysShowCurrentLoad` (по умолчанию false): виджет доступен во всех активных сессиях и показывает состояние модели `pins.assistant` активного профиля из `/api/profiles`, то есть общую текущую нагрузку gateway, а не модель выбранной сессии.
- Метаданные модели: `GET /v1/models` (имя, `context_length`, `status.value`); кэшируются в main 60 с.

## Формы данных gateway (проверено на v265)

- `GET /upstream/{model}/slots` → массив: `{id, n_ctx, speculative, is_processing, n_prompt_tokens?}`.
- `GET /upstream/{model}/metrics` → **Prometheus exposition** (текст):
  - `llamacpp:predicted_tokens_seconds` — live tok/s генерации;
  - `llamacpp:prompt_tokens_seconds` — live tok/s prefill;
  - `llamacpp:requests_processing`, `llamacpp:n_busy_slots_per_decode` — занятость;
  - `llamacpp:tokens_predicted_total` / `tokens_predicted_seconds_total` — средние tok/s;
  - `llamacpp:prompt_tokens_total` / `prompt_tokens_cached_total` — кэш (доля = cached / (total + cached));
  - `llamacpp:spec_decode_num_drafts_total`, `spec_decode_num_accepted_tokens_total`, `spec_decode_num_draft_tokens_total` — принятие черновиков (acceptance = accepted / draft tokens).
- `GET /api/performance` → `{enabled, gpu_stats: [...], sys_stats: [...]}`: последний элемент массива — свежий образец (GPU: `gpu_util_pct`, `temp_c`, `mem_used_mb`, `mem_total_mb`, `power_draw_w`; система: `mem_used_mb`, `mem_total_mb`, `load_avg_1`).
- `GET /api/version` → `{version, commit, build_date}`.

## Снимок `GatewayStatus`

`{modelId?, modelName?, contextLength?, status?, live{state, tokS?, tokSMean?, prefillTokS?, requestsProcessing?, busySlots?}, kv?{used?, total?, cacheRatio?, cachedTokens?}, spec?{...}, hardware?{...}, version?, modelCount?, error?}`.

`live.state`: `generating`, когда `requests_processing > 0` или `n_busy_slots_per_decode > 0` или есть слот с `is_processing`; иначе `idle`. Без метрик — `unknown` (или `idle`, если meta говорит `loaded`).

## UI

- **Виджет** (`session.header`, `src/components/header-widget.tsx`): отдельный снимок состояния на владельца слота/сессию, пилюля с коротким ID выбранной модели и пульсирующей точкой (анимация `llama-swap-pulse`, зарегистрирована через `ctx.add(Style, ...)`), клик — `ctx.dialogs.open` с дашбордом у правого края окна.
- **Дашборд** (`src/components/stats-popover.tsx`): секции Speed / KV cache / Speculative decoding / Hardware, футер с версией gateway и числом моделей, кнопки «Open gateway» (`ctx.system.openExternal`) и «Close».
- **Настройки** (`src/settings-view.tsx`, `SettingsPage` id `llama-swap-stats`, icon `waveform`): выпадающий список провайдеров, ручной URL gateway, «Test connection» с результатом, ползунок интервала, опция постоянного показа общей нагрузки, чекбоксы, Reset.
- i18n: en/ru.

## Тесты

`test/gateway.test.ts` (node:test): `gatewayRoot`, `resolveGatewayBase`, `resolveBoundProviderId`, `parsePrometheus`, `shapeStatus` (все ветки), форматтеры `formatK/formatGB/formatPercent/formatWatts`.
