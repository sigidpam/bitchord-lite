#!/usr/bin/env bash
# Build the Android TV release APK (arm64-v8a + armeabi-v7a) and copy it into dist/.
# The APK is signed with the Android debug key: it is for sideloading, not Play.
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="$HOME/.local/bin:$HOME/.cargo/bin:$PATH"
export JAVA_HOME="${JAVA_HOME:-$(/usr/libexec/java_home -v 17)}"
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
# The newest complete NDK; older side-by-side folders can exist without source.properties.
NDK="${NDK_HOME:-$(for d in "$ANDROID_HOME"/ndk/*; do [ -f "$d/source.properties" ] && echo "$d"; done | sort | tail -n 1)}"
export NDK_HOME="$NDK" ANDROID_NDK_HOME="$NDK"

corepack pnpm tauri android build --target aarch64 --target armv7 --apk

VERSION="$(node -p "require('./src-tauri/tauri.conf.json').version")"
APK="src-tauri/gen/android/app/build/outputs/apk/universal/release/app-universal-release.apk"
OUT="dist/BitChord Lite_${VERSION}_android-tv.apk"
mkdir -p dist
cp "$APK" "$OUT"
echo "Wrote $OUT"
