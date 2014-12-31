#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

echo "=== Building all packages ==="
pnpm run build:all

echo ""
echo "=== Publishing packages to npm ==="

PACKAGES=(
  core config log cli validation
  auth cache store
  http rpc gateway
  breaker limit resilience governance
  discovery tracing metrics
  queue
)

FAILED=()

for pkg in "${PACKAGES[@]}"; do
  dir="packages/$pkg"
  if [ ! -f "$dir/package.json" ]; then
    echo "  SKIP  $pkg (no package.json)"
    continue
  fi

  echo -n "  npm publish $pkg ... "
  if (cd "$dir" && npm publish --access public 2>&1); then
    echo "OK"
  else
    echo "FAILED"
    FAILED+=("$pkg")
  fi
done

echo ""
if [ ${#FAILED[@]} -eq 0 ]; then
  echo "=== All packages published successfully ==="
else
  echo "=== Failed packages: ${FAILED[*]} ==="
  exit 1
fi
