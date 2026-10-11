import assert from "node:assert/strict";
import test from "node:test";
import {addApproval, createInitialState} from "../src/state/store.mjs";
import {createPieceState, setCurrentSubject} from "../src/state/transitions.mjs";
import {createPilotReview, persistPilotSubject, recordStyleOutcome, selectPilotSet, styleGate, PilotError} from "../src/agency/pilot.mjs";
import {createEditorialReview, editorialDimensions} from "../src/agency/editorial-review.mjs";

const planHash = `sha256:${"a".repeat(64)}`;
const approval = {approval_id: "approval-plan", kind: "plan", scope: "plan-main", confirmed_by: "owner", confirmed_at: "2026-10-11T12:00:00.000Z", subject_version: 1, subject_hash: planHash, explicit_method: "conversation", status: "approved"};
const scores = Object.fromEntries(editorialDimensions.map((dimension) => [dimension, 4]));
const reviewedInputs = Object.fromEntries(["channel", "motion", "strategy", "treatment"].map((key, index) => [key, `sha256:${String(index + 1).repeat(64)}`]));
const candidate = (piece_id, style_signature, fill) => ({author: "producer-agent", piece_id, style_signature, storyboard_id: `storyboard-${piece_id}`, storyboard_version: 1, storyboard_hash: `sha256:${"e".repeat(64)}`, preview_artifact_id: `preview-${piece_id}`, preview_hash: `sha256:${fill.repeat(64)}`, reviewed_inputs: reviewedInputs});
const editorial = (item) => createEditorialReview({projectId: "project-one", pieceId: item.piece_id, storyboardId: item.storyboard_id, storyboardVersion: item.storyboard_version, storyboardHash: item.storyboard_hash, previewArtifactId: item.preview_artifact_id, previewHash: item.preview_hash, reviewedInputs: item.reviewed_inputs, reviewer: "independent-editor", reviewedAt: "2026-10-11T12:05:00.000Z", scores, attempts: ["Tried to disprove progression"], limits: ["No performance data"]});
const review = (state, candidates, options = {}) => createPilotReview({state, candidates, editorialReviews: candidates.map(editorial), ...options});

function planned(approved = true) {
  let state = createInitialState("project-one");
  state.pieces.push(createPieceState("piece-a"), createPieceState("piece-b"), createPieceState("piece-c"));
  state = setCurrentSubject(state, "plan", {kind: "plan", project_id: "project-one", scope: "plan-main", version: 1, hash: planHash, piece_ids: ["piece-a", "piece-b", "piece-c"]});
  return approved ? addApproval(state, approval) : state;
}

test("selects one pilot for each materially distinct style in approved scope", () => {
  const selected = selectPilotSet({state: planned(), candidates: [candidate("piece-a", "motion-light", "b"), candidate("piece-b", "motion-light", "c"), candidate("piece-c", "tutorial-dark", "d")]});
  assert.deepEqual(selected.map(({piece_id}) => piece_id), ["piece-a", "piece-c"]);
});

test("blocks unapproved and out-of-scope pilot work", () => {
  assert.throws(() => selectPilotSet({state: planned(false), candidates: [candidate("piece-a", "one", "b")]}), PilotError);
  assert.throws(() => selectPilotSet({state: planned(), candidates: [candidate("outside", "one", "b")]}), /outside approved plan/);
});

test("binds explicit style approval to exact pilot previews and covered scope", () => {
  const state = planned();
  const candidates = [candidate("piece-a", "one", "b"), candidate("piece-b", "one", "c")];
  const result = review(state, candidates, {scope: "style-main", version: 1});
  let persisted = persistPilotSubject(state, "style", result.subject);
  persisted.pieces[0].style_subject = "style";
  persisted.pieces[1].style_subject = "style";
  persisted = recordStyleOutcome(persisted, {subjectKey: "style", expectedSubject: result.subject, outcome: "approved", confirmedBy: "owner", explicitMethod: "dashboard", editorialReviews: candidates.map(editorial)});
  assert.deepEqual(styleGate(persisted, ["piece-a", "piece-b"]), {status: "ready", failures: []});

  const changedCandidates = [candidate("piece-a", "one", "f"), candidate("piece-b", "one", "c")];
  const changed = review(state, changedCandidates, {scope: "style-main", version: 2});
  const stale = persistPilotSubject(persisted, "style", changed.subject);
  assert.equal(styleGate(stale, ["piece-a"]).status, "blocked");
});

