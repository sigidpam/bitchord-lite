import {
  BRIDGE_CHANNEL,
  BRIDGE_PROTOCOL,
  BridgeCallError,
  isBridgeResponse,
  type Bridge,
  type BridgeEvent,
  type BridgeMethod,
  type CallOptions,
  type DetectedExtension,
  type ParamsOf,
  type ResultOf,
} from '@bitchord/shared/bridge';
import { config } from '@/config';
import { androidSignIn, isAndroidShell, restoreAndroidCookies } from '@/native/androidAuth';

/**
 * The Tauri build's bridge. It speaks the same envelope as the Chrome
 * extension, but over HTTP to the Rust process (`src-tauri/src/bridge.rs`),
 * so the page code that calls `bridge.call(…)` is unchanged.
 *
 * `transport` is reported as `external` because there is no page relay: the
 * page talks to the bridge directly.
 */
let nextId = 0;

const DEFAULT_TIMEOUT_MS = 30_000;

class NativeBridge implements Bridge {
  readonly transport = 'external' as const;

  constructor(private readonly baseUrl: string) {}

  async call<M extends BridgeMethod>(
    method: M,
    params: ParamsOf<M>,
    options?: CallOptions,
  ): Promise<ResultOf<M>> {
    // Android has no desktop login window; the native screen owns the cookie jar.
    if (method === 'yt.signIn' && isAndroidShell()) {
      await androidSignIn();
      return {} as ResultOf<M>;
    }

    const id = `native-${Date.now().toString(36)}-${(nextId++).toString(36)}`;
    const request = {
      channel: BRIDGE_CHANNEL,
      protocol: BRIDGE_PROTOCOL,
      direction: 'to-extension' as const,
      id,
      method,
      params,
    };
    const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
    const onAbort = () => controller.abort();
    if (options?.signal?.aborted) onAbort();
    else options?.signal?.addEventListener('abort', onAbort, { once: true });

    try {
      const response = await fetch(`${this.baseUrl}/bridge`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(request),
        signal: controller.signal,
        credentials: 'omit',
      });
      if (!response.ok) {
        throw new BridgeCallError('unavailable', `Native bridge answered HTTP ${response.status}`);
      }

      const payload: unknown = await response.json();
      if (!isBridgeResponse(payload) || payload.id !== id) {
        throw new BridgeCallError('protocol', 'Malformed response from the native bridge');
      }
      if (!payload.ok) throw new BridgeCallError(payload.error.code, payload.error.message);
      return payload.result as ResultOf<M>;
    } catch (error) {
      if (error instanceof BridgeCallError) throw error;
      if (options?.signal?.aborted) {
        throw options.signal.reason ?? new DOMException('Aborted', 'AbortError');
      }
      if (timedOut) {
        throw new BridgeCallError('timeout', `No answer from the native bridge within ${timeoutMs} ms`);
      }
      throw new BridgeCallError(
        'unavailable',
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      clearTimeout(timer);
      options?.signal?.removeEventListener('abort', onAbort);
    }
  }

  subscribe(_listener: (event: BridgeEvent) => void): () => void {
    // The native bridge has no push channel yet: auth state is signed out and
    // polled by the auth hook's own refetch. A future stage adds SSE here.
    return () => {};
  }
}

/** Pings the bundled Rust bridge; `null` when this isn't a native build or the bridge isn't up yet. */
export async function detectNativeBridge(): Promise<DetectedExtension | null> {
  if (!config.native) return null;
  const bridge = new NativeBridge(config.nativeBridgeUrl);
  try {
    const info = await bridge.call('ping', {}, { timeoutMs: 1500 });
    if (info.protocol !== BRIDGE_PROTOCOL) return null;
    if (isAndroidShell()) {
      // A previous sign-in survives an app restart; failure means anonymous.
      try {
        await restoreAndroidCookies();
      } catch {
        /* no saved session */
      }
    }
    return { bridge, info };
  } catch {
    return null;
  }
}
