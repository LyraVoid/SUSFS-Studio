#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
serial=${ANDROID_SERIAL:-}
if [[ -z "$serial" ]]; then
    devices=$(adb devices)
    mapfile -t online < <(awk '$2 == "device" { print $1 }' <<< "$devices")
    if [[ ${#online[@]} == 1 ]]; then
        serial=${online[0]}
    fi
fi
if [[ -z "$serial" ]] || [[ $(adb -s "$serial" get-state 2>/dev/null) != device ]]; then
    printf 'No selected Android device. Set ANDROID_SERIAL.\n' >&2
    exit 2
fi
package=dev.susfs.studio.smoke
installed_packages=$(adb -s "$serial" shell pm list packages "$package")
if grep -Fxq "package:$package" <<< "${installed_packages//$'\r'/}"; then
    printf 'Refusing to replace an already-installed %s.\n' "$package" >&2
    exit 2
fi

pnpm --dir web exec vite build --mode development
apk=$(bash scripts/build-webview-smoke.sh "$@")
remote=$(adb -s "$serial" shell mktemp /data/local/tmp/studio-webview.XXXXXXXX)
installed=false
cleanup() {
    if [[ $installed == true ]]; then
        adb -s "$serial" uninstall "$package" || printf 'Could not remove the smoke APK.\n' >&2
    fi
    adb -s "$serial" shell rm -f "$remote" || printf 'Could not remove the temporary UI dump.\n' >&2
}
trap cleanup EXIT
adb -s "$serial" install --no-incremental "$apk"
installed=true

check_scenario() {
    local scenario=$1 expected=$2 source=$3 notice=${4:-}
    adb -s "$serial" shell am start -S -W -n "$package/.SmokeActivity" --es scenario "$scenario" >/dev/null
    for _ in 1 2 3 4 5; do
        sleep 1
        adb -s "$serial" shell uiautomator dump "$remote" >/dev/null 2>&1 || continue
        if adb -s "$serial" exec-out cat "$remote" | python3 -c '
import sys
import xml.etree.ElementTree as ET

package, expected, source, notice = sys.argv[1:]
try:
    root = ET.parse(sys.stdin)
except ET.ParseError:
    sys.exit(1)
labels = [n.get("text", "") for n in root.iter("node") if n.get("package") == package]
sys.exit(not (source in labels and any(expected in label for label in labels)
    and (not notice or any(notice in label or "设备状态快照" in label for label in labels))))
' "$package" "$expected" "$source" "$notice"; then
            printf '%s: %s\n' "$scenario" "$expected"
            return
        fi
    done
    printf 'Scenario %s did not show expected text: %s\n' "$scenario" "$expected" >&2
    return 1
}

tap_label() {
    local label=$1 coordinates
    for _ in 1 2 3 4 5; do
        adb -s "$serial" shell uiautomator dump "$remote" >/dev/null 2>&1 || continue
        if coordinates=$(adb -s "$serial" exec-out cat "$remote" | python3 -c '
import re
import sys
import xml.etree.ElementTree as ET

package, label = sys.argv[1:]
for node in ET.parse(sys.stdin).iter("node"):
    if node.get("package") == package and any(
        node.get(field, "").startswith(label) for field in ("text", "content-desc")
    ):
        left, top, right, bottom = map(int, re.findall(r"\d+", node.get("bounds", "")))
        if left < right and top < bottom:
            print((left + right) // 2, (top + bottom) // 2)
            sys.exit(0)
sys.exit(1)
' "$package" "$label"); then
            local x y
            read -r x y <<< "$coordinates"
            adb -s "$serial" shell input tap "$x" "$y"
            return
        fi
    done
    printf 'Could not find UI control: %s\n' "$label" >&2
    return 1
}

check_scenario active '已激活SUSFS 版本 v2.3.0LKM' '宿主诊断'
check_scenario demo '已激活' '演示数据'
check_scenario mismatch '协议未知' '宿主诊断'
check_scenario failed '连接失败' '宿主诊断'
check_scenario unavailable '宿主未提供安全诊断接口' '宿主诊断'
check_scenario navigation 'Navigation checks passed' '宿主诊断'
check_scenario native '连接失败' '宿主诊断'
pid=$(adb -s "$serial" shell pidof "$package")
log=$(adb -s "$serial" logcat -d --pid="$pid" -s StudioSmoke:I)
grep -Fq 'studioctl hello completed' <<< "$log"
grep -Fq 'studioctl status completed' <<< "$log"
printf 'native: handshake and unprivileged status query completed\n'

if [[ $# == 1 ]]; then
    summary=$(python3 -c '
import json
import sys

with open(sys.argv[1], encoding="utf-8") as file:
    response = json.load(file)
assert response["protocol"] == 1 and response["requestId"] == "status" and response["ok"] is True
assert response["data"]["kind"] == "active"
provider = response["data"]["provider"]
version = provider["version"]
assert isinstance(version, str) and version
badge = {"lkm": "LKM", "builtin": "Built-In", "unknown": ""}[provider["implementation"]]
print(version + badge)
' "$1")
    check_scenario snapshot "已激活SUSFS 版本 $summary" '宿主诊断' 'Captured device status'
    pid=$(adb -s "$serial" shell pidof "$package")
    before=$(adb -s "$serial" logcat -d --pid="$pid" -s StudioSmoke:I | grep -Fc 'Captured status replayed')
    tap_label '状态'
    tap_label '刷新诊断'
    for _ in 1 2 3 4 5; do
        after=$(adb -s "$serial" logcat -d --pid="$pid" -s StudioSmoke:I | grep -Fc 'Captured status replayed')
        if (( after > before )); then
            printf 'snapshot: refresh replayed the captured status\n'
            exit 0
        fi
        sleep 1
    done
    printf 'Snapshot refresh did not replay the captured status.\n' >&2
    exit 1
fi
