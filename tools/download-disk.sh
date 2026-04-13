#!/usr/bin/env bash
set -euo pipefail

# Pulls the disk image from a private GitHub release.
# Requires:
#   DISK_REPO   - e.g. felixrieseberg/windows95-images
#   DISK_TAG    - e.g. v5
#   GH_TOKEN    - a token with read access to DISK_REPO (set by the workflow)

: "${DISK_REPO:?DISK_REPO not set}"
: "${DISK_TAG:?DISK_TAG not set}"
: "${GH_TOKEN:?GH_TOKEN not set}"

mkdir -p ./images
cd ./images

gh release download "$DISK_TAG" -R "$DISK_REPO" -p '*.zip' -O images.zip --clobber

if ! unzip -tq images.zip > /dev/null; then
  echo "::error::Downloaded file is not a valid zip (size: $(wc -c < images.zip) bytes)."
  exit 1
fi

unzip -o images.zip
rm -f images.zip
rm -rf __MACOSX
cd -

if [ ! -f images/windows95.img ]; then
  echo "::error::images/windows95.img not found after extraction"
  ls -la images/
  exit 1
fi

ls -la images/
