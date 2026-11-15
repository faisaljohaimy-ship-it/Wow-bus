#!/usr/bin/env bash
# Install the security tools the connectors run, at pinned versions:
#   Semgrep, Bandit and pip-audit into one Python virtual environment;
#   Gitleaks, OSV-Scanner and Trivy as release binaries for Linux x86_64.
#
# Usage: bash scripts/install-tools.sh [--check] [BIN_DIR] [VENV_DIR]
#   BIN_DIR   where the commands are placed    (default: /usr/local/bin)
#   VENV_DIR  the Python virtual environment   (default: /opt/sectools-venv)
#   --check   check the arguments and both directories, print what would be
#             done, and stop: nothing is created, downloaded or installed
#
# The default directories need root. Without root, name two directories you
# own and put the first one on PATH:
#   bash scripts/install-tools.sh ~/.local/bin ~/sectools-venv
#
# Exit status: 0 when the directories were usable, even if a tool could not be
# installed (each tool reports OK or BLOCKED on its own line); 1 when a
# directory cannot be created or written; 2 for wrong arguments.
#
# Downloads are not checksum-verified: they rely on HTTPS to pypi.org and github.com.
set -u

USAGE="Usage: bash scripts/install-tools.sh [--check] [BIN_DIR] [VENV_DIR]"
TWO_ARG_FORM="bash scripts/install-tools.sh ~/.local/bin ~/sectools-venv"
log(){ echo "[install-tools] $*"; }
fail(){ echo "[install-tools] $1" >&2; exit "${2:-1}"; }

CHECK=0
ARGS=()
for arg in "$@"; do
  case "$arg" in
    --check) CHECK=1 ;;
    # The comment block at the top of this file is the help text.
    -h|--help) awk 'NR>1 && /^#/ {sub(/^# ?/, ""); print; next} NR>1 {exit}' "$0"; exit 0 ;;
    -*) fail "unknown option '$arg'. $USAGE" 2 ;;
    *) ARGS+=("$arg") ;;
  esac
done
[ "${#ARGS[@]}" -le 2 ] || fail "expected at most two directories, got ${#ARGS[@]}. $USAGE" 2
BIN="${ARGS[0]:-/usr/local/bin}"
VENV="${ARGS[1]:-/opt/sectools-venv}"

# True when the directory is writable, or can be created because the nearest
# existing path above it is a writable directory. Creates nothing.
can_write_dir(){
  local d="$1"
  while [ ! -e "$d" ] && [ ! -L "$d" ]; do d="$(dirname -- "$d")"; done
  [ -d "$d" ] && [ -w "$d" ] && [ -x "$d" ]
}
unusable(){
  local why=""
  [ "${#ARGS[@]}" -eq 2 ] || why=" The default directories need root."
  fail "cannot create or write to $1.$why Name two directories you own: $TWO_ARG_FORM"
}

can_write_dir "$BIN" || unusable "$BIN"
can_write_dir "$VENV" || unusable "$VENV"

if [ "$CHECK" = 1 ]; then
  log "check only: nothing was created, downloaded or installed"
  log "commands would be placed in: $BIN"
  log "python virtual environment:  $VENV"
  exit 0
fi

mkdir -p -- "$BIN" "$VENV" 2>/dev/null || true
[ -d "$BIN" ] || unusable "$BIN"
[ -d "$VENV" ] || unusable "$VENV"
# Absolute paths: the links placed in BIN_DIR point into VENV_DIR.
BIN="$(cd -- "$BIN" && pwd)" || unusable "$BIN"
VENV="$(cd -- "$VENV" && pwd)" || unusable "$VENV"

# A private CA bundle (for example behind a TLS-inspecting proxy) is used only
# when SSL_CERT_FILE names it; otherwise curl and pip use their default trust.
if [ -n "${SSL_CERT_FILE:-}" ] && [ -f "$SSL_CERT_FILE" ]; then
  export SSL_CERT_FILE CURL_CA_BUNDLE="$SSL_CERT_FILE"
fi

# Downloads go to a private directory that is removed when the script ends.
WORK="$(mktemp -d)" || fail "cannot create a temporary directory (mktemp -d failed)"
trap 'rm -rf -- "$WORK"' EXIT

# first_line COMMAND...: the first line the command prints, or false if it does not run.
first_line(){
  local out
  out="$("$@" 2>&1)" || return 1
  printf '%s\n' "$out" | head -1
}
# installed NAME COMMAND...: report OK with the version, or BLOCKED when the
# installed command does not run here (for example on another CPU type).
installed(){
  local name="$1" version
  shift
  if version="$(first_line "$@")"; then log "$name OK: $version"
  else log "$name BLOCKED: installed, but it does not run on this machine"; fi
}

# --- Python tools (pinned) ---
if python3 -m venv "$VENV" >/dev/null 2>&1; then
  "$VENV/bin/pip" -q install --upgrade pip >/dev/null 2>&1 || true
  for spec in "semgrep==1.185.0" "bandit==1.9.4" "pip-audit==2.10.1"; do
    name="${spec%%=*}"
    if "$VENV/bin/pip" -q install "$spec" >/dev/null 2>&1; then
      ln -sf "$VENV/bin/$name" "$BIN/$name"
      installed "$name" "$BIN/$name" --version
    else
      log "$name BLOCKED: pip install failed"
    fi
  done
else
  for name in semgrep bandit pip-audit; do
    log "$name BLOCKED: 'python3 -m venv $VENV' failed (is the Python venv module installed?)"
  done
fi

# --- Gitleaks (pinned) ---
GL=8.21.2
if curl -fsSL "https://github.com/gitleaks/gitleaks/releases/download/v${GL}/gitleaks_${GL}_linux_x64.tar.gz" -o "$WORK/gitleaks.tgz" 2>/dev/null \
   && tar -xzf "$WORK/gitleaks.tgz" -C "$WORK" gitleaks 2>/dev/null \
   && install -m755 "$WORK/gitleaks" "$BIN/gitleaks"; then
  installed gitleaks "$BIN/gitleaks" version
else log "gitleaks BLOCKED: download failed"; fi

# --- OSV-Scanner (pinned) ---
OSV=1.9.2
if curl -fsSL "https://github.com/google/osv-scanner/releases/download/v${OSV}/osv-scanner_linux_amd64" -o "$WORK/osv-scanner" 2>/dev/null \
   && install -m755 "$WORK/osv-scanner" "$BIN/osv-scanner"; then
  installed osv-scanner "$BIN/osv-scanner" --version
else log "osv-scanner BLOCKED: download failed"; fi

# --- Trivy (pinned; optional) ---
TV=0.58.1
if curl -fsSL "https://github.com/aquasecurity/trivy/releases/download/v${TV}/trivy_${TV}_Linux-64bit.tar.gz" -o "$WORK/trivy.tgz" 2>/dev/null \
   && tar -xzf "$WORK/trivy.tgz" -C "$WORK" trivy 2>/dev/null \
   && install -m755 "$WORK/trivy" "$BIN/trivy"; then
  installed trivy "$BIN/trivy" --version
else log "trivy BLOCKED: download failed (optional: OSV-Scanner and pip-audit cover dependencies)"; fi

echo ""
log "resolution on PATH:"
for t in semgrep bandit pip-audit gitleaks osv-scanner trivy; do
  echo "  $t -> $(command -v "$t" 2>/dev/null || echo "MISSING (is $BIN on PATH?)")"
done
echo ""
log "run 'make verify' (or python3 scripts/verify.py) to see what the platform can use."
