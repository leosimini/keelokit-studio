import assert from "node:assert/strict";
import test from "node:test";
import {createInitialState, hasCurrentApproval} from "../src/state/store.mjs";
import {recordReviewOutcome, renderReviewMarkdown, reviewSubject, setReviewSubject, ReviewError} from "../src/agency/review.mjs";

const audiences = {schema_version: 1, project_id: "product-a", audiences: [{audience_id: "audience-a", public_name: "Members", jobs: ["Complete a task"], stage: "activation", vocabulary: [], objections: [], related_roles: ["member"], ctas: ["Take action"], source_ids: ["source-a"], confirmation_status: "confirmed"}]};
const brief = {schema_version: 1, project_id: "product-a", brief_id: `brief-${"a".repeat(16)}`, version: 1, objective: "activation", audience_treatments: [{audience_id: "audience-a", tone: {value: "Clear", basis: "explicit", confirmation_status: "confirmed"}, voice: {value: null, basis: "none", confirmation_status: "not-applicable"}}], messages: [{text: "Supported message", audience_ids: ["audience-a"], source_ids: ["source-a"]}], channels: ["docs"], visibility: "public", ui: {surfaces: ["web"], build: "build-1"}, scope: {included: ["primary task"], excluded: []}, budget: {currency: "USD", limit: 100}, reviewers: ["owner"], success_criteria: ["Task is understood"]};
const plan = {schema_version: 1, project_id: "product-a", plan_id: `plan-${"b".repeat(16)}`, version: 1, suites: [{suite_id: "suite-a", objective: "activation", priority: 1, dependencies: [], budget: 100, review_criteria: ["Suite is clear"], pieces: [{piece_id: "piece-a", audience_id: "audience-a", intention: "Explain the task", cta: "Take action", message: "Supported message", evidence_ids: [], evidence_requirements: ["Verify the task"], structure: ["Context", "Task", "CTA"], duration_seconds: 45, formats: ["16:9"], language: "en", channels: ["docs"], order: 1, dependencies: [], requirements: ["Signed-in session"], review_criteria: ["Claim matches evidence"], estimated_cost: 10}]}], pending: [], out_of_scope: []};

function awaitingReview() {
  let state = createInitialState("product-a", "2026-10-11T12:00:00.000Z");
  state.engagement_phase = "awaiting_plan_approval";
  state = setReviewSubject(state, "plan", reviewSubject({kind: "plan", scope: "plan-main", document: plan, audiences}), "2026-10-11T12:01:00.000Z");
  return state;
}

function approve(state, kind, subjectKey, recordedAt) {
  return recordReviewOutcome(state, {kind, subjectKey, expectedSubject: structuredClone(state.versions[subjectKey]), outcome: "approved", confirmedBy: "owner", explicitMethod: "conversation", recordedAt});
}

test("plan review scope is derived from the validated plan", () => {
  const subject = reviewSubject({kind: "plan", scope: "plan-main", document: plan, audiences, pieceIds: ["piece-not-in-plan"]});
  assert.deepEqual(subject.piece_ids, ["piece-a"]);
  assert.throws(() => reviewSubject({kind: "plan", scope: "plan-main", document: {...plan, project_id: "other"}, audiences}), /share project_id/);
});

test("explicit approval binds to the presented version and audience-bound hash", () => {
  let state = awaitingReview();
  const presented = structuredClone(state.versions.plan);
  state = approve(state, "plan", "plan", "2026-10-11T12:02:00.000Z");
  assert.equal(hasCurrentApproval(state, {kind: "plan", scope: presented.scope, subjectVersion: presented.version, subjectHash: presented.hash}), true);
  const changed = {...plan, version: 2, pending: ["new decision"]};
  state = setReviewSubject(state, "plan", reviewSubject({kind: "plan", scope: "plan-main", document: changed, audiences}), "2026-10-11T12:03:00.000Z");
  assert.throws(() => recordReviewOutcome(state, {kind: "plan", subjectKey: "plan", expectedSubject: presented, outcome: "approved", confirmedBy: "owner", explicitMethod: "conversation"}), /does not match/);
  assert.equal(hasCurrentApproval(state, {kind: "plan", scope: state.versions.plan.scope, subjectVersion: 2, subjectHash: state.versions.plan.hash}), false);
});

