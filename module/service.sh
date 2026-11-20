#!/system/bin/sh

MODDIR=${0%/*}
STUDIOCTL="$MODDIR/bin/studioctl"

[ -x "$STUDIOCTL" ] || exit 0
/system/bin/log -t SUSFS_STUDIO "service begin"

run_boot() {
  phase="$1"
  result=$(/system/bin/timeout 20 "$STUDIOCTL" boot "$phase")
  case "$result" in
    *'"planId":'*)
      plan_id=${result#*'"planId":"'}
      plan_id=${plan_id%%'"'*}
      /system/bin/log -t SUSFS_STUDIO "$phase accepted $plan_id"
      ;;
    *) /system/bin/log -t SUSFS_STUDIO "$phase unavailable: $result" ;;
  esac
}

run_boot post-mount
run_boot late-load
