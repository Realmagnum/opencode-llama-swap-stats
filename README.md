# opencode-llama-swap-stats

Живой мониторинг llama-swap gateway в шапке сессии OpenCode Desktop: скорость генерации (tok/s), попадания в кэш промптов, принятие спекулятивных черновиков (MTP/ngram) и телеметрия GPU/RAM — вместо статичных данных о токенах сессии.

Live llama-swap gateway monitoring in the OpenCode Desktop session header: real-time tok/s, prompt-cache hit rate, speculative decoding (MTP/ngram) acceptance and GPU/RAM telemetry — instead of only static session token data.

## Как работает / How it works

- **Автоматическое обнаружение.** Плабин ищет в `opencode.json` провайдер, чьё имя или id содержит `llama-swap` (регистр не важен), либо чей base URL указывает на порт `:9292`. Если нужно привязать другой провайдер, на странице настроек есть выпадающий список всех сконфигурированных провайдеров и поле для ручного URL gateway.
- **HTTP в main-процессе.** Все запросы к gateway выполняет main-процесс Electron через Ipc (`@opencode/plugin/gui`), поэтому CSP/CORS рендера не мешают.
- **Виджет.** В `session.header` — компактная «пилюля»:
  - модель в покое: `llama-swap · 79.9k/262k KV`;
  - во время генерации: `⚡ 45.6 t/s · 83% cache` с пульсирующей точкой;
  - при недоступности: серое `llama-swap offline`.
- **Дашборд.** Клик по пилюле открывает диалог: скорость (live/среднее/prefill), занятые слоты, KV-память и кэш, принятие черновиков, GPU (утилизация, температура, VRAM, мощность), RAM, load. Кнопка «Open gateway» открывает UI gateway в системном браузере.
- **Опрос.** Активный `session.header` слот опрашивает gateway с настраиваемым интервалом (500 мс – 10 с). Запрашивается только модель, выбранная именно в этой сессии. Если текущая модель не принадлежит связанному провайдеру, статистика не подменяется моделью активного профиля gateway.
- **Постоянный обзор нагрузки.** В настройках можно включить «Всегда показывать текущую нагрузку llama-swap в любой сессии». Тогда виджет появляется в любой активной сессии и показывает модель активного профиля gateway — даже если в сессии выбрана другая модель. Это отдельный режим, явно отличающийся от статистики модели текущей сессии.
- **Дашборд у правого края.** Открывается в оконном диалоге OpenCode и выравнивается справа внутри окна клиента.

## Данные gateway

| Endpoint | Что даёт |
| --- | --- |
| `GET /api/version` | версия gateway (проверка связи) |
| `GET /api/profiles` | активный профиль и закреплённая модель ассистента |
| `GET /v1/models` | каталог моделей (имя, контекст, статус) |
| `GET /upstream/{model}/slots` | слоты: `n_ctx`, занятые токены KV |
| `GET /upstream/{model}/metrics` | Prometheus: live tok/s, кэш, спекулятивное декодирование |
| `GET /api/performance` | GPU/RAM телеметрия (`gpu_stats`, `sys_stats`) |

## Установка / Install

```sh
cd /Users/rm/Documents/!Projects/opencode-llama-swap-stats
npm install
npm run build
```

Путь к проекту уже есть в `plugins` в `~/.config/opencode/opencode.json`; после переиздания перезапустите OpenCode Desktop.

## Команды

```sh
npm run typecheck   # tsc --noEmit
npm test            # node --test test/**/*.test.ts
npm run build       # vite build -> dist/gui-experimental.cjs
npm run ci          # typecheck + test + build
```

## Настройки

Плагин → **Llama-Swap stats** (иконка waveform) в настройках OpenCode:

- **Bound provider** — «auto» (авто-поиск) или конкретный провайдер из списка;
- **Gateway URL** — ручной корень gateway (например `http://srv-test.ts.rmg7.com:9292`);
- **Test connection** — проверка `/api/version`;
- **Poll interval** — 500 мс…10 с;
- **Hide the widget unless the session uses this provider** — виджет показывается только для сессий на связанном провайдере;
- **Always show current llama-swap load in every session** — всегда показывает нагрузку модели активного профиля gateway, независимо от модели сессии;
- **Show hardware stats / Show speculative decoding stats** — переключатели секций в дашборде.

## Лицензия

MIT, Copyright (c) 2026 Realmagnum.
