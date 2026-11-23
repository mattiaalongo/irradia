/**
 * Punto d'ingresso della funzione lato server in produzione (fase 6).
 *
 * Forma del "module worker" di Cloudflare Workers (`export default { fetch(request, env) }`),
 * l'hosting più probabile ma non ancora scelto dal PO; usa solo `Request` e `Response`
 * standard, quindi si adatta a un altro hosting cambiando poche righe.
 * Fonte della forma: Cloudflare, "Workers — Fetch handler" e "Static Assets — Binding"
 * (https://developers.cloudflare.com/workers/runtime-apis/handlers/fetch/,
 * https://developers.cloudflare.com/workers/static-assets/binding/).
 *
 * - `/api/pvgis/...` → intermediario verso PVGIS (`pvgisProxy.ts`), con lo User-Agent di produzione;
 * - tutto il resto → file statici dell'app (`env.ASSETS`, la cartella `dist/`).
 */

import {
  handlePvgisProxy,
  isPvgisProxyPath,
  PVGIS_PROXY_MAX_BYTES,
  PVGIS_PROXY_TIMEOUT_MS,
  PVGIS_PROXY_USER_AGENT_PRODUCTION,
} from './pvgisProxy.ts'

/**
 * Ambiente della funzione, scritto a mano (niente `@cloudflare/workers-types`: una dipendenza
 * in più per un solo campo). `ASSETS` è il collegamento ai file statici dell'app.
 */
export interface WorkerEnv {
  ASSETS: { fetch(request: Request): Promise<Response> }
}

export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    if (isPvgisProxyPath(new URL(request.url).pathname)) {
      return handlePvgisProxy(request, {
        // `fetch` va chiamata con `globalThis` come contesto: passata "staccata" alcuni
        // ambienti la rifiutano ("Illegal invocation").
        fetch: (input, init) => globalThis.fetch(input, init),
        userAgent: PVGIS_PROXY_USER_AGENT_PRODUCTION,
        timeoutMs: PVGIS_PROXY_TIMEOUT_MS,
        maxBytes: PVGIS_PROXY_MAX_BYTES,
      })
    }
    return env.ASSETS.fetch(request)
  },
}
