#!/usr/bin/env bash
# Import a signed-in music.youtube.com cookie header into the Android TV app.
# Usage: scripts/import-tv-cookies.sh <tv-ip> <cookie-file>
#        scripts/import-tv-cookies.sh --check <cookie-file>
# The file holds the Cookie request header, Chrome's "Copy as cURL" dump, or
# an exported HAR with sensitive data. The script never prints the cookies.
set -euo pipefail
cd "$(dirname "$0")/.."

if [ "${1:-}" = "--check" ]; then
  FILE="${2:?usage: $0 --check <cookie-file>}"
  CHECK_ONLY=1
  HOST=""
else
  HOST="${1:?usage: $0 <tv-ip> <cookie-file>}"
  FILE="${2:?usage: $0 <tv-ip> <cookie-file>}"
  CHECK_ONLY=0
fi

[ -f "$FILE" ] || { echo "Cookie file not found: $FILE" >&2; exit 1; }

PARSE_PY="$(mktemp "${TMPDIR:-/tmp}/bitchord-cookie-parse.XXXXXX")"
cat > "$PARSE_PY" <<'PY'
import json
import re
import sys

raw = open(sys.argv[1], encoding="utf-8", errors="replace").read()
raw = raw.replace("\\\n", " ").replace("\r", "")
header = ""

# Chrome's exported HAR keeps request cookies separately.
if raw.lstrip().startswith("{"):
    try:
        doc = json.loads(raw)
    except Exception:
        doc = None
    for entry in (((doc or {}).get("log") or {}).get("entries") or []):
        request = entry.get("request") or {}
        if "music.youtube.com" not in (request.get("url") or ""):
            continue
        for item in request.get("headers") or []:
            if (item.get("name") or "").lower() == "cookie":
                header = item.get("value") or ""
                break
        if not header:
            cookies = request.get("cookies") or []
            header = "; ".join(
                f"{c.get('name')}={c.get('value')}" for c in cookies if c.get("name")
            )
        if header:
            break

# Chrome's Copy as cURL keeps the header in -H, or cookies in -b.
patterns = [
    r"(?:^|\s)(?:-H|--header)\s+\$?'([^']*)'",
    r'(?:^|\s)(?:-H|--header)\s+\$?"([^"]*)"',
    r"(?:^|\s)(?:-b|--cookie)\s+\$?'([^']*)'",
    r'(?:^|\s)(?:-b|--cookie)\s+\$?"([^"]*)"',
]
for pattern in patterns:
    if header:
        break
    for match in re.finditer(pattern, raw, re.I):
        value = match.group(1).strip()
        if pattern.find("-b") >= 0 or pattern.find("--cookie") >= 0:
            header = value
            break
        if re.match(r"^cookie\s*:", value, re.I):
            header = re.sub(r"^cookie\s*:\s*", "", value, flags=re.I)
            break
if not header:
    for line in raw.splitlines():
        line = line.strip()
        if re.match(r"^cookie\s*:", line, re.I):
            header = re.sub(r"^cookie\s*:\s*", "", line, flags=re.I)
            break
    if not header:
        header = " ".join(line for line in raw.splitlines() if line.strip())
print(header)
PY
HEADER="$(python3 -I "$PARSE_PY" "$FILE")"
rm -f "$PARSE_PY"

case "$HEADER" in
  *SAPISID*|*__Secure-3PAPISID*) ;;
  *) echo "No SAPISID found. Copy the music.youtube.com request as cURL, or copy its Cookie header." >&2; exit 1 ;;
esac

COOKIE_COUNT="$(printf '%s' "$HEADER" | python3 -I -c 'import sys; print(sum(1 for part in sys.stdin.read().split(";") if "=" in part))')"
if [ "$CHECK_ONLY" = 1 ]; then
  echo "Cookie header OK: $COOKIE_COUNT pairs, SAPISID present."
  exit 0
fi

ADB="${ANDROID_HOME:-$HOME/Library/Android/sdk}/platform-tools/adb"
TV="$HOST:5555"
FWD=18081

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
