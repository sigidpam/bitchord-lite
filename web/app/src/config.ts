/** Build-time configuration, from Vite's `VITE_*` environment variables. */
export const config = {
  /** Pinned in development by the manifest `key` (web/extension/wxt.config.ts). */
  chromiumExtensionId: import.meta.env.VITE_EXTENSION_ID_CHROMIUM || DEV_EXTENSION_ID,
  /** The extension packages (web/extension: `pnpm package` copies them into public/downloads). */
  extensionChromeUrl: import.meta.env.VITE_EXTENSION_CHROME_URL || '/downloads/bitchord-extension-chrome.zip',
  extensionFirefoxUrl: import.meta.env.VITE_EXTENSION_FIREFOX_URL || '/downloads/bitchord-extension-firefox.zip',
  /** The version the zips above hold, for the "update available" notice. */
  extensionManifestUrl: import.meta.env.VITE_EXTENSION_MANIFEST_URL || '/downloads/extension.json',
  androidAppUrl: import.meta.env.VITE_ANDROID_APP_URL || 'https://github.com/kushagrasinghx/BitChord/releases/latest',
  /** BitChord's Listen Together server. vite.config.ts refuses a production build without it. */
  partyServerUrl: import.meta.env.VITE_PARTY_SERVER_URL ?? '',
  /** The Tauri shell sets this; the browser build leaves it unset and uses the extension. */
  native: import.meta.env.VITE_BITCHORD_NATIVE === '1',
  /** The bundled Rust bridge's local HTTP address (src-tauri/src/bridge.rs). */
  nativeBridgeUrl: import.meta.env.VITE_BITCHORD_BRIDGE_URL || 'http://127.0.0.1:47823',
} as const;
