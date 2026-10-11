import assert from "node:assert/strict";
import test from "node:test";
import {contentHash} from "../src/core/ids.mjs";
import {createAssetInventory} from "../src/assets/inventory.mjs";
import {createAssetRequirements, fulfillAssetRequirement, validateAssetRequirements} from "../src/assets/requirements.mjs";

function fixture() {
  const storyboard = {project_id: "independent-project", piece_id: "piece-a", storyboard_id: "storyboard-a", version: 2, evidence_ids: ["evidence-a"], evidence_target: {build: "build-12", role: "editor", locale: "fr"}, scenes: [{scene_id: "scene-a", evidence_ids: ["evidence-a"], narration: "Observed action"}]};
  const evidence = {project_id: storyboard.project_id, evidence: [{evidence_id: "evidence-a", build: "build-12", role: "editor", locale: "fr", steps: ["Open selected item"], result: "Selected item visible", hashes: ["a".repeat(64)]}]};
  const input = {scene_id: "scene-a", purpose: "Show the observed result", evidence_id: "evidence-a", evidence_hash: contentHash(evidence.evidence[0]), build: "build-12", role: "editor", locale: "fr", state: "Item selected", action: "Open selected item", result: "Selected item visible", media_kind: "capture", dimensions: {width: 1280, height: 720}, aspect_ratio: "16:9", crop: "Keep the entire selected item", focus: "Selected item heading", duration_seconds: 3, rights: "Internal demo license", approval: {status: "approved", review_id: "review-a"}, acceptance_criteria: ["Heading is readable", "No private customer data"]};
  const asset = {asset_id: "asset-a", sha256: "a".repeat(64), kind: "capture", path: "assets/a.png", origin: {type: "captured", source: "approved evidence capture", license: input.rights}, approval: {...input.approval}, status: "valid", evidence_id: "evidence-a", depends_on: [{type: "evidence", id: "evidence-a", sha256: "a".repeat(64)}]};
  const assets = createAssetInventory({projectId: storyboard.project_id, assets: [asset]});
  const document = createAssetRequirements({storyboard, evidence, requirements: [input]});
  return {storyboard, evidence, input, asset, assets, document};
}

function fulfill(f, overrides = {}) {
  return fulfillAssetRequirement(f.document, {storyboard: f.storyboard, evidence: f.evidence, assets: f.assets, requirementId: f.document.requirements[0].requirement_id, assetId: f.asset.asset_id, assetSha256: f.asset.sha256, ...overrides});
}

test("binds explicit requirements and fulfills without mutating inputs", () => {
  const f = fixture();
  const result = fulfill(f);
  assert.equal(result.storyboard_hash, contentHash(f.storyboard));
  assert.deepEqual(result.requirements[0].fulfillment, {asset_id: "asset-a", sha256: "a".repeat(64)});
  assert.equal(f.document.requirements[0].fulfillment, null);
  assert.deepEqual(result.requirements[0].acceptance_criteria, f.input.acceptance_criteria);
  assert.deepEqual(createAssetRequirements({storyboard: structuredClone(f.storyboard), evidence: f.evidence, requirements: [f.input]}), f.document);
  assert.equal(validateAssetRequirements(result, f), result);
});

test("rejects project, piece, version, scene and content drift", () => {
  const f = fixture();
  for (const changed of [{project_id: "other"}, {piece_id: "other"}, {version: 3}, {scenes: [{...f.storyboard.scenes[0], narration: "Changed"}]}]) assert.throws(() => validateAssetRequirements(f.document, {...f, storyboard: {...f.storyboard, ...changed}}), /Stale or mismatched/);
  assert.throws(() => createAssetRequirements({...f, requirements: [{...f.input, scene_id: "missing"}]}), /Unknown scene/);
  assert.throws(() => validateAssetRequirements({...f.document, storyboard_hash: `sha256:${"b".repeat(64)}`}, f), /Stale or mismatched/);
});

