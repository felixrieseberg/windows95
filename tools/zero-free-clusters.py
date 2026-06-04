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


def first_partition_offset(f) -> int:
    """Byte offset of the first partition, read from the MBR.

    Same derivation as src/renderer/utils/fat32-extract.ts — never hardcode
    this; src/constants.ts contemplates the disk being repartitioned someday.
    """
    f.seek(0)
    mbr = f.read(512)
    if mbr[510:512] != b"\x55\xaa":
        sys.exit("no MBR boot signature — is this a raw disk image?")
    start_lba = struct.unpack_from("<I", mbr, 0x1BE + 8)[0]
    if start_lba == 0:
        sys.exit("MBR has no first partition")
    return start_lba * 512


def main() -> None:
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    path = sys.argv[1]

    with open(path, "r+b") as f:
        part_offset = first_partition_offset(f)

        f.seek(part_offset)
        boot = f.read(512)
        bytes_per_sector = struct.unpack("<H", boot[11:13])[0]
        sectors_per_cluster = boot[13]
        reserved = struct.unpack("<H", boot[14:16])[0]
        nfats = boot[16]
        total_sectors = struct.unpack("<I", boot[32:36])[0]
        sectors_per_fat = struct.unpack("<I", boot[36:40])[0]

        cluster_size = bytes_per_sector * sectors_per_cluster
        fat_offset = part_offset + reserved * bytes_per_sector
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
        end = min(n_entries, cluster_count + 2)  # clusters are numbered from 2

        # Walk the FAT coalescing consecutive free clusters into runs, and do
        # large reads / batched writes. Per-cluster 4 KB I/O takes minutes on
        # a ~700 MB free region; this takes seconds.
        max_run = (8 * 1024 * 1024) // cluster_size  # clusters per I/O
        zero_cluster = bytes(cluster_size)
        zeroed = 0

        c = 2
        while c < end:
            if (fat[c] & 0x0FFFFFFF) != 0:
                c += 1
                continue

            run_start = c
            while (
                c < end
                and (fat[c] & 0x0FFFFFFF) == 0
                and c - run_start < max_run
            ):
                c += 1
            run_len = c - run_start

            off = data_offset + (run_start - 2) * cluster_size
            f.seek(off)
            data = f.read(run_len * cluster_size)
            if data.count(0) == len(data):
                continue  # whole run is already zero

            # Zero only the dirty clusters, batching contiguous ones into a
            # single write (keeps already-zero clusters untouched, which
            # preserves APFS copy-on-write sharing with cloned backups).
            i = 0
            while i < run_len:
                if data[i * cluster_size : (i + 1) * cluster_size] == zero_cluster:
                    i += 1
                    continue
                j = i
                while (
                    j < run_len
                    and data[j * cluster_size : (j + 1) * cluster_size]
                    != zero_cluster
                ):
                    j += 1
                f.seek(off + i * cluster_size)
                f.write(bytes((j - i) * cluster_size))
                zeroed += j - i
                i = j

        print(
            f"zeroed {zeroed} dirty free clusters "
            f"({zeroed * cluster_size / 1048576:.1f} MB)"
        )


if __name__ == "__main__":
    main()
