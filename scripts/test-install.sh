#!/usr/bin/env bash
set -euo pipefail

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
fixture_dir="$(mktemp -d /tmp/keelokit-studio-install.XXXXXX)"
trap 'rm -rf -- "$fixture_dir"' EXIT

export CLAUDE_CONFIG_DIR="$fixture_dir/config"
mkdir -p "$fixture_dir/consumer"
cd "$fixture_dir/consumer"

"$root_dir/node_modules/.bin/claude" plugin marketplace add --scope local "$root_dir" --json
"$root_dir/node_modules/.bin/claude" plugin install --scope local keelokit-studio@keelokit-studio --json
"$root_dir/node_modules/.bin/claude" plugin list

test -f "$CLAUDE_CONFIG_DIR/plugins/installed_plugins.json"
rg -q 'keelokit-studio@keelokit-studio' "$CLAUDE_CONFIG_DIR/plugins/installed_plugins.json"

