import assert from "node:assert/strict";
import {access, mkdir, mkdtemp, readFile, rm, symlink} from "node:fs/promises";
import {spawn} from "node:child_process";
import {once} from "node:events";
import {tmpdir} from "node:os";
import {resolve} from "node:path";
import test from "node:test";
import {addApproval, createInitialState, hasCurrentApproval, initializeState, loadState, saveState, StateConflictError, StateValidationError, statePath} from "../src/state/store.mjs";

const hashA = `sha256:${"a".repeat(64)}`;
const hashB = `sha256:${"b".repeat(64)}`;

async function withConsumer(run) {
  const root = await mkdtemp(resolve(tmpdir(), "keelokit-studio-consumer-"));
  try {
    await run(root);
  } finally {
    await rm(root, {recursive: true, force: true});
  }
}

test("persists and resumes consumer state outside the plugin", async () => {
  await withConsumer(async (root) => {
    const initial = createInitialState("consumer-demo", "2026-10-11T12:00:00.000Z");
    const destination = await initializeState(root, initial);
    assert.equal(destination, statePath(root));
    assert.ok(destination.startsWith(root));
    assert.deepEqual(await loadState(root), initial);
  });
});

test("approval is explicit and bound to exact version and hash", () => {
  const state = createInitialState("consumer-demo", "2026-10-11T12:00:00.000Z");
  assert.equal(hasCurrentApproval(state, {kind: "plan", scope: "plan-main", subjectVersion: 1, subjectHash: hashA}), false);

  const approved = addApproval(state, {
    approval_id: "approval-plan-v1",
    kind: "plan",
    scope: "plan-main",
    confirmed_by: "product-owner",
    confirmed_at: "2026-10-11T12:01:00.000Z",
    subject_version: 1,
    subject_hash: hashA,
    explicit_method: "conversation",
    status: "approved"
  }, "2026-10-11T12:01:00.000Z");

  assert.equal(hasCurrentApproval(approved, {kind: "plan", scope: "plan-main", subjectVersion: 1, subjectHash: hashA}), true);
  assert.equal(hasCurrentApproval(approved, {kind: "plan", scope: "plan-main", subjectVersion: 2, subjectHash: hashA}), false);
  assert.equal(hasCurrentApproval(approved, {kind: "plan", scope: "plan-main", subjectVersion: 1, subjectHash: hashB}), false);
});

test("revocation overrides a matching approval", () => {
  const state = createInitialState("consumer-demo");
  const record = (approval_id, status) => ({
    approval_id,
    kind: "style",
    scope: "style-main",
    confirmed_by: "creative-owner",
    confirmed_at: "2026-10-11T12:02:00.000Z",
    subject_version: 1,
    subject_hash: hashA,
    explicit_method: "dashboard",
    status
  });
  const approved = addApproval(state, record("approval-style-v1", "approved"));
  const revoked = addApproval(approved, record("revocation-style-v1", "revoked"));
  assert.equal(hasCurrentApproval(revoked, {kind: "style", scope: "style-main", subjectVersion: 1, subjectHash: hashA}), false);
  const reapproved = addApproval(revoked, record("approval-style-v1-again", "approved"));
  assert.equal(hasCurrentApproval(reapproved, {kind: "style", scope: "style-main", subjectVersion: 1, subjectHash: hashA}), true);
});

test("resumes required phases and uncertain provider jobs without inventing completion", async () => {
  for (const phase of ["interviewing", "awaiting_plan_approval", "reviewing", "blocked"]) {
    await withConsumer(async (root) => {
      const state = createInitialState(`consumer-${phase}`);
      state.engagement_phase = phase;
      state.jobs.push({
        job_id: "voice-job-1",
        provider: "synthetic-provider",
        provider_job_id: "provider-123",
        operation: "voice",
        request_hash: hashA,
        status: "uncertain",
        attempts: 1,
        known_cost: null
      });
      await initializeState(root, state);
      const resumed = await loadState(root);
      assert.equal(resumed.engagement_phase, phase);
      assert.equal(resumed.jobs[0].status, "uncertain");
    });
  }
});

test("invalid state never replaces the last valid file", async () => {
  await withConsumer(async (root) => {
    const valid = createInitialState("consumer-demo", "2026-10-11T12:00:00.000Z");
    await initializeState(root, valid);
    const before = await readFile(statePath(root), "utf8");
    const invalid = structuredClone(valid);
    invalid.approvals.push({approval_id: "boolean-is-not-approval", approved: true});
    await assert.rejects(() => saveState(root, invalid), StateValidationError);
    assert.equal(await readFile(statePath(root), "utf8"), before);
  });
});

test("initialization is exclusive and preserves existing state", async () => {
  await withConsumer(async (root) => {
    const initial = createInitialState("consumer-demo", "2026-10-11T12:00:00.000Z");
    initial.decisions.push({decision_id: "decision-1", topic: "language", value: "en", source: "user", recorded_at: initial.updated_at});
    await initializeState(root, initial);
    const before = await readFile(statePath(root), "utf8");
    await assert.rejects(() => initializeState(root, createInitialState("replacement")), StateConflictError);
    assert.equal(await readFile(statePath(root), "utf8"), before);
  });
});

