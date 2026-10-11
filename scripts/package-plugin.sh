#!/usr/bin/env bash
set -euo pipefail

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
version="$(node -p "require('${root_dir}/package.json').version")"
output="${1:-${root_dir}/dist/keelokit-studio-${version}.zip}"
stage="$(mktemp -d /tmp/keelokit-studio-package.XXXXXX)"
trap 'rm -rf -- "$stage"' EXIT

mkdir -p "$(dirname "$output")" "$stage/plugin"
for item in .claude-plugin agents commands docs recipes references schemas scripts skills src LICENSE README.md package.json package-lock.json; do
  cp -R "${root_dir}/${item}" "$stage/plugin/"
done

rm -rf -- "$stage/plugin/docs/build" "$stage/plugin/scripts/test-install.sh" "$stage/plugin/scripts/test-load.mjs"
npm ci --omit=dev --ignore-scripts --no-audit --no-fund --prefix "$stage/plugin"

(
  cd "$stage/plugin"
  zip -q -r "$output" . -x '*.DS_Store' 'node_modules/.cache/*'
)

printf '%s\n' "$output"
