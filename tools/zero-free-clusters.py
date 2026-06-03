#!/usr/bin/env python3
"""Zero the free clusters of the windows95 FAT32 disk image.

Writes zeros into every cluster whose FAT entry is 0 (free), so that
deleted-file remnants stop bloating the compressed image. All filesystem
metadata (boot sector, FSInfo, FATs, directories) is left byte-identical —
this only changes the content of clusters the filesystem considers empty.

Why not just copy in a giant zero file and delete it (the classic trick)?
Because that churns the FAT through mtools, and the resulting image
deterministically fails Win95 cold boot in v86 with "Invalid VxD dynamic
link call" (while booting fine in QEMU). Writing zeros directly, without
touching any metadata, was verified to cold-boot in the app.

Usage: tools/zero-free-clusters.py <image>
"""
import struct
import sys

PARTITION_OFFSET = 32256  # sector 63 * 512


def main() -> None:
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    path = sys.argv[1]

    with open(path, "r+b") as f:
        f.seek(PARTITION_OFFSET)
        boot = f.read(512)
        bytes_per_sector = struct.unpack("<H", boot[11:13])[0]
        sectors_per_cluster = boot[13]
        reserved = struct.unpack("<H", boot[14:16])[0]
        nfats = boot[16]
        total_sectors = struct.unpack("<I", boot[32:36])[0]
        sectors_per_fat = struct.unpack("<I", boot[36:40])[0]

        cluster_size = bytes_per_sector * sectors_per_cluster
        fat_offset = PARTITION_OFFSET + reserved * bytes_per_sector
        fat_bytes = sectors_per_fat * bytes_per_sector
        data_offset = fat_offset + nfats * fat_bytes

        f.seek(fat_offset)
        fat_raw = f.read(fat_bytes)
        f.seek(fat_offset + fat_bytes)
        if f.read(fat_bytes) != fat_raw:
            sys.exit("FAT1 != FAT2 — filesystem is inconsistent, run fsck first")

        n_entries = len(fat_raw) // 4
        fat = struct.unpack(f"<{n_entries}I", fat_raw)

        # The FAT is sector-padded, so it has more entry slots than the
        # partition has actual clusters. Never touch entries past the real
        # cluster count — writing there lands beyond the partition (and can
        # even grow the image file).
        data_sectors = total_sectors - reserved - nfats * sectors_per_fat
        cluster_count = data_sectors // sectors_per_cluster
        last_cluster = cluster_count + 1  # clusters are numbered from 2

        zero = bytes(cluster_size)
        zeroed = 0
        for c in range(2, min(n_entries, last_cluster + 1)):
            if (fat[c] & 0x0FFFFFFF) == 0:
                off = data_offset + (c - 2) * cluster_size
                f.seek(off)
                if f.read(cluster_size) != zero:
                    f.seek(off)
                    f.write(zero)
                    zeroed += 1

        print(
            f"zeroed {zeroed} dirty free clusters "
            f"({zeroed * cluster_size / 1048576:.1f} MB)"
        )


if __name__ == "__main__":
    main()
