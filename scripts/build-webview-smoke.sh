#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
sdk=${ANDROID_SDK_ROOT:-${ANDROID_HOME:?Set ANDROID_HOME or ANDROID_SDK_ROOT}}
tools="$sdk/build-tools/36.0.0"
platform="$sdk/platforms/android-36/android.jar"
keystore=${STUDIO_DEBUG_KEYSTORE:-$HOME/.android/debug.keystore}
test -f "$keystore"
test -f web/dist/index.html
if [[ $# -gt 1 ]]; then
    printf 'Usage: %s [device-status.json]\n' "$0" >&2
    exit 2
fi
(cd native && cargo ndk -t arm64-v8a -P 26 build --locked >&2)

mkdir -p .local
output=$(mktemp -d .local/webview-smoke.XXXXXX)
mkdir -p "$output/classes" "$output/generated" "$output/dex" "$output/assets/webroot" "$output/lib/arm64-v8a"
cp -R web/dist/. "$output/assets/webroot/"
cp contracts/diagnostic-v1.json "$output/assets/"
if [[ $# == 1 ]]; then
    cp -- "$1" "$output/assets/device-status.json"
    if (( $(wc -c < "$output/assets/device-status.json") > 4096 )); then
        printf 'Device status capture exceeds 4 KiB.\n' >&2
        exit 2
    fi
fi
cp native/target/aarch64-linux-android/debug/studioctl "$output/lib/arm64-v8a/libstudioctl.so"
"$tools/aapt" package -M android/smoke/AndroidManifest.xml -I "$platform" -S android/smoke/res -A "$output/assets" -F "$output/unsigned.apk" -J "$output/generated" -m
javac --release 8 -classpath "$platform" -d "$output/classes" android/smoke/*.java "$output/generated/dev/susfs/studio/smoke/R.java"
jar cf "$output/classes.jar" -C "$output/classes" .
"$tools/d8" --min-api 26 --lib "$platform" --output "$output/dex" "$output/classes.jar"
cp "$output/dex/classes.dex" "$output/classes.dex"
(cd "$output" && "$tools/aapt" add unsigned.apk classes.dex lib/arm64-v8a/libstudioctl.so >/dev/null)
"$tools/zipalign" 4 "$output/unsigned.apk" "$output/aligned.apk"
"$tools/apksigner" sign --ks "$keystore" --ks-key-alias androiddebugkey \
    --ks-pass pass:android --key-pass pass:android --out "$output/studio-webview-smoke.apk" "$output/aligned.apk"
"$tools/apksigner" verify "$output/studio-webview-smoke.apk"
printf '%s\n' "$output/studio-webview-smoke.apk"
