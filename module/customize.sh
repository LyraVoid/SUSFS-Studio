#!/system/bin/sh

if [ "$ARCH" != "arm64" ]; then
  abort "Unsupported architecture: $ARCH"
fi
if [ ! -f "$MODPATH/bin/studioctl" ]; then
  abort "Missing diagnostic executable"
fi
set_perm "$MODPATH/bin/studioctl" 0 0 0755
command -v chcon >/dev/null 2>&1 &&
  chcon u:object_r:shell_exec:s0 "$MODPATH/bin/studioctl" 2>/dev/null || true
set_perm "$MODPATH/post-fs-data.sh" 0 0 0755
set_perm "$MODPATH/service.sh" 0 0 0755
