import assert from "node:assert/strict";
import {cp, mkdtemp, rm} from "node:fs/promises";
import {spawnSync} from "node:child_process";
import {tmpdir} from "node:os";
import {resolve} from "node:path";
import test from "node:test";

test("entry scripts explain how to install dependencies instead of crashing when node_modules is absent", async () => {
  const copy = await mkdtemp(resolve(tmpdir(), "keelokit-nodeps-"));
  const consumer = await mkdtemp(resolve(tmpdir(), "keelokit-consumer-"));
  try {
    for (const item of ["scripts", "src", "schemas", "recipes", "package.json", "package-lock.json"]) await cp(resolve(item), resolve(copy, item), {recursive: true});
    for (const [script, args] of [["studio-start.mjs", ["--project-root", consumer, "--project-id", "demo"]], ["studio-state.mjs", []], ["studio-dashboard.mjs", [consumer, "43999"]], ["validate-contracts.mjs", [consumer]]]) {
      const result = spawnSync(process.execPath, ["--no-warnings", resolve(copy, "scripts", script), ...args], {encoding: "utf8"});
      assert.equal(result.status, 3, `${script}: ${result.stderr}`);
      assert.match(result.stderr, /npm ci --omit=dev --ignore-scripts/);
      assert.doesNotMatch(result.stderr, /ERR_MODULE_NOT_FOUND/);
    }
  } finally {
    await rm(copy, {recursive: true, force: true});
    await rm(consumer, {recursive: true, force: true});
  }
});
