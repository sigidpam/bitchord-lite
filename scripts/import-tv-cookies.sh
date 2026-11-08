#!/usr/bin/env bash
# Import a signed-in music.youtube.com cookie header into the Android TV app.
# Usage: scripts/import-tv-cookies.sh <tv-ip> <cookie-file>
# The cookie file holds the Cookie request header from a music.youtube.com request.
# The script never prints the cookies.
set -euo pipefail
cd "$(dirname "$0")/.."

HOST="${1:?usage: $0 <tv-ip> <cookie-file>}"
FILE="${2:?usage: $0 <tv-ip> <cookie-file>}"
ADB="${ANDROID_HOME:-$HOME/Library/Android/sdk}/platform-tools/adb"
TV="$HOST:5555"
FWD=18081

[ -f "$FILE" ] || { echo "Cookie file not found: $FILE" >&2; exit 1; }

# Accept the Cookie value alone, or a copied "Cookie: ..." line.
HEADER="$(tr -d '\r' < "$FILE" | sed -e 's/^[[:space:]]*[Cc]ookie:[[:space:]]*//' | tr '\n' ' ' | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"
case "$HEADER" in
  *SAPISID*|*__Secure-3PAPISID*) ;;
  *) echo "No SAPISID found. Copy the Cookie header from a signed-in music.youtube.com request." >&2; exit 1 ;;
esac

BODY="$(printf '%s' "$HEADER" | python3 -I -c '
import json, sys
raw = sys.stdin.read()
pairs = []
for part in raw.split(";"):
    part = part.strip()
    if not part or "=" not in part:
        continue
    name, value = part.split("=", 1)
    pairs.append({"name": name, "value": value})
print(json.dumps({
    "channel": "bitchord-bridge",
    "protocol": 1,
    "direction": "to-extension",
    "id": "cookie-import",
    "method": "yt.setCookies",
    "params": {"cookies": pairs},
}))')"

echo "Connecting to $HOST. Accept the debugging prompt on the TV if it appears."
CONNECTED="$("$ADB" connect "$TV" 2>&1)"
echo "$CONNECTED"
case "$CONNECTED" in
  *connected*) ;;
  *) echo "Could not reach the TV. Check the IP and that network debugging is on." >&2; exit 1 ;;
esac
"$ADB" -s "$TV" wait-for-device
"$ADB" -s "$TV" shell am start -n in.sigidpam.bitchordlite/.MainActivity >/dev/null 2>&1 || true
sleep 3
"$ADB" -s "$TV" forward tcp:$FWD tcp:47823 >/dev/null
trap '"$ADB" -s "$TV" forward --remove tcp:$FWD >/dev/null 2>&1 || true' EXIT

for _ in $(seq 1 20); do
  if curl -s -m 1 "http://127.0.0.1:$FWD/health" | grep -q ok; then break; fi
  sleep 0.5
done

RESP="$(printf '%s' "$BODY" | curl -sS -m 30 -X POST "http://127.0.0.1:$FWD/bridge" -H 'content-type: application/json' --data-binary @-)"
python3 -I -c '
import json, sys
try:
    d = json.loads(sys.stdin.read())
except Exception:
    print("The TV bridge did not return JSON. Is the app installed and running?", file=sys.stderr)
    sys.exit(1)
if not d.get("ok"):
    print("The TV bridge refused the import:", d.get("error"), file=sys.stderr)
    sys.exit(1)
state = d.get("result") or {}
active = state.get("active") or {}
print("Imported. Signed in:", state.get("signedIn"), "| Account:", active.get("name") or "-", "| Problem:", state.get("problem") or "-")
' <<<"$RESP"

"$ADB" -s "$TV" shell am force-stop in.sigidpam.bitchordlite
"$ADB" -s "$TV" shell am start -n in.sigidpam.bitchordlite/.MainActivity >/dev/null 2>&1 || true
echo "TV app restarted. It should open signed in."
