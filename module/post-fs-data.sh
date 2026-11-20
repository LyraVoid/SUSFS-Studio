#!/system/bin/sh

MODDIR=${0%/*}
STUDIOCTL="$MODDIR/bin/studioctl"

[ -x "$STUDIOCTL" ] || exit 0

/system/bin/log -t SUSFS_STUDIO "post-fs-data begin"

enabled=$("$STUDIOCTL" boot-enabled)
case "$enabled" in
  *'"status":"enabled"'*) ;;
  *)
    /system/bin/log -t SUSFS_STUDIO "automatic disabled"
    exit 0
    ;;
esac

if [ ! -w /proc/susfs_kstat ] &&
  [ -f /data/adb/ksu/lkm/susfs_guard_lkm/module.ko ]; then
  /system/bin/timeout 20 /data/adb/ksud insmod \
    /data/adb/ksu/lkm/susfs_guard_lkm/module.ko >/dev/null 2>&1 || true
  /system/bin/log -t SUSFS_STUDIO "provider load attempted"
fi

i=0
while [ ! -w /proc/susfs_kstat ] && [ "$i" -lt 50 ]; do
  sleep 0.1
  i=$((i + 1))
done

if [ -w /proc/susfs_kstat ]; then
  /system/bin/log -t SUSFS_STUDIO "provider ready"
else
  /system/bin/log -t SUSFS_STUDIO "provider missing"
fi

run_boot() {
  phase="$1"
  attempts="$2"
  attempt=0
  while [ "$attempt" -lt "$attempts" ]; do
    result=$(/system/bin/timeout 5 "$STUDIOCTL" boot "$phase")
    case "$result" in
      *'"planId":'*)
        plan_id=${result#*'"planId":"'}
        plan_id=${plan_id%%'"'*}
        /system/bin/log -t SUSFS_STUDIO "$phase accepted $plan_id"
        return
        ;;
    esac
    sleep 0.2
    attempt=$((attempt + 1))
  done
  /system/bin/log -t SUSFS_STUDIO "$phase unavailable: $result"
}

run_boot pre-mount 25
run_boot late-pre-mount 5
