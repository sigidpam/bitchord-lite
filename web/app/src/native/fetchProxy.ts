import { config } from '@/config';

/**
 * In the Tauri build there is no extension to rewrite request headers, and
 * WKWebView enforces CORS. Every request the player makes straight to
 * YouTube/googlevideo is therefore sent through the local Rust proxy, which
 * adds the headers the extension's DNR rules used to add and answers with
 * permissive CORS.
 *
 * Only installed in the native build (`VITE_BITCHORD_NATIVE=1`), so the web
 * player keeps using the extension.
 */
const PROXIED_HOST = /(^|\.)(youtube\.com|googlevideo\.com)$/i;

function shouldProxy(url: URL): boolean {
  return PROXIED_HOST.test(url.hostname);
}

export function installNativeFetchProxy(): void {
  if (!config.native || typeof window === 'undefined') return;

  const scope = window as Window & { __bitchordNativeFetch?: boolean };
  if (scope.__bitchordNativeFetch) return;
  scope.__bitchordNativeFetch = true;

  const nativeFetch = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    let request: Request;
    try {
      request = input instanceof Request ? input : new Request(input, init);
    } catch {
      return nativeFetch(input, init);
    }

    let url: URL;
    try {
      url = new URL(request.url);
    } catch {
      return nativeFetch(request);
    }
    if (!shouldProxy(url)) return nativeFetch(request);

    // Read the body up front so the original Request is left untouched; the
    // proxy call must be a fresh request to a different origin.
    const body =
      request.method === 'GET' || request.method === 'HEAD'
        ? undefined
        : await request.clone().arrayBuffer();

    const target = `${config.nativeBridgeUrl}/proxy?url=${encodeURIComponent(request.url)}`;
    return nativeFetch(target, {
      method: request.method,
      headers: request.headers,
      body,
      signal: request.signal,
      credentials: 'omit',
      redirect: 'follow',
    });
  };
}