test("requested changes revoke approval for the exact subject", () => {
  let state = approve(awaitingReview(), "plan", "plan", "2026-10-11T12:02:00.000Z");
  const subject = structuredClone(state.versions.plan);
  state = recordReviewOutcome(state, {kind: "plan", subjectKey: "plan", expectedSubject: subject, outcome: "changes_requested", confirmedBy: "owner", explicitMethod: "conversation", comments: ["Clarify the CTA"], recordedAt: "2026-10-11T12:03:00.000Z"});
  assert.equal(hasCurrentApproval(state, {kind: "plan", scope: subject.scope, subjectVersion: subject.version, subjectHash: subject.hash}), false);
  assert.equal(state.events.at(-1).type, "review.changes-requested");
});

test("silence, cross-kind use, or missing explicit review data cannot approve", () => {
  const state = awaitingReview();
  const expectedSubject = structuredClone(state.versions.plan);
  assert.throws(() => recordReviewOutcome(state, {kind: "plan", subjectKey: "plan", expectedSubject, outcome: "approved"}), /confirmedBy/);
  assert.throws(() => recordReviewOutcome(state, {kind: "plan", subjectKey: "plan", expectedSubject, outcome: "changes_requested", confirmedBy: "owner", explicitMethod: "conversation", comments: []}), /at least one comment/);
  assert.throws(() => recordReviewOutcome(state, {kind: "plan", subjectKey: "plan", expectedSubject, outcome: "silence", confirmedBy: "owner", explicitMethod: "conversation"}), ReviewError);
  assert.throws(() => recordReviewOutcome(state, {kind: "brief", subjectKey: "plan", expectedSubject, outcome: "approved", confirmedBy: "owner", explicitMethod: "conversation"}), /does not match/);
});

test("review hashes are deterministic and include material audience content", () => {
  const first = reviewSubject({kind: "plan", scope: "plan-main", document: plan, audiences});
  const reorderedPlan = {out_of_scope: plan.out_of_scope, pending: plan.pending, suites: plan.suites, version: plan.version, plan_id: plan.plan_id, project_id: plan.project_id, schema_version: plan.schema_version};
  const reordered = reviewSubject({kind: "plan", scope: "plan-main", document: reorderedPlan, audiences});
  const changedAudiences = structuredClone(audiences);
  changedAudiences.audiences[0].public_name = "Different name";
  const changed = reviewSubject({kind: "plan", scope: "plan-main", document: plan, audiences: changedAudiences});
  assert.equal(first.hash, reordered.hash);
  assert.notEqual(first.hash, changed.hash);
  assert.match(first.hash, /^sha256:[a-f0-9]{64}$/);
});

test("review hashes ignore unrelated audiences but include referenced audience changes", () => {
  const expanded = structuredClone(audiences);
  expanded.audiences.push({...expanded.audiences[0], audience_id: "audience-unused", public_name: "Unused", jobs: ["Unrelated job"]});
  const first = reviewSubject({kind: "plan", scope: "plan-main", document: plan, audiences: expanded});
  const unrelatedChange = structuredClone(expanded);
  unrelatedChange.audiences[1].public_name = "Renamed but unused";
  const unchanged = reviewSubject({kind: "plan", scope: "plan-main", document: plan, audiences: unrelatedChange});
  const relatedChange = structuredClone(expanded);
  relatedChange.audiences[0].public_name = "Renamed and used";
  const changed = reviewSubject({kind: "plan", scope: "plan-main", document: plan, audiences: relatedChange});
  assert.equal(first.hash, unchanged.hash);
  assert.notEqual(first.hash, changed.hash);
});

test("review rendering is bound to subjects and shows material plan fields", () => {
  let state = awaitingReview();
  state = setReviewSubject(state, "brief", reviewSubject({kind: "brief", scope: "brief-main", document: brief, audiences}), "2026-10-11T12:01:30.000Z");
  state = approve(state, "plan", "plan", "2026-10-11T12:02:00.000Z");
  state = approve(state, "brief", "brief", "2026-10-11T12:02:30.000Z");
  const view = renderReviewMarkdown({brief, plan, audiences, knownSourceIds: ["source-a"], state});
  assert.match(view, /Plan subject: .* — approved/);
  assert.match(view, /Language: en/);
  assert.match(view, /Suite dependencies: none/);
  assert.match(view, /Piece dependencies: none/);
  assert.match(view, /Requirements: Signed-in session/);
  const changedAudiences = structuredClone(audiences);
  changedAudiences.audiences[0].public_name = "Changed after approval";
  assert.throws(() => renderReviewMarkdown({brief, plan, audiences: changedAudiences, knownSourceIds: ["source-a"], state}), /does not match/);
});