test("requested changes revoke the exact style subject and require comments", () => {
  const state = planned();
  const candidates = [candidate("piece-a", "one", "b")];
  const result = review(state, candidates, {scope: "style-main", version: 1});
  const persisted = persistPilotSubject(state, "style", result.subject);
  assert.throws(() => recordStyleOutcome(persisted, {subjectKey: "style", expectedSubject: result.subject, outcome: "changes_requested", confirmedBy: "owner", explicitMethod: "conversation"}), /comments/);
  const changed = recordStyleOutcome(persisted, {subjectKey: "style", expectedSubject: result.subject, outcome: "changes_requested", confirmedBy: "owner", explicitMethod: "conversation", comments: ["Increase contrast"]});
  assert.equal(styleGate(changed, ["piece-a"]).status, "blocked");
});

test("binds style coverage changes into the approval hash", () => {
  const state = planned();
  const firstCandidates = [candidate("piece-a", "one", "b")];
  const expandedCandidates = [candidate("piece-a", "one", "b"), candidate("piece-b", "one", "c")];
  const first = review(state, firstCandidates, {scope: "style-main", version: 1});
  const expanded = review(state, expandedCandidates, {scope: "style-main", version: 1});
  assert.notEqual(first.subject.hash, expanded.subject.hash);
});

test("blocks style review without a current passing editorial report", () => {
  const state = planned();
  const item = candidate("piece-a", "one", "b");
  assert.throws(() => createPilotReview({state, candidates: [item], editorialReviews: [], scope: "style-main", version: 1}), /editorial report/);
  const failed = createEditorialReview({projectId: "project-one", pieceId: item.piece_id, storyboardId: item.storyboard_id, storyboardVersion: 1, storyboardHash: item.storyboard_hash, previewArtifactId: item.preview_artifact_id, previewHash: item.preview_hash, reviewedInputs: item.reviewed_inputs, reviewer: "critic", reviewedAt: "2026-10-11T12:05:00.000Z", scores: {...scores, progression: 1}, findings: [{severity: "blocking", dimension: "progression", location: "scene 2", problem: "Repeats scene 1", consequence: "No narrative advance", revision: "Show the evidenced mechanism"}]});
  assert.throws(() => createPilotReview({state, candidates: [item], editorialReviews: [failed], scope: "style-main", version: 1}), /changes_requested/);
  const stale = editorial({...item, preview_hash: `sha256:${"f".repeat(64)}`});
  assert.throws(() => createPilotReview({state, candidates: [item], editorialReviews: [stale], scope: "style-main", version: 1}), /stale/);
});

test("a hand-built style subject cannot bypass the editorial gate or self-approval", () => {
  const state = planned();
  const forged = {kind: "style", project_id: "project-one", scope: "style-main", version: 1, hash: planHash, piece_ids: ["piece-a"]};
  assert.throws(() => persistPilotSubject(state, "style", forged), /createPilotReview/);
  const candidates = [candidate("piece-a", "one", "b")];
  const result = review(state, candidates, {scope: "style-main", version: 1});
  const persisted = persistPilotSubject(state, "style", result.subject);
  const base = {subjectKey: "style", expectedSubject: result.subject, outcome: "approved", explicitMethod: "dashboard"};
  assert.throws(() => recordStyleOutcome(persisted, {...base, confirmedBy: "owner"}), /passing editorial report/);
  assert.throws(() => recordStyleOutcome(persisted, {...base, confirmedBy: "independent-editor", editorialReviews: candidates.map(editorial)}), /cannot also give/);
  assert.doesNotThrow(() => recordStyleOutcome(persisted, {...base, confirmedBy: "owner", editorialReviews: candidates.map(editorial)}));
});

test("the author of a piece cannot be its editorial reviewer", () => {
  const state = planned();
  const item = {...candidate("piece-a", "one", "b"), author: "independent-editor"};
  assert.throws(() => createPilotReview({state, candidates: [item], editorialReviews: [editorial(item)], scope: "style-main", version: 1}), /cannot be the author/);
});
