import { BRIDGE_CHANNEL, BRIDGE_PROTOCOL } from '@bitchord/shared/bridge';
import { config } from '@/config';

type Cookie = { name: string; value: string };
type Internals = {
  invoke: <T>(command: string, args?: Record<string, unknown>) => Promise<T>;
};

function internals(): Internals {
  const api = (window as Window & { __TAURI_INTERNALS__?: Internals }).__TAURI_INTERNALS__;
  if (!api) throw new Error('The Android bridge is not available');
  return api;
}

async function plugin<T>(command: string): Promise<T> {
  return internals().invoke<T>(`plugin:bitchord-tv|${command}`, {});
}

export function isAndroidShell(): boolean {
  return config.native && /Android/i.test(navigator.userAgent);
}

async function postCookies(cookies: Cookie[]): Promise<void> {
  const response = await fetch(`${config.nativeBridgeUrl}/bridge`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      channel: BRIDGE_CHANNEL,
      protocol: BRIDGE_PROTOCOL,
      direction: 'to-extension',
      id: `android-cookies-${Date.now().toString(36)}`,
      method: 'yt.setCookies',
      params: { cookies },
    }),
  });
  if (!response.ok) throw new Error(`The bridge refused the sign-in (HTTP ${response.status})`);
}

let restored = false;

/**
 * The login screen keeps its cookie jar in SharedPreferences. Post it once at
 * startup so a signed-in TV stays signed in across app restarts.
 */
export async function restoreAndroidCookies(): Promise<void> {
  if (restored) return;
  const cookies = await plugin<Cookie[]>('getCookies');
  if (!cookies.length) return;
  await postCookies(cookies);
  restored = true;
}

/**
 * Android has no second Tauri window for Google's sign-in. This opens the
 * native login screen, waits for its cookie jar, then hands the cookies to
 * the bundled Rust bridge, which signs requests from then on.
 */
export async function androidSignIn(): Promise<void> {
  await plugin('openLogin');

  for (let attempt = 0; attempt < 300; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const { state } = await plugin<{ state: string }>('loginState');
    if (state === 'cancelled') throw new Error('Sign-in was cancelled');
    if (state !== 'done') continue;

    const cookies = await plugin<Cookie[]>('getCookies');
    if (!cookies.length) throw new Error('Google did not return a YouTube session');
    await postCookies(cookies);
    restored = true;
    return;
  }

  throw new Error('Sign-in timed out');
}
