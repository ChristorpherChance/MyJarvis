#!/bin/sh
# Read SMART information once; do not request a disk self-test or schedule.
set -eu
export LC_ALL=C
/sbin/get_hd_smartinfo -d 1
