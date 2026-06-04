#!/usr/bin/env sh
# Produce the images zip to upload as a release on DISK_REPO
# (see "Uploading the packed image" in docs/qemu.md).
# Inverse of download-disk.sh: flat archive of windows95.img + default-state.bin.
set -e
OUT="${1:-images_$(date +%Y%m%d).zip}"
cd images
zip -9 "../$OUT" windows95.img default-state.bin
cd -
ls -lh "$OUT"
