import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";

const plugin = JSON.parse(await readFile(new URL("../.claude-plugin/plugin.json", import.meta.url)));
const marketplace = JSON.parse(await readFile(new URL("../.claude-plugin/marketplace.json", import.meta.url)));

test("plugin and local marketplace describe the same package", () => {
  const entry = marketplace.plugins.find(({name}) => name === plugin.name);
  assert.ok(entry);
  assert.equal(entry.description, plugin.description);
  assert.equal(entry.source, "./");
});

test("foundation exposes the namespaced start command and orchestration skill", async () => {
  const command = await readFile(new URL("../commands/start.md", import.meta.url), "utf8");
  const skill = await readFile(new URL("../skills/keelokit-studio/SKILL.md", import.meta.url), "utf8");
  assert.match(command, /^---[\s\S]+description:/);
  assert.match(skill, /^---[\s\S]+name: keelokit-studio/m);
  assert.match(skill, /Silence is not approval/);
});

