#!/usr/bin/env bash
set -euo pipefail

cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

fail() { echo "FAILED: $*" >&2; exit 1; }

# 1) Ensure no real credentials files exist
[[ ! -f credentials/jwt.txt ]] || fail "credentials/jwt.txt exists"
[[ ! -f credentials/address.txt ]] || fail "credentials/address.txt exists"

# 2) Ensure no JWT blobs accidentally exist
if grep -RIn --exclude-dir=node_modules --exclude=package-lock.json \
  --exclude=publish-check.sh --exclude=PUBLISHING.md \
  --exclude=README.md --exclude=README_CN.md \
  -E "eyJhbGci|Bearer eyJ" . >/dev/null; then
  fail "JWT-like blob detected in repository"
fi

# 3) Ensure no hardcoded workspace paths exist
if grep -RIn --exclude-dir=node_modules --exclude=package-lock.json \
  --exclude=publish-check.sh --exclude=PUBLISHING.md \
  "/root/.openclaw/workspace" . >/dev/null; then
  fail "hardcoded /root/.openclaw/workspace path detected"
fi

echo "OK"
