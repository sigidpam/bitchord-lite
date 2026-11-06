import { config } from '@/config';
import { useTrackLog } from '@/playback/trackLog';

/**
 * In the Tauri dev build, copy the player's track log and uncaught errors to
 * the Rust terminal. The page still owns the log (Debug page); this just
 * makes desktop failures visible when the WebView can't be inspected.
 */
export function installNativeLogBridge(): void {
  if (!config.native || !import.meta.env.DEV) return;

  let next = 0;
  useTrackLog.subscribe((state) => {
    if (state.lines.length === 0) return;
    const lines = state.lines.filter((line) => line.id >= next);
    if (lines.length === 0) return;
    next = lines[lines.length - 1]!.id + 1;
    for (const line of lines) {
      void fetch(`${config.nativeBridgeUrl}/log`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ level: line.level, message: line.message, about: line.about }),
        credentials: 'omit',
      }).catch(() => {});
    }
  });

  window.addEventListener('error', (event) => {
    void fetch(`${config.nativeBridgeUrl}/log`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        level: 'error',
        message: `${event.message} @ ${event.filename}:${event.lineno}:${event.colno}`,
        about: null,
      }),
      credentials: 'omit',
    }).catch(() => {});
  });
  window.addEventListener('unhandledrejection', (event) => {
    void fetch(`${config.nativeBridgeUrl}/log`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ level: 'error', message: `Unhandled rejection: ${String(event.reason)}`, about: null }),
      credentials: 'omit',
    }).catch(() => {});
  });
}
