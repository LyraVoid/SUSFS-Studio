#!/system/bin/sh

if [ "$ARCH" != "arm64" ]; then
  abort "Unsupported architecture: $ARCH"
fi
if [ ! -f "$MODPATH/bin/studioctl" ]; then
  abort "Missing diagnostic executable"
fi
set_perm "$MODPATH/bin/studioctl" 0 0 0755
