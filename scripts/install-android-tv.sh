#!/usr/bin/env bash
# Install the Android TV APK on a TV reachable over adb (network debugging on).
# Usage: scripts/install-android-tv.sh <tv-ip> [apk]
set -euo pipefail
cd "$(dirname "$0")/.."

HOST="${1:?usage: $0 <tv-ip> [apk]}"
ADB="${ANDROID_HOME:-$HOME/Library/Android/sdk}/platform-tools/adb"
VERSION="$(node -p "require('./src-tauri/tauri.conf.json').version")"
APK="${2:-dist/BitChord Lite_${VERSION}_android-tv.apk}"

echo "Connecting to $HOST. Accept the debugging prompt on the TV if it appears."
CONNECTED="$("$ADB" connect "$HOST:5555" 2>&1)"
echo "$CONNECTED"
case "$CONNECTED" in
  *connected*) ;;
  *) echo "Could not reach the TV. Check the IP and that network debugging is on." >&2; exit 1 ;;
esac
"$ADB" -s "$HOST:5555" wait-for-device
"$ADB" -s "$HOST:5555" shell getprop ro.product.cpu.abilist
"$ADB" -s "$HOST:5555" install -r "$APK"
"$ADB" -s "$HOST:5555" shell am start -W -n in.sigidpam.bitchordlite/.MainActivity
