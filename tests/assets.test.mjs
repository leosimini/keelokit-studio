import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {mkdtemp, readFile, rm, unlink, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {resolve} from "node:path";
import test from "node:test";
import {addAsset, createAssetInventory, invalidateAssetDependencies, persistAsset} from "../src/assets/inventory.mjs";

async function fixture() {
  const root = await mkdtemp(resolve(tmpdir(), "keelokit-studio-assets-"));
  await writeFile(resolve(root, "logo.svg"), "<svg>logo</svg>");
  return root;
}

function metadata(overrides = {}) {
  return {
    projectId: "generic-product",
    sourcePath: "logo.svg",
    outputDirectory: "custom/output/assets",
    kind: "logo",
    origin: {type: "provided", source: "brand team", license: null, observed_at: null},
    approval: {status: "unapproved", review_id: "review-logo-1"},
    dependsOn: [{type: "provided-material", id: "material-logo", sha256: "a".repeat(64)}],
    ...overrides
  };
}

test("persists content-addressed assets only under the explicit project output", async () => {
  const root = await fixture();
  try {
    const first = await persistAsset({projectRoot: root, ...metadata()});
    const second = await persistAsset({projectRoot: root, ...metadata()});
    assert.equal(first.asset_id, second.asset_id);
    assert.equal(first.path, second.path);
    assert.equal(first.approval.status, "unapproved");
    assert.equal(await readFile(resolve(root, first.path), "utf8"), "<svg>logo</svg>");
  } finally { await rm(root, {recursive: true, force: true}); }
});

test("changed content receives a different identity and keeps provenance", async () => {
  const root = await fixture();
  try {
    const first = await persistAsset({projectRoot: root, ...metadata()});
    await writeFile(resolve(root, "logo.svg"), "<svg>changed</svg>");
    const second = await persistAsset({projectRoot: root, ...metadata()});
    assert.notEqual(first.sha256, second.sha256);
    assert.notEqual(first.asset_id, second.asset_id);
    assert.deepEqual(second.origin, {type: "provided", source: "brand team", license: null, observed_at: null});
  } finally { await rm(root, {recursive: true, force: true}); }
});

test("dependency ordering does not change asset identity", async () => {
  const root = await fixture();
  const dependencies = [{type: "source", id: "source-a", sha256: null}, {type: "brand", id: "brand-a", sha256: "b".repeat(64)}];
  try {
    const first = await persistAsset({projectRoot: root, ...metadata({dependsOn: dependencies})});
    const second = await persistAsset({projectRoot: root, ...metadata({dependsOn: [...dependencies].reverse()})});
    assert.equal(first.asset_id, second.asset_id);
    assert.deepEqual(first.depends_on, second.depends_on);
  } finally { await rm(root, {recursive: true, force: true}); }
});

test("does not accept a non-file at an existing content-addressed destination", {skip: process.platform === "win32"}, async () => {
  const root = await fixture();
  try {
    await writeFile(resolve(root, "logo.svg"), "");
    const first = await persistAsset({projectRoot: root, ...metadata()});
    await unlink(resolve(root, first.path));
    execFileSync("mkfifo", [resolve(root, first.path)]);
    await assert.rejects(() => persistAsset({projectRoot: root, ...metadata()}), /regular file/);
  } finally { await rm(root, {recursive: true, force: true}); }
});

test("invalidates only direct and transitive asset dependants", () => {
  const source = {asset_id: "source", kind: "image", path: "assets/source.png", sha256: "1".repeat(64), origin: {type: "provided", source: "upload", license: null, observed_at: null}, approval: {status: "approved", review_id: "review-1"}, status: "valid", depends_on: [{type: "brand", id: "brand-v1", sha256: null}], evidence_id: null};
  const derived = {...structuredClone(source), asset_id: "derived", path: "assets/derived.png", origin: {type: "derived", source: "source", license: null, observed_at: null}, depends_on: [{type: "asset", id: "source", sha256: source.sha256}]};
  const unrelated = {...structuredClone(source), asset_id: "unrelated", path: "assets/unrelated.png", depends_on: [{type: "evidence", id: "evidence-other", sha256: null}]};
  const inventory = createAssetInventory({projectId: "generic-product", assets: [source, derived, unrelated]});
  const changed = invalidateAssetDependencies(inventory, [{type: "brand", id: "brand-v1"}]);
  assert.deepEqual(changed.invalidated_asset_ids, ["source", "derived"]);
  assert.deepEqual(changed.inventory.assets.map(({status}) => status), ["stale", "stale", "valid"]);
  assert.deepEqual(inventory.assets.map(({status}) => status), ["valid", "valid", "valid"]);
});

test("rejects implicit outputs, unknown asset dependencies, and duplicate assets", async () => {
  const root = await fixture();
  try {
    await assert.rejects(() => persistAsset({projectRoot: root, ...metadata({outputDirectory: ""})}), /outputDirectory/);
    await assert.rejects(() => persistAsset({projectRoot: root, ...metadata({approval: {status: "approved", review_id: null}})}), /requires a review_id/);
    await assert.rejects(() => persistAsset({projectRoot: root, ...metadata({dependsOn: [{type: "source", id: "source-a", sha256: null}, {type: "source", id: "source-a", sha256: null}]})}), /duplicate dependencies/);
    const asset = await persistAsset({projectRoot: root, ...metadata({dependsOn: []})});
    const inventory = addAsset(createAssetInventory({projectId: "generic-product"}), asset);
    assert.throws(() => addAsset(inventory, asset), /asset_id values must be unique/);
    assert.throws(() => createAssetInventory({projectId: "generic-product", assets: [{...asset, depends_on: [{type: "asset", id: "missing", sha256: "f".repeat(64)}]}]}), /unknown asset dependency/);
    for (const path of ["/tmp/outside.png", "../outside.png", "C:/outside.png", "assets\\outside.png"]) assert.throws(() => createAssetInventory({projectId: "generic-product", assets: [{...asset, path}]}), /path/);
    await assert.rejects(() => persistAsset({projectRoot: root, ...metadata({dependsOn: [{type: "asset", id: "source", sha256: null}]})}), /require a SHA-256/);
  } finally { await rm(root, {recursive: true, force: true}); }
});

test("rejects mismatched dependency hashes and asset cycles", () => {
  const base = {kind: "image", origin: {type: "derived", source: "pipeline", license: null, observed_at: null}, approval: {status: "pending", review_id: null}, status: "valid", evidence_id: null};
  const left = {...base, asset_id: "left", path: "assets/left.png", sha256: "1".repeat(64), depends_on: [{type: "asset", id: "right", sha256: "2".repeat(64)}]};
  const right = {...base, asset_id: "right", path: "assets/right.png", sha256: "2".repeat(64), depends_on: [{type: "asset", id: "left", sha256: "1".repeat(64)}]};
  assert.throws(() => createAssetInventory({projectId: "generic-product", assets: [left, right]}), /dependency cycle/);
  assert.throws(() => createAssetInventory({projectId: "generic-product", assets: [{...left, depends_on: []}, {...right, depends_on: [{type: "asset", id: "left", sha256: "f".repeat(64)}]}]}), /dependency hash does not match/);
});
