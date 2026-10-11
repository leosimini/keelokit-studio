import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {access, mkdtemp, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {resolve} from "node:path";
import test from "node:test";
import {resumeEngagement, startOrResume} from "../src/agency/start.mjs";
import {addApproval, createInitialState, initializeState, saveState} from "../src/state/store.mjs";

const hash = `sha256:${"a".repeat(64)}`;
const field = {field_id: "goal", subject_hash: hash, prompt: "Confirm goal", status: "missing", impact: "blocking", owner: "owner", scope_ids: ["suite-a"], source_ids: []};

test("start initializes once and subsequent sessions resume persisted state", async () => {
  const root = await mkdtemp(resolve(tmpdir(), "keelokit-studio-start-"));
  try {
    const first = await startOrResume({projectRoot: root, projectId: "product-a"});
    assert.equal(first.created, true);
    assert.equal(first.action, "discover_sources");
    const second = await startOrResume({projectRoot: root, projectId: "product-a"});
    assert.equal(second.created, false);
    assert.equal(second.state_revision, first.state_revision);
  } finally {
    await rm(root, {recursive: true, force: true});
  }
});

test("interviewing resumes only unresolved fields and keeps valid decisions", () => {
  const state = createInitialState("product-a");
  state.engagement_phase = "interviewing";
  state.decisions.push({decision_id: "decision-goal", topic: "intake:goal", value: {answer: "activation", status: "confirmed", subject_hash: hash, scope_ids: ["suite-a"]}, source: "conversation", recorded_at: state.updated_at});
  const route = resumeEngagement({state, intakeFields: [field], activeScopeIds: ["suite-a"]});
  assert.equal(route.action, "draft_brief");
});

test("plan review resumes without inventing or repeating approval", () => {
  const state = createInitialState("product-a");
  state.engagement_phase = "awaiting_plan_approval";
  state.versions.plan = {kind: "plan", project_id: "product-a", scope: "plan-main", version: 1, hash, piece_ids: ["piece-a"]};
  assert.equal(resumeEngagement({state}).action, "review_plan");
  const approved = addApproval(state, {approval_id: "approval-plan", kind: "plan", scope: "plan-main", confirmed_by: "owner", confirmed_at: state.updated_at, subject_version: 1, subject_hash: hash, explicit_method: "conversation", status: "approved"});
  assert.equal(resumeEngagement({state: approved}).action, "prepare_pilot");
});

test("rendered pieces, uncertain jobs, and blockers resume without restarting work", () => {
  const rendered = createInitialState("product-a");
  rendered.engagement_phase = "reviewing";
  rendered.pieces.push({piece_id: "piece-a", plan_subject: "plan", style_subject: "style", status: "rendered", components: {evidence: "valid", capture: "valid", script: "valid", voice: "valid", brand: "valid", composition: "valid", render: "valid", qa: "missing", distribution: "missing"}, invalidations: []});
  assert.deepEqual(resumeEngagement({state: rendered}).piece_ids, ["piece-a"]);
  const uncertain = structuredClone(rendered);
  uncertain.jobs.push({job_id: "job-a", provider: "voice", operation: "synthesize", request_hash: hash, status: "uncertain", attempts: 1, known_cost: null});
  assert.equal(resumeEngagement({state: uncertain}).action, "reconcile_jobs");
  const blocked = createInitialState("product-a");
  blocked.engagement_phase = "blocked";
  const route = resumeEngagement({state: blocked, blockers: [{scope: "suite-a", reason: "Missing access"}]});
  assert.equal(route.action, "resolve_blockers");
  assert.deepEqual(route.blockers, [{scope: "suite-a", reason: "Missing access"}]);
  const unrelated = resumeEngagement({state: blocked, activeScopeIds: ["suite-b"], blockers: [{scope: "suite-a", reason: "Missing access"}]});
  assert.equal(unrelated.action, "resume_unblocked_scope");
  assert.deepEqual(unrelated.deferred_blockers, [{scope: "suite-a", reason: "Missing access"}]);
});

test("material changes revalidate only named fields", () => {
  const state = createInitialState("product-a");
  state.engagement_phase = "awaiting_plan_approval";
  const unrelated = {...field, field_id: "unrelated", prompt: "Unrelated", scope_ids: ["suite-b"]};
  const route = resumeEngagement({state, intakeFields: [field, unrelated], activeScopeIds: ["suite-a"], changedFieldIds: ["goal"]});
  assert.equal(route.action, "revalidate_changes");
  assert.deepEqual(route.questions.map(({field_id}) => field_id), ["goal"]);
  const missing = resumeEngagement({state, intakeFields: [], changedFieldIds: ["goal"]});
  assert.equal(missing.action, "load_changed_context");
  const confirmed = resumeEngagement({state, intakeFields: [{...field, status: "confirmed"}], changedFieldIds: ["goal"]});
  assert.equal(confirmed.action, "refresh_affected_documents");
});

test("material changes outside the active scope are deferred without blocking valid work", () => {
  const state = createInitialState("product-a");
  state.engagement_phase = "awaiting_plan_approval";
  state.versions.plan = {kind: "plan", project_id: "product-a", scope: "plan-main", version: 1, hash, piece_ids: ["piece-a"]};
  const approved = addApproval(state, {approval_id: "approval-plan", kind: "plan", scope: "plan-main", confirmed_by: "owner", confirmed_at: state.updated_at, subject_version: 1, subject_hash: hash, explicit_method: "conversation", status: "approved"});
  const other = {...field, field_id: "other-goal", prompt: "Other goal", scope_ids: ["suite-b"]};
  const route = resumeEngagement({state: approved, intakeFields: [other], activeScopeIds: ["suite-a"], changedFieldIds: ["other-goal"]});
  assert.equal(route.action, "prepare_pilot");
  assert.deepEqual(route.deferred_changed_field_ids, ["other-goal"]);
});

test("startOrResume cannot be given a replacement state", async () => {
  const root = await mkdtemp(resolve(tmpdir(), "keelokit-studio-authority-"));
  try {
    await initializeState(root, createInitialState("product-a"));
    const foreign = createInitialState("foreign");
    foreign.engagement_phase = "ready";
    const route = await startOrResume({projectRoot: root, projectId: "product-a", state: foreign});
    assert.equal(route.phase, "discovered");
    assert.equal(route.action, "discover_sources");
  } finally {
    await rm(root, {recursive: true, force: true});
  }
});

test("start CLI rejects missing flag values before writing state", async () => {
  const root = await mkdtemp(resolve(tmpdir(), "keelokit-studio-cli-"));
  try {
    const result = spawnSync(process.execPath, [resolve(import.meta.dirname, "../scripts/studio-start.mjs"), "--project-id", "--project-root", root], {encoding: "utf8"});
    assert.equal(result.status, 2);
    assert.match(result.stderr, /requires a value/);
    await assert.rejects(() => access(resolve(root, ".keelokit/studio/state.json")), {code: "ENOENT"});
  } finally {
    await rm(root, {recursive: true, force: true});
  }
});