test("rejects stale snapshots instead of losing another session's work", async () => {
  await withConsumer(async (root) => {
    await initializeState(root, createInitialState("consumer-demo"));
    const first = await loadState(root);
    const stale = await loadState(root);
    first.decisions.push({decision_id: "decision-1", topic: "language", value: "en", source: "user", recorded_at: first.updated_at});
    await saveState(root, first);
    stale.jobs.push({job_id: "job-stale", provider: "synthetic-provider", provider_job_id: null, operation: "voice", request_hash: hashA, status: "uncertain", attempts: 1, known_cost: null});
    await assert.rejects(() => saveState(root, stale), StateConflictError);
    const persisted = await loadState(root);
    assert.equal(persisted.state_revision, 1);
    assert.equal(persisted.decisions[0].decision_id, "decision-1");
    assert.equal(persisted.jobs.length, 0);
  });
});

test("saves an immutable validated snapshot", async () => {
  await withConsumer(async (root) => {
    await initializeState(root, createInitialState("consumer-demo"));
    const state = await loadState(root);
    const pending = saveState(root, state);
    state.approvals.push({approval_id: "invalid", approved: true});
    await pending;
    assert.deepEqual((await loadState(root)).approvals, []);
  });
});

test("rejects state destinations inside the plugin, including symlinked state directories", async () => {
  await assert.rejects(() => initializeState(resolve("."), createInitialState("plugin-root")), StateValidationError);
  const trickyRoot = await mkdtemp(resolve("..consumer-"));
  try {
    await assert.rejects(() => initializeState(trickyRoot, createInitialState("dot-prefix")), StateValidationError);
  } finally {
    await rm(trickyRoot, {recursive: true, force: true});
  }
  await withConsumer(async (root) => {
    const unintended = resolve("studio");
    await assert.rejects(() => access(unintended));
    await symlink(resolve("."), resolve(root, ".keelokit"), "dir");
    await assert.rejects(() => initializeState(root, createInitialState("symlinked")), StateValidationError);
    await assert.rejects(() => access(unintended));
  });
});

test("releases the state lock when its process is terminated", async () => {
  await withConsumer(async (root) => {
    await initializeState(root, createInitialState("consumer-demo"));
    const lockDatabase = `${statePath(root)}.lock.sqlite`;
    const child = spawn(process.execPath, ["-e", "const {DatabaseSync}=require('node:sqlite');const db=new DatabaseSync(process.argv[1]);db.exec('BEGIN IMMEDIATE');console.log('locked');setInterval(()=>{},1000)", lockDatabase], {stdio: ["ignore", "pipe", "pipe"]});
    await once(child.stdout, "data");
    child.kill("SIGKILL");
    await once(child, "exit");
    const state = await loadState(root);
    const saved = await saveState(root, state);
    assert.equal(saved.state.state_revision, 1);
  });
});

test("serializes concurrent writers and persists the successful snapshot", async () => {
  await withConsumer(async (root) => {
    await initializeState(root, createInitialState("consumer-demo"));
    const first = await loadState(root);
    const second = await loadState(root);
    first.decisions.push({decision_id: "decision-a", topic: "language", value: "en", source: "user", recorded_at: first.updated_at});
    second.decisions.push({decision_id: "decision-b", topic: "language", value: "es", source: "user", recorded_at: second.updated_at});
    const outcomes = await Promise.allSettled([saveState(root, first), saveState(root, second)]);
    assert.equal(outcomes.filter(({status}) => status === "fulfilled").length, 1);
    assert.equal(outcomes.filter(({status}) => status === "rejected").length, 1);
    const persisted = await loadState(root);
    assert.equal(persisted.state_revision, 1);
    assert.equal(persisted.decisions.length, 1);
    const successfulIndex = outcomes.findIndex(({status}) => status === "fulfilled");
    assert.equal(persisted.decisions[0].decision_id, successfulIndex === 0 ? "decision-a" : "decision-b");
  });
});

test("roundtrips populated review and recovery state", async () => {
  await withConsumer(async (root) => {
    const state = createInitialState("consumer-demo");
    state.engagement_phase = "reviewing";
    state.decisions.push({decision_id: "decision-1", topic: "language", value: "en", source: "user", recorded_at: state.updated_at});
    state.pieces.push({piece_id: "piece-1", plan_subject: "plan", style_subject: "style", status: "rendered", components: {evidence: "valid", capture: "valid", script: "valid", voice: "valid", brand: "valid", composition: "valid", render: "valid", qa: "missing", distribution: "missing"}, invalidations: []});
    state.costs = {currency: "USD", approved_limit: 20, known_total: 4};
    state.jobs.push({job_id: "job-1", provider: "synthetic-provider", provider_job_id: "provider-1", operation: "voice", request_hash: hashA, status: "uncertain", attempts: 1, known_cost: 4});
    const approved = addApproval(state, {approval_id: "approval-1", kind: "plan", scope: "plan-main", confirmed_by: "owner", confirmed_at: state.updated_at, subject_version: 1, subject_hash: hashA, explicit_method: "file", status: "approved"});
    await initializeState(root, approved);
    assert.deepEqual(await loadState(root), approved);
  });
});

