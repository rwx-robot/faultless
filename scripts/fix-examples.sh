#!/bin/bash
# Fix all 13 example applications to run independently
set -e

EXAMPLES_DIR="$(cd "$(dirname "$0")/.." && pwd)/examples"

for dir in "$EXAMPLES_DIR"/v*/; do
  name=$(basename "$dir")
  echo "=== Fixing $name ==="
  
  # Fix package.json: replace workspace:* with relative paths
  if [ -f "$dir/package.json" ]; then
    # Replace workspace:* with relative paths to packages
    sed -i.bak \
      -e 's|"@nofault/core": "workspace:\*"|"@nofault/core": "../packages/core"|g' \
      -e 's|"@nofault/http": "workspace:\*"|"@nofault/http": "../packages/http"|g' \
      -e 's|"@nofault/log": "workspace:\*"|"@nofault/log": "../packages/log"|g' \
      -e 's|"@nofault/config": "workspace:\*"|"@nofault/config": "../packages/config"|g' \
      -e 's|"@nofault/breaker": "workspace:\*"|"@nofault/breaker": "../packages/breaker"|g' \
      -e 's|"@nofault/limit": "workspace:\*"|"@nofault/limit": "../packages/limit"|g' \
      -e 's|"@nofault/discovery": "workspace:\*"|"@nofault/discovery": "../packages/discovery"|g' \
      -e 's|"@nofault/resilience": "workspace:\*"|"@nofault/resilience": "../packages/resilience"|g' \
      -e 's|"@nofault/rpc": "workspace:\*"|"@nofault/rpc": "../packages/rpc"|g' \
      -e 's|"@nofault/cache": "workspace:\*"|"@nofault/cache": "../packages/cache"|g' \
      -e 's|"@nofault/store": "workspace:\*"|"@nofault/store": "../packages/store"|g' \
      -e 's|"@nofault/tracing": "workspace:\*"|"@nofault/tracing": "../packages/tracing"|g' \
      -e 's|"@nofault/metrics": "workspace:\*"|"@nofault/metrics": "../packages/metrics"|g' \
      -e 's|"@nofault/gateway": "workspace:\*"|"@nofault/gateway": "../packages/gateway"|g' \
      -e 's|"@nofault/cli": "workspace:\*"|"@nofault/cli": "../packages/cli"|g' \
      -e 's|"@nofault/validation": "workspace:\*"|"@nofault/validation": "../packages/validation"|g' \
      -e 's|"@nofault/queue": "workspace:\*"|"@nofault/queue": "../packages/queue"|g' \
      -e 's|"@nofault/governance": "workspace:\*"|"@nofault/governance": "../packages/governance"|g' \
      -e 's|"@nofault/auth": "workspace:\*"|"@nofault/auth": "../packages/auth"|g' \
      -e 's|"@nofault/limit": "workspace:\*"|"@nofault/limit": "../packages/limit"|g' \
      "$dir/package.json"
    
    # Remove .bak file
    rm -f "$dir/package.json.bak"
    
    echo "  Fixed package.json workspace references"
  fi
  
  # Create tsconfig.json if missing
  if [ ! -f "$dir/tsconfig.json" ]; then
    cat > "$dir/tsconfig.json" << 'TSCONFIG'
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
TSCONFIG
    echo "  Created tsconfig.json"
  fi
done

echo ""
echo "=== All examples fixed ==="
echo "Run 'cd <example-dir> && npm install && npx tsx src/index.ts' to test"
