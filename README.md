# BitChord Lite

A lightweight macOS desktop player for YouTube Music, derived from [BitChord](https://github.com/kushagrasinghx/BitChord).

BitChord Lite keeps the BitChord web player's UI and playback engine, wraps it in a Tauri 2 shell, and replaces the Chrome extension with a local Rust bridge. The goal is a signed, installable `.dmg` that is lighter than an Electron app and can play audio-only sources.

- Upstream: https://github.com/kushagrasinghx/BitChord
- Source fork: https://github.com/sigidpam/BitChord
- License: GPLv3
- Status: web UI imported and Tauri scaffold present; the Rust bridge and first signed DMG are next

## Why a native bridge

The original web player depends on its Chrome MV3 extension for YouTube requests, cookies, BotGuard/PO tokens, stream headers, Spotify, and Discord. Tauri's WKWebView cannot load Chrome extensions.

The Tauri app therefore uses:

- **React/Vite UI** from BitChord, rendered in the Tauri WebView.
- **Rust local bridge** for the network and auth work the extension used to do.
- **Tauri commands / local HTTP server** for the page ↔ bridge contract.

The extension source is kept in the repository as the reference implementation; it is not loaded by the shipping app.

## Architecture

```text
┌──────────────────────────────────────────────┐
│ Tauri 2 shell (Rust)                         │
│                                              │
│  WKWebView                                   │
│   React UI (BitChord web player)             │
│        │                                     │
│        │ native bridge shim                  │
│        ▼                                     │
│  Rust bridge                                 │
│   • InnerTube / YouTube Music requests       │
│   • googlevideo audio proxy                  │
│   • BotGuard / PO token forwarding           │
│   • Spotify session bridge                   │
│   • lyrics providers                         │
│   • Discord IPC (later stage)                │
│   • local file server                        │
└──────────────────────────────────────────────┘
```

### Light profile

- Audio-only streams by default; video playback is opt-in.
- Video canvas, AutoMix/ONNX analysis, and other heavy features are lazy-loaded or disabled by default.
- Rust handles proxying and media; the WebView only renders the UI and audio engine.
- No bundled Chromium.

## Sources

The v0.1 source picker is designed for:

- YouTube Music audio
- YouTube video audio
- Local files
- Spotify (embedded login/session)

YouTube Music and YouTube video are the core; local files use a Tauri file picker and a local media server. Spotify uses an embedded login flow and the existing BitChord Spotify catalogue code.

## v0.1 scope

- Tauri app shell with the existing BitChord UI.
- Native bridge for YouTube Music / YouTube audio and local files.
- Source picker.
- Spotify session playback.
- Signed and notarized `.dmg`.
- Full sign-in, lyrics, downloads, Discord, Last.fm, Listen Together, and the remaining parity work are staged after v0.1.

## Roadmap

| Release | Scope |
|---|---|
| v0.1 | Tauri shell, source picker, YouTube Music/video audio, local files, Spotify session, signed DMG |
| v0.2 | Lyrics, downloads, local library, playlists |
| v0.3 | Google sign-in / age-restricted tracks, history, Listen Together |
| v0.4 | Discord, Last.fm, full BitChord parity |

Heavy features remain opt-in so the default profile stays light.

## Repository layout

```text
web/            React/Vite UI and playback code (GPLv3, from BitChord)
src-tauri/      Rust Tauri shell and native bridge
docs/           architecture and implementation notes
LICENSE         GPLv3
README.md
```

## Build locally

Requirements:

- macOS 12 or newer
- Node.js 22+
- pnpm (through corepack)
- Rust stable (rustup)
- Xcode Command Line Tools

```bash
corepack pnpm install
corepack pnpm --dir web install
printf 'VITE_PARTY_SERVER_URL=https://bitchord-listen-together.onrender.com\n' > web/app/.env.local
corepack pnpm tauri dev
```

Production build:

```bash
corepack pnpm tauri build
```

The DMG is written under `src-tauri/target/release/bundle/dmg/`.

The current scaffold loads the web UI; the native bridge is the next milestone.

## Signing and notarization

This project targets a Developer ID Application certificate.

1. Install the certificate in the login Keychain and verify:

```bash
security find-identity -v -p codesigning
```

2. Store notarization credentials once (app-specific password, not the Apple ID password):

```bash
xcrun notarytool store-credentials "bitchord-lite" \
  --apple-id "you@example.com" \
  --team-id "TEAMID" \
  --password "app-specific-password"
```

3. Build with the Developer ID identity configured in `src-tauri/tauri.conf.json`, then submit the DMG:

```bash
xcrun notarytool submit src-tauri/target/release/bundle/dmg/BitChord-Lite_*.dmg \
  --keychain-profile "bitchord-lite" --wait
xcrun stapler staple src-tauri/target/release/bundle/dmg/BitChord-Lite_*.dmg
```

For local testing without a certificate, an unsigned DMG can be built and opened with right-click → Open.

## Attribution and license

BitChord Lite is a derivative of **BitChord**, originally by Kushagra Singh and contributors:

- Upstream: https://github.com/kushagrasinghx/BitChord
- Fork used for this work: https://github.com/sigidpam/BitChord

The BitChord UI, playback engine, and extension reference code are reused under the **GNU General Public License v3.0**. BitChord Lite is distributed under the same license; see `LICENSE`.

BitChord Lite is not affiliated with, endorsed by, or connected to BitChord, YouTube, Google, or Spotify. It does not host media. Users are responsible for their use of third-party services.

## Status

The web UI is imported and the Tauri scaffold, config, and icons are in place. The Rust extension bridge and signed DMG are the next implementation stage; this is a staged build, not a completed DMG yet.
