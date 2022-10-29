#!/usr/bin/env sh

mkdir -p ./images
cd ./images
wget -O images.zip $DISK_URL
unzip -o images.zip
rm -r __MACOSX images.zip
cd -
ls images
