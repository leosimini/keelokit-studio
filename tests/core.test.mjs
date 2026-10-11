import assert from "node:assert/strict";
import {mkdtemp, mkdir, rm, symlink} from "node:fs/promises";
import {tmpdir} from "node:os";
import {resolve} from "node:path";
import test from "node:test";
import {assessSurface, capabilityReport, CapabilityError} from "../src/core/capabilities.mjs";
import {stableId} from "../src/core/ids.mjs";
import {resolveConsumerPath} from "../src/core/paths.mjs";

test("stable IDs ignore object key order but preserve identity inputs", () => {
  const first = stableId("piece", {audience: "operators", locale: "en"}, "explainer");
  const reordered = stableId("piece", {locale: "en", audience: "operators"}, "explainer");
  const different = stableId("piece", {audience: "buyers", locale: "en"}, "explainer");
  assert.equal(first, reordered);
  assert.notEqual(first, different);
  assert.match(first, /^piece-[a-f0-9]{16}$/);
});

test("stable IDs reject values that do not have unambiguous JSON identity", () => {
  assert.throws(() => stableId("piece", new Date(0)), TypeError);
  assert.throws(() => stableId("piece", Number.NaN), TypeError);
  assert.throws(() => stableId("piece", undefined), TypeError);
  assert.throws(() => stableId("piece", [undefined]), TypeError);
  assert.throws(() => stableId("piece", Array(1)), TypeError);
  const disguisedSparse = Array(1);
  disguisedSparse.extra = "identity";
  assert.throws(() => stableId("piece", disguisedSparse), TypeError);
  const cyclic = {};
  cyclic.self = cyclic;
  assert.throws(() => stableId("piece", cyclic), TypeError);
});

test("consumer paths reject traversal, absolute paths, and escaping symlinks", async () => {
  const root = await mkdtemp(resolve(tmpdir(), "keelokit-studio-paths-"));
  const outside = await mkdtemp(resolve(tmpdir(), "keelokit-studio-outside-"));
  try {
    await mkdir(resolve(root, "media"));
    await symlink(outside, resolve(root, "media/escape"), "dir");
    await symlink(resolve(outside, "future.mp4"), resolve(root, "media/dangling-file"), "file");
    await symlink(resolve(outside, "future-dir"), resolve(root, "media/dangling-dir"), "dir");
    assert.equal(await resolveConsumerPath(root, "media/studio/export.mp4"), resolve(root, "media/studio/export.mp4"));
    await assert.rejects(() => resolveConsumerPath(root, "../outside.mp4"), TypeError);
    await assert.rejects(() => resolveConsumerPath(root, "/tmp/outside.mp4"), TypeError);
    await assert.rejects(() => resolveConsumerPath(root, "media/escape/export.mp4"), TypeError);
    await assert.rejects(() => resolveConsumerPath(root, "media/dangling-file"), TypeError);
    await assert.rejects(() => resolveConsumerPath(root, "media/dangling-dir/export.mp4"), TypeError);
  } finally {
    await rm(root, {recursive: true, force: true});
    await rm(outside, {recursive: true, force: true});
  }
});

test("consumer paths reject the plugin installation as a project root", async () => {
  const pluginRoot = resolve(import.meta.dirname, "..");
  await assert.rejects(() => resolveConsumerPath(pluginRoot, "media/export.mp4"), /outside the plugin installation/);
  await assert.rejects(() => resolveConsumerPath(resolve(pluginRoot, ".."), "keelokit-studio/media/export.mp4"), /inside the plugin installation/);
});

test("missing native adapter blocks only native scope with an actionable error", () => {
  assert.throws(() => assessSurface("native", {affectedScope: "mobile onboarding", availableAdapters: ["web"]}), (error) => {
    assert.ok(error instanceof CapabilityError);
    assert.equal(error.code, "surface_unsupported");
    assert.match(error.message, /mobile onboarding/);
    return true;
  });
  const report = capabilityReport([{surface: "web", scope: "web tour"}, {surface: "native", scope: "mobile onboarding"}], ["web"]);
  assert.equal(report[0].status, "available");
  assert.equal(report[1].status, "blocked");
});

test("CLI, API, and provided material do not imply a graphical interface", () => {
  assert.equal(assessSurface("cli", {availableAdapters: ["cli"]}).requiresGraphicalUi, false);
  assert.equal(assessSurface("api", {availableAdapters: ["api"]}).verification, "reproducible-request");
  assert.deepEqual(assessSurface("provided-material").verification, "provenance-limited");
});


test("source readers reject FIFOs instead of hanging", async () => {
  const {execFileSync} = await import("node:child_process");
  const {mkdtemp, rm} = await import("node:fs/promises");
  const {tmpdir} = await import("node:os");
  const {resolve: resolvePath} = await import("node:path");
  const {readManualExcerpt} = await import("../src/adapters/manual.mjs");
  const {inspectContextSources} = await import("../src/adapters/context.mjs");
  const root = await mkdtemp(resolvePath(tmpdir(), "keelokit-fifo-"));
  try {
    execFileSync("mkfifo", [resolvePath(root, "pipe.md")]);
    const timeout = (promise) => Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error("HANG")), 3000))]);
    await assert.rejects(() => timeout(readManualExcerpt({projectRoot: root, path: "pipe.md"})), /regular file/);
    await assert.rejects(() => timeout(inspectContextSources({projectRoot: root, projectId: "p", observedAt: "2026-10-11T12:00:00.000Z", sources: [{kind: "readme", path: "pipe.md"}]})), /regular file/);
  } finally {
    await rm(root, {recursive: true, force: true});
  }
});
