#!/usr/bin/env bash
set -euo pipefail

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
version="$(node -p "require('${root_dir}/package.json').version")"
platform="$(node -p "process.platform + '-' + process.arch")"
# node_modules holds native binaries (Remotion compositor, rspack, esbuild) for the build platform only.
output="${1:-${root_dir}/dist/keelokit-studio-${version}-${platform}.zip}"
stage="$(mktemp -d /tmp/keelokit-studio-package.XXXXXX)"
trap 'rm -rf -- "$stage"' EXIT

mkdir -p "$(dirname "$output")" "$stage/plugin"
for item in .claude-plugin agents commands docs recipes references schemas scripts skills src LICENSE README.md package.json package-lock.json; do
  cp -R "${root_dir}/${item}" "$stage/plugin/"
done

rm -rf -- "$stage/plugin/docs/build" "$stage/plugin/scripts/test-install.sh" "$stage/plugin/scripts/test-load.mjs" "$stage/plugin/scripts/verify-portability.mjs" "$stage/plugin/scripts/package-plugin.sh"
npm ci --omit=dev --ignore-scripts --no-audit --no-fund --prefix "$stage/plugin"

# Smoke test the staged package exactly as shipped, on a throwaway consumer project.
consumer="$(mktemp -d /tmp/keelokit-studio-smoke.XXXXXX)"
trap 'rm -rf -- "$stage" "$consumer"' EXIT
node --no-warnings "$stage/plugin/scripts/studio-start.mjs" --project-root "$consumer" --project-id package-smoke >/dev/null
cat > "$stage/plugin/.smoke.mjs" <<'SMOKE'
for (const module of ["agency/start", "render/remotion-adapter", "dashboard/store", "adapters/web-capture", "qa/export"]) await import(`./src/${module}.mjs`);
await import("@remotion/renderer");
await import("playwright");
SMOKE
node --no-warnings "$stage/plugin/.smoke.mjs"
rm -f -- "$stage/plugin/.smoke.mjs"
test -f "$consumer/.keelokit/studio/state.json"

(
  cd "$stage/plugin"
  zip -q -r "$output" . -x '*.DS_Store' 'node_modules/.cache/*'
)

printf '%s\n' "$output"
