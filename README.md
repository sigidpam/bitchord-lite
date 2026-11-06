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

### Distribution without a paid Developer ID

A Developer ID Application certificate and notarization require the paid Apple Developer Program. If you do not want to pay, these are the practical free routes:

**Unsigned DMG with a bypass**

- Build normally with `corepack pnpm tauri build`. The app is not signed.
- On the Mac that built it, it opens normally.
- On another Mac, the download is quarantined. The user must either:
  - System Settings → Privacy & Security → **Open Anyway**, or
  - remove the quarantine flag:
    ```bash
    xattr -dr com.apple.quarantine "/Applications/BitChord Lite.app"
    ```
- This is the simplest free option, but macOS will show a security warning.

**Ad-hoc signing**

Ad-hoc signing does not provide trust or notarization; Gatekeeper still warns. It can reduce some “app is damaged” failures:

```bash
codesign --force --deep --options runtime --sign - "BitChord Lite.app"
```

**Homebrew cask/tap**

For technical users, a cask can remove the quarantine attribute during install. A tap gives a one-command install without the browser warning:

```ruby
cask "bitchord-lite" do
  version "0.1.0"
  sha256 "REPLACE_WITH_DMG_SHA256"
  url "https://github.com/sigidpam/bitchord-lite/releases/download/v0.1.0/BitChord-Lite_0.1.0_x64.dmg"
  name "BitChord Lite"
  desc "Lightweight YouTube Music player"
  homepage "https://github.com/sigidpam/bitchord-lite"
  app "BitChord Lite.app"
  quarantine false
end
```

**Web/PWA alternative**

The BitChord web player can be installed as a browser app/PWA from Brave or Chrome. No DMG, no Apple fee, and no Gatekeeper. The companion extension still has to be loaded in the browser.

**Fee waiver**

Apple offers fee waivers for accredited educational institutions, nonprofits, and government entities. Individual hobby projects generally do not qualify.

The only route to a DMG that opens cleanly on any Mac without warnings is a paid Developer ID certificate plus notarization. The free routes trade that polish for a manual approval or a technical install path.


## Attribution and license

BitChord Lite is a derivative of **BitChord**, originally by Kushagra Singh and contributors:

- Upstream: https://github.com/kushagrasinghx/BitChord
- Fork used for this work: https://github.com/sigidpam/BitChord

The BitChord UI, playback engine, and extension reference code are reused under the **GNU General Public License v3.0**. BitChord Lite is distributed under the same license; see `LICENSE`.

BitChord Lite is not affiliated with, endorsed by, or connected to BitChord, YouTube, Google, or Spotify. It does not host media. Users are responsible for their use of third-party services.

## Status

The web UI is imported and the Tauri scaffold, config, and icons are in place. The Rust extension bridge and signed DMG are the next implementation stage; this is a staged build, not a completed DMG yet.
