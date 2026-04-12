#!/usr/bin/env sh
# Produce the images zip that CI's DISK_URL secret should point at.
# Inverse of download-disk.sh: flat archive of windows95.img + default-state.bin.
set -e
OUT="${1:-images_$(date +%Y%m%d).zip}"
cd images
zip -9 "../$OUT" windows95.img default-state.bin
cd -
ls -lh "$OUT"
