/**
 * Server half. It carries the plugin's id ("llama-swap-stats") and nothing else:
 * all monitoring lives in the GUI half. The main process (see `gui.tsx`) performs
 * the HTTP requests to the llama-swap gateway, so the renderer's CSP/CORS never
 * gets in the way.
 */
import { Plugin } from "@opencode/plugin"

export default Plugin.define({
  id: "llama-swap-stats",
  setup() {},
})