test("rejects altered, duplicate and unknown requirements", () => {
  const f = fixture();
  const changed = structuredClone(f.document);
  changed.requirements[0].purpose = "Another purpose";
  assert.throws(() => validateAssetRequirements(changed, f), /mismatched requirement/);
  assert.throws(() => fulfill(f, {requirementId: "missing"}), /Unknown requirement/);
  assert.throws(() => createAssetRequirements({...f, requirements: [f.input, f.input]}), /Duplicate requirement/);
  assert.throws(() => createAssetRequirements({...f, requirements: [{...f.input, invented: true}]}), /requires exactly/);
  const omitted = {...f.input};
  delete omitted.focus;
  assert.throws(() => createAssetRequirements({...f, requirements: [omitted]}), /requires exactly/);
});

test("rejects mismatched or stale evidence bindings", () => {
  const f = fixture();
  for (const changed of [{evidence_id: "unknown"}, {build: "other"}, {role: "other"}, {locale: "other"}, {result: "other"}, {action: "invented action"}]) assert.throws(() => createAssetRequirements({...f, requirements: [{...f.input, ...changed}]}), /evidence|Evidence|match/);
  const evidence = structuredClone(f.evidence);
  evidence.evidence[0].result = "Changed result";
  assert.throws(() => validateAssetRequirements(f.document, {...f, evidence}), /Stale evidence/);
  assert.throws(() => fulfill(f, {evidence: undefined}), /current evidence document/);
});

test("rejects unknown, stale, rejected or incompatible inventory fulfillment", () => {
  const f = fixture();
  assert.throws(() => fulfill(f, {assetId: "missing"}), /Unknown fulfillment/);
  assert.throws(() => fulfill(f, {assetSha256: "b".repeat(64)}), /hash mismatch/);
  for (const [change, pattern] of [[{status: "stale"}, /Stale/], [{kind: "video"}, /media kind/], [{approval: {status: "unapproved", review_id: "reject-a"}}, /rejected/], [{approval: {status: "pending", review_id: null}}, /approval mismatch/], [{origin: {...f.asset.origin, license: "Other"}}, /rights mismatch/], [{evidence_id: "other"}, /evidence mismatch/], [{depends_on: [{type: "evidence", id: "evidence-a", sha256: "b".repeat(64)}]}, /dependency hash mismatch/]]) assert.throws(() => fulfill(f, {assets: createAssetInventory({projectId: f.storyboard.project_id, assets: [{...f.asset, ...change}]})}), pattern);
  assert.throws(() => fulfill(f, {assets: {...f.assets, project_id: "other"}}), /share project_id/);
  const result = fulfill(f);
  assert.throws(() => validateAssetRequirements(result, {storyboard: f.storyboard, evidence: f.evidence}), /current asset inventory/);
});

test("rejects stale transitive asset dependencies", () => {
  const f = fixture();
  const source = {...f.asset, asset_id: "source", path: "assets/source.png", status: "stale", depends_on: []};
  const derived = {...f.asset, depends_on: [{type: "asset", id: "source", sha256: source.sha256}]};
  assert.throws(() => fulfill(f, {assets: createAssetInventory({projectId: f.storyboard.project_id, assets: [source, derived]})}), /Stale.*source/);
});

test("requires explicit generic media constraints and allows non-evidence assets", () => {
  const f = fixture();
  for (const changed of [{dimensions: {width: 0, height: 720}}, {aspect_ratio: "4:3"}, {duration_seconds: 0}, {acceptance_criteria: []}, {approval: {status: "unapproved", review_id: "review-a"}}]) assert.throws(() => createAssetRequirements({...f, requirements: [{...f.input, ...changed}]}));
  const input = {...f.input, evidence_id: null, evidence_hash: null, build: null, role: null, locale: null, state: null, action: null, result: null, media_kind: "audio", dimensions: null, aspect_ratio: null, crop: null, focus: null, rights: null, approval: {status: "pending", review_id: null}};
  const document = createAssetRequirements({storyboard: f.storyboard, requirements: [input]});
  const asset = {...f.asset, kind: "audio", evidence_id: null, depends_on: [], approval: {status: "pending", review_id: null}};
  const assets = createAssetInventory({projectId: f.storyboard.project_id, assets: [asset]});
  assert.equal(fulfillAssetRequirement(document, {storyboard: f.storyboard, assets, requirementId: document.requirements[0].requirement_id, assetId: asset.asset_id, assetSha256: asset.sha256}).requirements[0].fulfillment.asset_id, asset.asset_id);
});
