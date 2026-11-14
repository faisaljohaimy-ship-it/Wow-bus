#!/bin/sh
# Container entrypoint for the single-image deploy.
#
# Starts as root only long enough to make the data directory writable for the
# unprivileged service user, then drops privileges for good. Hosts that mount a
# root-owned disk (for example a Fly volume at /data) would otherwise leave the
# service unable to write its database. If the host already runs the container
# as a non-root user, or does not allow changing user, the command runs as-is.
set -eu

DATA_DIR="${FSL_DATA_DIR:-/data}"
RUN_UID=10001
RUN_GID=10001

if [ "$(id -u)" = "0" ]; then
  mkdir -p "$DATA_DIR" 2>/dev/null || true
  chown -R "$RUN_UID:$RUN_GID" "$DATA_DIR" 2>/dev/null || true
  if setpriv --reuid="$RUN_UID" --regid="$RUN_GID" --init-groups true 2>/dev/null; then
    export HOME=/home/fsl
    exec setpriv --reuid="$RUN_UID" --regid="$RUN_GID" --init-groups "$@"
  fi
  echo "[entrypoint] could not drop privileges; continuing as the current user" >&2
fi
exec "$@"
