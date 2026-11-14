#!/usr/bin/env bash
# Install the real defensive security tools the connectors drive.
# Pinned versions; Python tools in a dedicated venv; Go binaries from official
# GitHub releases. Tolerant: records per-tool status and never fakes success.
#
# Usage: bash scripts/install-tools.sh [BIN_DIR] [VENV_DIR]
set -u
BIN="${1:-/usr/local/bin}"
VENV="${2:-/opt/sectools-venv}"
CA="${SSL_CERT_FILE:-/root/.ccr/ca-bundle.crt}"
[ -f "$CA" ] && export CURL_CA_BUNDLE="$CA" SSL_CERT_FILE="$CA"
mkdir -p "$BIN"
log(){ echo "[install-tools] $*"; }

# --- Python tools (pinned) ---
python3 -m venv "$VENV"
"$VENV/bin/pip" -q install --upgrade pip >/dev/null 2>&1 || true
for spec in "semgrep==1.185.0" "bandit==1.9.4" "pip-audit==2.10.1"; do
  name="${spec%%=*}"
  if "$VENV/bin/pip" -q install "$spec" >/dev/null 2>&1; then
    ln -sf "$VENV/bin/$name" "$BIN/$name"
    log "$name OK: $("$BIN/$name" --version 2>&1 | head -1)"
  else
    log "$name BLOCKED: pip install failed"
  fi
done

# --- Gitleaks (pinned) ---
GL=8.21.2
if curl -fsSL "https://github.com/gitleaks/gitleaks/releases/download/v${GL}/gitleaks_${GL}_linux_x64.tar.gz" -o /tmp/gl.tgz 2>/dev/null; then
  tar -xzf /tmp/gl.tgz -C /tmp gitleaks && install -m755 /tmp/gitleaks "$BIN/gitleaks" && log "gitleaks OK: $($BIN/gitleaks version 2>&1 | head -1)"
else log "gitleaks BLOCKED: download failed"; fi

# --- OSV-Scanner (pinned) ---
OSV=1.9.2
if curl -fsSL "https://github.com/google/osv-scanner/releases/download/v${OSV}/osv-scanner_linux_amd64" -o /tmp/osv 2>/dev/null; then
  install -m755 /tmp/osv "$BIN/osv-scanner" && log "osv-scanner OK: $($BIN/osv-scanner --version 2>&1 | head -1)"
else log "osv-scanner BLOCKED: download failed"; fi

# --- Trivy (optional; may be blocked by egress policy) ---
TV=0.58.1
if curl -fsSL "https://github.com/aquasecurity/trivy/releases/download/v${TV}/trivy_${TV}_Linux-64bit.tar.gz" -o /tmp/tv.tgz 2>/dev/null && tar -tzf /tmp/tv.tgz >/dev/null 2>&1; then
  tar -xzf /tmp/tv.tgz -C /tmp trivy && install -m755 /tmp/trivy "$BIN/trivy" && log "trivy OK: $($BIN/trivy --version 2>&1 | head -1)"
else log "trivy BLOCKED: release asset unreachable (OSV-Scanner + pip-audit cover dependencies)"; fi

echo ""
log "resolution:"
for t in semgrep bandit pip-audit gitleaks osv-scanner trivy; do
  echo "  $t -> $(command -v $t 2>/dev/null || echo MISSING)"
done
echo ""
log "run 'make verify' (or python3 scripts/verify.py) to sync the tool registry."
