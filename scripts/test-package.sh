#!/usr/bin/env bash
# Builds the zip and checks it the way a person installs it: unzip, install dependencies for this
# machine, then run the router, import the runtime and load the plugin in Claude Code.
set -euo pipefail

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
work="$(mktemp -d /tmp/keelokit-studio-package-test.XXXXXX)"
trap 'rm -rf -- "$work"' EXIT
read -r -a claude <<< "${CLAUDE_BIN:-npx --yes @anthropic-ai/claude-code@2.1.296}"
zip_file="$work/keelokit-studio-plugin.zip"

"$root_dir/scripts/package-plugin.sh" "$zip_file" >/dev/null
second="$work/second.zip"
"$root_dir/scripts/package-plugin.sh" "$second" >/dev/null
cmp -s "$zip_file" "$second" || { echo "package: the zip is not reproducible" >&2; exit 1; }

size="$(wc -c < "$zip_file")"
[ "$size" -lt 5000000 ] || { echo "package: zip is $size bytes; expected source only" >&2; exit 1; }
unzip -Z1 "$zip_file" | grep -q '^\.claude-plugin/plugin\.json$' || { echo "package: plugin.json is not at the zip root" >&2; exit 1; }
if unzip -Z1 "$zip_file" | grep -E '(^|/)(node_modules|tests|fixtures|\.git)(/|$)|\.map$'; then echo "package: unexpected entries" >&2; exit 1; fi
if unzip -Z1 "$zip_file" | grep -vE '^[A-Za-z0-9._/@+-]+$'; then echo "package: unsafe file names" >&2; exit 1; fi

unpacked="$work/plugin"
mkdir "$unpacked"
unzip -q "$zip_file" -d "$unpacked"

# Without dependencies the router must say how to install them.
consumer="$work/consumer"
mkdir "$consumer"
set +e
node --no-warnings "$unpacked/scripts/studio-start.mjs" --project-root "$consumer" --project-id package-test >/dev/null 2>"$work/preflight.err"
status=$?
set -e
[ "$status" -eq 3 ] && grep -q 'npm ci --omit=dev' "$work/preflight.err" || { echo "package: missing preflight message" >&2; exit 1; }

npm ci --omit=dev --ignore-scripts --no-audit --no-fund --prefix "$unpacked" >/dev/null
node --no-warnings "$unpacked/scripts/studio-start.mjs" --project-root "$consumer" --project-id package-test >/dev/null
test -f "$consumer/.keelokit/studio/state.json"
cat > "$unpacked/.import-check.mjs" <<'CHECK'
for (const module of ["agency/start", "render/remotion-adapter", "dashboard/store", "adapters/web-capture", "qa/export"]) await import(`./src/${module}.mjs`);
await import("@remotion/renderer");
await import("playwright");
CHECK
node --no-warnings "$unpacked/.import-check.mjs"
rm -f "$unpacked/.import-check.mjs"

export CLAUDE_CONFIG_DIR="$work/config"
for target in .claude-plugin/plugin.json .claude-plugin/marketplace.json commands skills; do
  "${claude[@]}" plugin validate "$unpacked/$target" --strict --json | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{if(!JSON.parse(s).success){console.error(s);process.exit(1)}})'
done
(cd "$consumer" && "${claude[@]}" --plugin-dir "$unpacked" --print --verbose --output-format stream-json --max-turns 1 --tools "" <<< "status" 2>/dev/null) | node -e '
let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{
  const init=s.split("\n").filter(Boolean).map(l=>{try{return JSON.parse(l)}catch{return null}}).find(e=>e&&e.type==="system"&&e.subtype==="init");
  if(!init||!init.slash_commands.includes("keelokit-studio:start")||init.agents.filter(a=>a.startsWith("keelokit-studio:")).length!==5){console.error("package: Claude Code did not load the unpacked zip");process.exit(1)}
})'
echo "Package check passed: $(basename "$zip_file") is $size bytes, reproducible, installs from source on this platform and loads in Claude Code."
