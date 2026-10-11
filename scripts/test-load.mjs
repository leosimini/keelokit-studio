import assert from "node:assert/strict";
import {mkdtemp, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {dirname, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {spawnSync} from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const config = await mkdtemp(resolve(tmpdir(), "keelokit-studio-load-"));

try {
  const result = spawnSync(
    resolve(root, "node_modules/.bin/claude"),
    [
      "--plugin-dir",
      root,
      "--print",
      "--verbose",
      "--output-format",
      "stream-json",
      "--max-turns",
      "1",
      "--tools",
      ""
    ],
    {
      input: "Return the Keelokit Studio foundation status.",
      cwd: root,
      encoding: "utf8",
      env: {...process.env, CLAUDE_CONFIG_DIR: config}
    }
  );

  const events = result.stdout.trim().split(/\n/).filter(Boolean).map(JSON.parse);
  const init = events.find((event) => event.type === "system" && event.subtype === "init");
  assert.ok(init, `Claude Code did not emit an init event: ${result.stderr}`);
  assert.ok(init.plugins.some(({name, version}) => name === "keelokit-studio" && version === "0.1.0"));
  assert.ok(init.slash_commands.includes("keelokit-studio:start"));
  assert.ok(init.skills.includes("keelokit-studio:keelokit-studio"));
  for (const agent of ["content-strategist", "creative-director", "motion-director", "asset-producer", "editorial-critic"]) assert.ok(init.agents.includes(`keelokit-studio:${agent}`), `Claude Code did not discover ${agent}`);

  const final = events.findLast((event) => event.type === "result");
  // Loading is what this script verifies. Model execution depends on the environment: no login fails, a login runs one tool-less turn.
  if (result.status !== 0) {
    assert.ok(final?.result === "Not logged in · Please run /login" || final?.subtype === "error_max_turns", `Unexpected model outcome: ${final?.subtype ?? final?.result}`);
  }

  console.log("Claude Code loaded keelokit-studio 0.1.0 with its start command, orchestration skill, and five specialist agents.");
  if (result.status !== 0) {
    console.log(`Model execution ended with ${final?.subtype ?? final?.result}; only plugin loading is asserted.`);
  }
} finally {
  await rm(config, {recursive: true, force: true});
}

