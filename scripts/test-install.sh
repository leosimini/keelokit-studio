#!/usr/bin/env bash
set -euo pipefail
read -r -a CLAUDE_BIN <<< "${CLAUDE_BIN:-npx --yes @anthropic-ai/claude-code@2.1.296}"

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
fixture_dir="$(mktemp -d /tmp/keelokit-studio-install.XXXXXX)"
trap 'rm -rf -- "$fixture_dir"' EXIT

export CLAUDE_CONFIG_DIR="$fixture_dir/config"
mkdir -p "$fixture_dir/consumer"
cd "$fixture_dir/consumer"

"${CLAUDE_BIN[@]}" plugin marketplace add --scope local "$root_dir" --json
"${CLAUDE_BIN[@]}" plugin install --scope local keelokit-studio@keelokit-studio --json
"${CLAUDE_BIN[@]}" plugin list

test -f "$CLAUDE_CONFIG_DIR/plugins/installed_plugins.json"
rg -q 'keelokit-studio@keelokit-studio' "$CLAUDE_CONFIG_DIR/plugins/installed_plugins.json"

