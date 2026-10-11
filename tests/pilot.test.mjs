import assert from "node:assert/strict";
import test from "node:test";
import {addApproval, createInitialState} from "../src/state/store.mjs";
import {createPieceState, setCurrentSubject} from "../src/state/transitions.mjs";
import {createPilotReview, persistPilotSubject, recordStyleOutcome, selectPilotSet, styleGate, PilotError} from "../src/agency/pilot.mjs";

const planHash = `sha256:${"a".repeat(64)}`;
const approval = {approval_id: "approval-plan", kind: "plan", scope: "plan-main", confirmed_by: "owner", confirmed_at: "2026-10-11T12:00:00.000Z", subject_version: 1, subject_hash: planHash, explicit_method: "conversation", status: "approved"};
const candidate = (piece_id, style_signature, fill) => ({piece_id, style_signature, preview_artifact_id: `preview-${piece_id}`, preview_hash: `sha256:${fill.repeat(64)}`});

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
  const result = createPilotReview({state, candidates: [candidate("piece-a", "one", "b"), candidate("piece-b", "one", "c")], scope: "style-main", version: 1});
  let persisted = persistPilotSubject(state, "style", result.subject);
  persisted.pieces[0].style_subject = "style";
  persisted.pieces[1].style_subject = "style";
  persisted = recordStyleOutcome(persisted, {subjectKey: "style", expectedSubject: result.subject, outcome: "approved", confirmedBy: "owner", explicitMethod: "dashboard"});
  assert.deepEqual(styleGate(persisted, ["piece-a", "piece-b"]), {status: "ready", failures: []});

  const changed = createPilotReview({state, candidates: [candidate("piece-a", "one", "f"), candidate("piece-b", "one", "c")], scope: "style-main", version: 2});
  const stale = persistPilotSubject(persisted, "style", changed.subject);
  assert.equal(styleGate(stale, ["piece-a"]).status, "blocked");
});

test("requested changes revoke the exact style subject and require comments", () => {
  const result = createPilotReview({state: planned(), candidates: [candidate("piece-a", "one", "b")], scope: "style-main", version: 1});
  const state = persistPilotSubject(planned(), "style", result.subject);
  assert.throws(() => recordStyleOutcome(state, {subjectKey: "style", expectedSubject: result.subject, outcome: "changes_requested", confirmedBy: "owner", explicitMethod: "conversation"}), /comments/);
  const changed = recordStyleOutcome(state, {subjectKey: "style", expectedSubject: result.subject, outcome: "changes_requested", confirmedBy: "owner", explicitMethod: "conversation", comments: ["Increase contrast"]});
  assert.equal(styleGate(changed, ["piece-a"]).status, "blocked");
});

test("binds style coverage changes into the approval hash", () => {
  const state = planned();
  const first = createPilotReview({state, candidates: [candidate("piece-a", "one", "b")], scope: "style-main", version: 1});
  const expanded = createPilotReview({state, candidates: [candidate("piece-a", "one", "b"), candidate("piece-b", "one", "c")], scope: "style-main", version: 1});
  assert.notEqual(first.subject.hash, expanded.subject.hash);
});
