#!/bin/sh
# Container entrypoint for the single-image deploy.
#
# Starts as root only long enough to make the data directory writable for the
# unprivileged service user, then drops privileges for good. Hosts that mount a
# root-owned disk (for example a Fly volume at /data) would otherwise leave the
# service unable to write its database. If the host already runs the container
# as a non-root user the command runs as-is.
#
# FSL_DATA_DIR is created and re-owned only when it is a dedicated directory.
# A relative path or a system location (/, /usr, /etc, /app, ...) is left
# untouched; the service then reports data_dir_unwritable and uses temporary
# storage.
#
#   FSL_REQUIRE_NONROOT=1     refuse to start when privileges cannot be dropped
#   FSL_ENTRYPOINT_DRY_RUN=1  print the decisions and exit; nothing is created,
#                             re-owned, dropped or executed
set -eu

RAW_DATA_DIR="${FSL_DATA_DIR:-/data}"
RUN_UID=10001
RUN_GID=10001
DRY_RUN="${FSL_ENTRYPOINT_DRY_RUN:-0}"
# Set below only when the drop fails; an inherited value would be a false report.
unset FSL_PRIVDROP_FAILED

# Prints the canonical form of $1 (symlinks and ".." resolved) when it may be
# created and re-owned for the service user; prints nothing otherwise.
dedicated_data_dir() {
  case "$1" in
    /*) ;;
    *) return 0 ;;
  esac
  resolved="$(realpath -m -- "$1" 2>/dev/null)" || return 0
  case "$resolved" in
    /) ;;
    /app|/app/*|/usr|/usr/*|/etc|/etc/*|/bin|/bin/*|/sbin|/sbin/*) ;;
    /lib|/lib/*|/lib32|/lib32/*|/lib64|/lib64/*|/libx32|/libx32/*) ;;
    /home|/home/*|/root|/root/*|/proc|/proc/*|/sys|/sys/*|/dev|/dev/*) ;;
    /boot|/boot/*|/run|/run/*) ;;
    /var|/tmp|/opt|/mnt|/srv|/media) ;;
    /*) printf '%s\n' "$resolved" ;;
  esac
}

owned_by_service_user() {
  [ "$(stat -c %u -- "$1" 2>/dev/null || true)" = "$RUN_UID" ]
}

# Decisions are reported only in dry-run mode.
decision() {
  if [ "$DRY_RUN" = "1" ]; then
    printf '%s\n' "$1"
  fi
}

DATA_DIR="$(dedicated_data_dir "$RAW_DATA_DIR")"
if [ -n "$DATA_DIR" ]; then
  decision "data-dir: accept $DATA_DIR"
else
  decision "data-dir: refuse $RAW_DATA_DIR"
fi

CHOWN=no
DROP=no
if [ "$(id -u)" = "0" ]; then
  DROP=yes
  if [ -z "$DATA_DIR" ]; then
    printf '%s\n' "[entrypoint] FSL_DATA_DIR='$RAW_DATA_DIR' is not a dedicated data directory; not creating or re-owning it" >&2
  else
    if [ "$DRY_RUN" != "1" ]; then
      mkdir -p -- "$DATA_DIR" 2>/dev/null || true
    fi
    # Ownership is changed once, not on every boot: a directory the service
    # user already owns is left alone.
    if ! owned_by_service_user "$DATA_DIR"; then
      CHOWN=yes
    fi
  fi
fi
decision "chown: $CHOWN"
decision "drop: $DROP"
if [ "$DRY_RUN" = "1" ]; then
  exit 0
fi

if [ "$CHOWN" = "yes" ]; then
  # -h re-owns a symlink itself, never the file it points to.
  chown -R -h "$RUN_UID:$RUN_GID" -- "$DATA_DIR" 2>/dev/null \
    || echo "[entrypoint] could not change the owner of $DATA_DIR" >&2
fi

if [ "$DROP" = "yes" ]; then
  if setpriv --reuid="$RUN_UID" --regid="$RUN_GID" --init-groups true 2>/dev/null; then
    export HOME=/home/fsl
    exec setpriv --reuid="$RUN_UID" --regid="$RUN_GID" --init-groups "$@"
  fi
  if [ "${FSL_REQUIRE_NONROOT:-0}" = "1" ]; then
    echo "[entrypoint] could not drop privileges and FSL_REQUIRE_NONROOT=1; not starting" >&2
    exit 1
  fi
  # The server reports this as a setup notice.
  export FSL_PRIVDROP_FAILED=1
  echo "[entrypoint] could not drop privileges; continuing as the current user" >&2
fi
exec "$@"
