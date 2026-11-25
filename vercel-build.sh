#!/usr/bin/env bash
# Builds the site on Vercel: download city data, crunch it, build the static app.
set -euo pipefail
PY=$(command -v python3.12 || command -v python3.13 || command -v python3)
echo "Using $PY ($($PY --version))"
$PY -m pip install --quiet "pandas>=2.2" || $PY -m pip install --quiet --user "pandas>=2.2" || $PY -m pip install --quiet --break-system-packages "pandas>=2.2"
node etl/fetch.mjs
$PY etl/build.py
cd web && npm run build
