/**
 * Browser replacement for `cross-fetch`, bound to the window.
 *
 * `cross-fetch/dist/browser-ponyfill.js` ends with `exports.fetch = ctx.fetch`,
 * handing out a detached reference to `window.fetch`. Under a `<script>` tag
 * that happens to work, because sloppy-mode `this` falls back to the global.
 * Vite serves ES modules, which are always strict, so `this` is `undefined` and
 * Chrome rejects the call with:
 *
 *   TypeError: Failed to execute 'fetch' on 'Window': Illegal invocation
 *
 * Three Midnight providers import it that way — the ZK config provider, the
 * HTTP proof provider and the indexer public data provider — so binding it once
 * here, via a Vite alias, fixes all of them without patching any SDK.
 */
const boundFetch: typeof globalThis.fetch = (...args) => globalThis.fetch(...args);

export { boundFetch as fetch };
export const Headers = globalThis.Headers;
export const Request = globalThis.Request;
export const Response = globalThis.Response;

export default boundFetch;
