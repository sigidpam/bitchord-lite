/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_EXTENSION_ID_CHROMIUM?: string;
  readonly VITE_ANDROID_APP_URL?: string;
  readonly VITE_EXTENSION_CHROME_URL?: string;
  readonly VITE_EXTENSION_FIREFOX_URL?: string;
  readonly VITE_EXTENSION_MANIFEST_URL?: string;
  readonly VITE_PARTY_SERVER_URL?: string;
  /** `1` in the Tauri shell: talk to the local Rust bridge instead of the extension. */
  readonly VITE_BITCHORD_NATIVE?: string;
  readonly VITE_BITCHORD_BRIDGE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** Injected by vite.config.ts from web/extension/dev-key/extension-id.txt. */
declare const DEV_EXTENSION_ID: string;
