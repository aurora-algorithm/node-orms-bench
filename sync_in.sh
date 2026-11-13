#!/bin/bash
# Copies the bench code (not node_modules, builds or results) from the repo into the rig's ~/ormbench, where it runs.
set -euo pipefail
cd "$(dirname "$0")"
docker exec -u dev longs-rig mkdir -p /home/dev/ormbench
COPYFILE_DISABLE=1 tar --no-mac-metadata --exclude=node_modules --exclude=dist --exclude=generated --exclude=results \
  --exclude=__pycache__ -cf - . | docker exec -i -u dev longs-rig tar --warning=no-unknown-keyword -xf - -C /home/dev/ormbench
