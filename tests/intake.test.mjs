import assert from "node:assert/strict";
import {mkdtemp, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {resolve} from "node:path";
import test from "node:test";
import {planIntake, recordIntakeDecision} from "../src/agency/intake.mjs";
import {createInitialState, initializeState, loadState} from "../src/state/store.mjs";

const subjectHash = `sha256:${"a".repeat(64)}`;
const changedSubjectHash = `sha256:${"b".repeat(64)}`;
const fields = [
  {field_id: "goal", subject_hash: subjectHash, prompt: "Confirm the campaign goal", status: "inferred", value: "activation", impact: "blocking", owner: "sponsor", scope_ids: ["suite-onboarding"], source_ids: ["source-a"]},
  {field_id: "audience", subject_hash: subjectHash, prompt: "Who is the primary audience?", status: "missing", impact: "blocking", owner: "sponsor", scope_ids: ["suite-onboarding"], source_ids: []},
  {field_id: "voice", subject_hash: subjectHash, prompt: "Resolve the conflicting voice guidance", status: "contradictory", value: ["formal", "casual"], impact: "limited", owner: null, scope_ids: ["suite-onboarding"], source_ids: ["source-a", "source-b"]},
  {field_id: "metric", subject_hash: subjectHash, prompt: "Which success metric applies?", status: "stale", value: "old metric", impact: "informational", owner: null, scope_ids: ["suite-onboarding"], source_ids: ["source-a"]},
  {field_id: "release", subject_hash: subjectHash, prompt: "Confirm release message", status: "confirmed", value: "available", impact: "blocking", owner: null, scope_ids: ["suite-release"], source_ids: ["source-c"]},
  {field_id: "native-ui", subject_hash: subjectHash, prompt: "Provide native UI access", status: "missing", impact: "blocking", owner: "engineering", scope_ids: ["suite-native"], source_ids: []}
];

test("intake asks only the relevant unresolved delta in short batches", () => {
  const result = planIntake({projectId: "product-a", fields, activeScopeIds: ["suite-onboarding"]});
  assert.deepEqual(result.questions.map(({field_id}) => field_id), ["goal", "audience", "voice"]);
  assert.equal(result.remaining_questions, 1);
  assert.deepEqual(result.blocked_scope_ids, ["suite-onboarding"]);
  assert.ok(result.gaps.every(({scope_ids}) => !scope_ids.includes("suite-native")));
  assert.deepEqual(result.questions[0].source_ids, ["source-a"]);
});

test("confirmed decisions survive a session and are not asked again", async () => {
  const root = await mkdtemp(resolve(tmpdir(), "keelokit-studio-intake-"));
  try {
    let state = createInitialState("product-a", "2026-10-11T12:00:00.000Z");
    state = recordIntakeDecision(state, {fieldId: "goal", subjectHash, answer: "activation", scopeIds: ["suite-onboarding"], source: "conversation", recordedAt: "2026-10-11T12:01:00.000Z"});
    await initializeState(root, state);
    const resumed = await loadState(root);
    const result = planIntake({projectId: "product-a", fields, decisions: resumed.decisions, activeScopeIds: ["suite-onboarding"]});
    assert.ok(!result.questions.some(({field_id}) => field_id === "goal"));
    assert.equal(resumed.engagement_phase, "interviewing");
    assert.equal(resumed.decisions[0].value.answer, "activation");
  } finally {
    await rm(root, {recursive: true, force: true});
  }
});

test("an unrelated blocking gap does not block the active scope", () => {
  const result = planIntake({projectId: "product-a", fields, activeScopeIds: ["suite-release"]});
  assert.deepEqual(result, {questions: [], gaps: [], blocked_scope_ids: [], remaining_questions: 0});
});

test("a scoped decision and a multi-scope gap affect only covered active scopes", () => {
  const scopedField = {...fields[0], scope_ids: ["suite-onboarding", "suite-retention"]};
  let state = recordIntakeDecision(createInitialState("product-a"), {fieldId: "goal", subjectHash, answer: "activation", scopeIds: ["suite-onboarding"], source: "conversation", recordedAt: "2026-10-11T12:01:00.000Z"});
  const partial = planIntake({projectId: "product-a", fields: [scopedField], decisions: state.decisions, activeScopeIds: ["suite-onboarding", "suite-retention"]});
  assert.deepEqual(partial.questions[0].scope_ids, ["suite-retention"]);
  assert.deepEqual(partial.blocked_scope_ids, ["suite-retention"]);
  state = recordIntakeDecision(state, {fieldId: "goal", subjectHash, answer: "activation", scopeIds: ["suite-retention"], source: "conversation", recordedAt: "2026-10-11T12:01:00.000Z"});
  const covered = planIntake({projectId: "product-a", fields: [scopedField], decisions: state.decisions, activeScopeIds: ["suite-onboarding", "suite-retention"]});
  assert.equal(covered.questions.length, 0);
  assert.notEqual(state.decisions[0].decision_id, state.decisions[1].decision_id);
});

test("a material subject change reopens only the affected intake field", () => {
  const state = recordIntakeDecision(createInitialState("product-a"), {fieldId: "goal", subjectHash, answer: "activation", scopeIds: ["suite-onboarding"], source: "conversation", recordedAt: "2026-10-11T12:01:00.000Z"});
  const changed = {...fields[0], subject_hash: changedSubjectHash, status: "stale", value: "retention"};
  const result = planIntake({projectId: "product-a", fields: [changed], decisions: state.decisions, activeScopeIds: ["suite-onboarding"]});
  assert.deepEqual(result.questions.map(({field_id}) => field_id), ["goal"]);
});

test("intake validates duplicate fields, batch size, and undefined answers", () => {
  assert.throws(() => planIntake({projectId: "product-a", fields: [fields[0], fields[0]]}), /Duplicate intake field/);
  assert.throws(() => planIntake({projectId: "product-a", fields, batchSize: 4}), /two or three/);
  const state = createInitialState("product-a");
  assert.throws(() => recordIntakeDecision(state, {fieldId: "goal", subjectHash, answer: undefined, source: "conversation"}), /cannot be undefined/);
  assert.throws(() => recordIntakeDecision(state, {fieldId: "goal", subjectHash, answer: "activation", scopeIds: ["suite-a", "suite-a"], source: "conversation"}), /unique/);
});


test("asks which languages to produce in until the owner confirms them", async () => {
  const {languagesIntakeField, confirmedLanguages} = await import("../src/agency/intake.mjs");
  const field = languagesIntakeField({detected: ["es-AR"]});
  assert.equal(field.status, "inferred");
  let state = createInitialState("product-a");
  const first = planIntake({projectId: "product-a", fields: [field], decisions: state.decisions});
  assert.equal(first.questions[0].field_id, "languages");
  assert.deepEqual(first.blocked_scope_ids, ["project"]);
  assert.equal(confirmedLanguages(state, field), null);
  state = recordIntakeDecision(state, {fieldId: "languages", subjectHash: field.subject_hash, answer: {primary: "es-AR", additional: ["en-US"]}, source: "conversation", recordedAt: "2026-10-11T12:01:00.000Z"});
  assert.equal(planIntake({projectId: "product-a", fields: [field], decisions: state.decisions}).questions.length, 0);
  assert.deepEqual(confirmedLanguages(state, field), {primary: "es-AR", additional: ["en-US"]});
  const bad = recordIntakeDecision(createInitialState("product-a"), {fieldId: "languages", subjectHash: field.subject_hash, answer: {primary: "es-AR", additional: ["es-AR"]}, source: "conversation", recordedAt: "2026-10-11T12:01:00.000Z"});
  assert.throws(() => confirmedLanguages(bad, field), /distinct/);
  assert.throws(() => languagesIntakeField({detected: ["Español"]}), TypeError);
});
