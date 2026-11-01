#!/bin/sh
# Local setup only. Cloudflare credentials are never used by this launcher.
set -eu
app_dir=$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)
cd "$app_dir"
if ! command -v node >/dev/null 2>&1; then
  for d in "$HOME"/.local/share/mise/installs/node/*/bin "$HOME"/.nvm/versions/node/*/bin /opt/homebrew/bin; do
    if [ -x "$d/node" ]; then PATH="$d:$PATH"; break; fi
  done
fi
export PATH
node -e 'if(Number(process.versions.node.split(".")[0])<24)throw Error("Use Node.js 24 or later.")'
runtime="$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies"
if [ -x "$runtime/python/bin/python3" ]; then
  TEMPLATEATLAS_PYTHON="$runtime/python/bin/python3"; export TEMPLATEATLAS_PYTHON
  PATH="$runtime/bin/override:$PATH"; export PATH
fi
export ASTRO_TELEMETRY_DISABLED=1 WRANGLER_SEND_METRICS=false
mkdir -p .wrangler
export WRANGLER_LOG_PATH="$app_dir/.wrangler/setup.log"
if [ ! -f node_modules/astro/package.json ]; then npm ci --no-audit --no-fund; fi
origins=../catalog/index.json
if [ -n "${TEMPLATEATLAS_CATALOG:-}" ]; then origins="$TEMPLATEATLAS_CATALOG"; fi
if [ ! -f "$origins" ] && [ -f ../private/active-index.json ]; then origins=../private/active-index.json; fi
if [ ! -f "$origins" ]; then echo "Place the private catalog next to the application directory."; exit 1; fi
node node_modules/wrangler/bin/wrangler.js d1 migrations apply DB --local --config wrangler.jsonc
if ! node scripts/check-local-install.mjs || [ ! -d .wrangler/state/v3/r2 ]; then
  node scripts/load-local-assets.mjs "$origins"
fi
if [ -f ../catalog/paper.json ]; then node src/search/load-local.mjs ../catalog/paper.json; else node src/search/load-local.mjs ../private/paper.json; fi
npm run build
echo "Open http://localhost:4321 in your browser. Press Control-C to stop."
exec node scripts/local-preview.mjs
