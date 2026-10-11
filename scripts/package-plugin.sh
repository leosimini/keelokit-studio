#!/usr/bin/env bash
# Builds the zip people install Keelokit Studio from. Like Keelokit's, it holds only the plugin's
# source at its root (no node_modules), so it is identical on every platform. Dependencies are
# installed once on the machine that uses it:
#
#   unzip keelokit-studio-plugin.zip -d keelokit-studio && npm ci --omit=dev --ignore-scripts --prefix keelokit-studio
#
#   scripts/package-plugin.sh [out.zip]      # default: dist/keelokit-studio-plugin.zip
set -euo pipefail

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
output="${1:-${root_dir}/dist/keelokit-studio-plugin.zip}"
case "$output" in /*) ;; *) output="$PWD/$output" ;; esac
stage="$(mktemp -d /tmp/keelokit-studio-package.XXXXXX)"
trap 'rm -rf -- "$stage"' EXIT

mkdir -p "$(dirname "$output")" "$stage/plugin"
for item in .claude-plugin agents commands docs recipes references schemas scripts skills src LICENSE README.md README.es.md CHANGELOG.md package.json package-lock.json; do
  cp -R "${root_dir}/${item}" "$stage/plugin/"
done
rm -rf -- "$stage/plugin/docs/build" "$stage/plugin/scripts/test-install.sh" "$stage/plugin/scripts/test-load.mjs" "$stage/plugin/scripts/test-package.sh" "$stage/plugin/scripts/verify-portability.mjs" "$stage/plugin/scripts/package-plugin.sh"
find "$stage/plugin" -name '.DS_Store' -delete

# Fixed timestamps and ordering make the zip reproducible from the same sources.
find "$stage/plugin" -exec touch -h -d '2026-01-01 00:00:00' {} +
rm -f -- "$output"
(cd "$stage/plugin" && find . -type f | LC_ALL=C sort | sed 's#^\./##' | zip -q -X "$output" -@)

printf '%s\n' "$output"
