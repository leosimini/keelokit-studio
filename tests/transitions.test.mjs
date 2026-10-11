import assert from "node:assert/strict";
import test from "node:test";
import {addApproval, createInitialState, hasCurrentApproval} from "../src/state/store.mjs";
import {createPieceState, invalidatePieces, setCurrentSubject, transitionEngagement, TransitionError} from "../src/state/transitions.mjs";

const planHash = `sha256:${"a".repeat(64)}`;
const styleHash = `sha256:${"b".repeat(64)}`;
const approval = (approval_id, kind, scope, subject_hash) => ({approval_id, kind, scope, confirmed_by: "owner", confirmed_at: "2026-10-11T13:00:00.000Z", subject_version: 1, subject_hash, explicit_method: "conversation", status: "approved"});

const briefHash = `sha256:${"f".repeat(64)}`;
function withBrief(state) {
  return addApproval(setCurrentSubject(state, "brief", {kind: "brief", scope: "brief-main", version: 1, hash: briefHash, piece_ids: []}), approval("brief-v1", "brief", "brief-main", briefHash));
}

function awaitingPlan() {
  let state = createInitialState("consumer-demo");
  state.engagement_phase = "awaiting_plan_approval";
  state.pieces.push(createPieceState("piece-pilot"));
  state = setCurrentSubject(state, "plan", {scope: "plan-main", version: 1, hash: planHash, piece_ids: ["piece-pilot"]});
  state = setCurrentSubject(state, "style", {scope: "style-main", version: 1, hash: styleHash, piece_ids: ["piece-pilot"]});
  return withBrief(state);
}

test("blocks pilot and production without plan and style approvals", () => {
  const state = awaitingPlan();
  assert.throws(() => transitionEngagement(state, "pilot_in_progress", {pilotPieceIds: ["piece-pilot"]}), TransitionError);
  const planApproved = addApproval(state, approval("plan-v1", "plan", "plan-main", planHash));
  assert.doesNotThrow(() => transitionEngagement(planApproved, "pilot_in_progress", {pilotPieceIds: ["piece-pilot"]}));
  assert.throws(() => transitionEngagement(planApproved, "producing", {productionPieceIds: ["piece-pilot"]}), TransitionError);
  const fullyApproved = addApproval(planApproved, approval("style-v1", "style", "style-main", styleHash));
  assert.doesNotThrow(() => transitionEngagement(fullyApproved, "producing", {productionPieceIds: ["piece-pilot"]}));
});

test("does not substitute another approval kind or an old subject version", () => {
  let state = awaitingPlan();
  state = addApproval(state, approval("brief-other", "brief", "plan-main", planHash));
  assert.throws(() => transitionEngagement(state, "producing", {productionPieceIds: ["piece-pilot"]}), TransitionError);

  state = addApproval(state, approval("plan-v1", "plan", "plan-main", planHash));
  state = addApproval(state, approval("style-v1", "style", "style-main", styleHash));
  state = setCurrentSubject(state, "plan", {scope: "plan-main", version: 2, hash: `sha256:${"c".repeat(64)}`, piece_ids: ["piece-pilot"]});
  assert.throws(() => transitionEngagement(state, "producing", {productionPieceIds: ["piece-pilot"]}), TransitionError);
});

test("pilot pieces must belong to the persisted approved plan", () => {
  let state = awaitingPlan();
  state.pieces.push(createPieceState("piece-outside", {planSubject: "another-plan"}));
  state = addApproval(state, approval("plan-v1", "plan", "plan-main", planHash));
  assert.throws(() => transitionEngagement(state, "pilot_in_progress", {pilotPieceIds: []}), TransitionError);
  assert.throws(() => transitionEngagement(state, "pilot_in_progress", {pilotPieceIds: ["piece-outside"]}), TransitionError);
});

test("does not infer publication from ready", () => {
  const state = reviewingWithApprovals();
  const ready = transitionEngagement(state, "ready", {readyPieceIds: ["piece-a"]});
  assert.equal(ready.engagement_phase, "ready");
  assert.equal("published" in ready, false);
});

function reviewingWithApprovals() {
  let state = readyState("piece-a");
  state.engagement_phase = "reviewing";
  state = setCurrentSubject(state, "style", {scope: "style-main", version: 1, hash: styleHash, piece_ids: ["piece-a"]});
  return addApproval(state, approval("style-v1", "style", "style-main", styleHash));
}

test("ready requires named pieces whose render and QA are valid and whose style approval is current", () => {
  const state = reviewingWithApprovals();
  assert.throws(() => transitionEngagement(state, "ready"), /readyPieceIds/);
  assert.throws(() => transitionEngagement(state, "ready", {readyPieceIds: ["unknown"]}), TransitionError);
  const unqa = structuredClone(state);
  unqa.pieces[0].components.qa = "stale";
  assert.throws(() => transitionEngagement(unqa, "ready", {readyPieceIds: ["piece-a"]}), /qa/);
  const unstyled = structuredClone(state);
  delete unstyled.versions.style;
  assert.throws(() => transitionEngagement(unstyled, "ready", {readyPieceIds: ["piece-a"]}), TransitionError);
});

test("a piece cannot be ready with missing render or QA", () => {
  const state = createInitialState("consumer-demo");
  state.pieces.push({...createPieceState("piece-x"), status: "ready"});
  assert.throws(() => addApproval(state, approval("x", "plan", "p", planHash)), /render|qa|ready/);
});

test("blocked resumes only at the phase it interrupted or earlier planning phases", () => {
  let state = reviewingWithApprovals();
  state = transitionEngagement(state, "blocked");
  assert.throws(() => transitionEngagement(state, "producing", {productionPieceIds: ["piece-a"]}), TransitionError);
  assert.throws(() => transitionEngagement(state, "ready"), TransitionError);
  assert.equal(transitionEngagement(state, "reviewing").engagement_phase, "reviewing");
  let hand = createInitialState("consumer-demo");
  hand.engagement_phase = "blocked";
  assert.throws(() => transitionEngagement(hand, "reviewing"), TransitionError);
});

test("pilot and production require a current brief approval", () => {
  const state = awaitingPlan();
  const unbriefed = structuredClone(state);
  delete unbriefed.versions.brief;
  const planApproved = addApproval(unbriefed, approval("plan-v1", "plan", "plan-main", planHash));
  assert.throws(() => transitionEngagement(planApproved, "pilot_in_progress", {pilotPieceIds: ["piece-pilot"]}), /brief/);
  assert.throws(() => transitionEngagement(Object.assign(structuredClone(unbriefed), {engagement_phase: "plan_draft"}), "awaiting_plan_approval"), TransitionError);
});

function readyState(...pieceIds) {
  const state = createInitialState("consumer-demo");
  for (const id of pieceIds) {
    const piece = createPieceState(id);
    for (const component of Object.keys(piece.components)) piece.components[component] = "valid";
    piece.status = "ready";
    state.pieces.push(piece);
  }
  return state;
}

test("title change keeps capture and voice while invalidating text derivatives", () => {
  const changed = invalidatePieces(readyState("piece-1"), {changeId: "change-title", changeType: "title", pieceIds: ["piece-1"]});
  assert.equal(changed.pieces[0].components.capture, "valid");
  assert.equal(changed.pieces[0].components.voice, "valid");
  for (const component of ["script", "composition", "render", "qa", "distribution"]) assert.equal(changed.pieces[0].components[component], "stale");
});

test("invalidates only selected pieces and their affected style subject", () => {
  let state = readyState("piece-a", "piece-b");
  state.engagement_phase = "awaiting_plan_approval";
  state.pieces[1].style_subject = "style-b";
  state = setCurrentSubject(state, "plan", {scope: "plan-main", version: 1, hash: planHash, piece_ids: ["piece-a", "piece-b"]});
  state = setCurrentSubject(state, "style", {scope: "style-main", version: 1, hash: styleHash, piece_ids: ["piece-a"]});
  state = setCurrentSubject(state, "style-b", {scope: "style-b", version: 1, hash: `sha256:${"d".repeat(64)}`, piece_ids: ["piece-b"]});
  state = withBrief(state);
  state = addApproval(state, approval("plan-v1", "plan", "plan-main", planHash));
  state = addApproval(state, approval("style-v1", "style", "style-main", styleHash));
  state = addApproval(state, approval("style-b-v1", "style", "style-b", `sha256:${"d".repeat(64)}`));
  assert.doesNotThrow(() => transitionEngagement(state, "producing", {productionPieceIds: ["piece-a", "piece-b"]}));
  const changed = invalidatePieces(state, {changeId: "change-brand", changeType: "brand", pieceIds: ["piece-a"]});
  assert.equal(changed.pieces[0].components.brand, "stale");
  assert.equal(changed.pieces[0].components.distribution, "stale");
  assert.equal(changed.pieces[0].components.capture, "valid");
  assert.equal(changed.pieces[1].status, "ready");
  assert.equal(changed.versions.style, undefined);
  assert.ok(changed.versions["style-b"]);
  assert.equal(hasCurrentApproval(changed, {kind: "style", scope: "style-main", subjectVersion: 1, subjectHash: styleHash}), true);
  assert.throws(() => transitionEngagement(changed, "producing", {productionPieceIds: ["piece-a", "piece-b"]}), TransitionError);
});

test("production requires style coverage for every selected piece", () => {
  let state = readyState("piece-a", "piece-b");
  state.engagement_phase = "awaiting_plan_approval";
  state = setCurrentSubject(state, "plan", {scope: "plan-main", version: 1, hash: planHash, piece_ids: ["piece-a", "piece-b"]});
  state = setCurrentSubject(state, "style", {scope: "style-main", version: 1, hash: styleHash, piece_ids: ["piece-a"]});
  state = withBrief(state);
  state = addApproval(state, approval("plan-v1", "plan", "plan-main", planHash));
  state = addApproval(state, approval("style-v1", "style", "style-main", styleHash));
  assert.doesNotThrow(() => transitionEngagement(state, "producing", {productionPieceIds: ["piece-a"]}));
  assert.throws(() => transitionEngagement(state, "producing", {productionPieceIds: ["piece-a", "piece-b"]}), TransitionError);
});

test("invalidation histories cannot mutate global rules", () => {
  const first = invalidatePieces(readyState("piece-a"), {changeId: "change-a", changeType: "title", pieceIds: ["piece-a"]});
  first.pieces[0].invalidations[0].components.splice(0);
  first.events.at(-1).details.components.splice(0);
  const second = invalidatePieces(readyState("piece-b"), {changeId: "change-b", changeType: "title", pieceIds: ["piece-b"]});
  assert.equal(second.pieces[0].components.qa, "stale");
  assert.ok(second.pieces[0].invalidations[0].components.includes("qa"));
});

test("refreshes build and manual dependencies without invalidating unrelated pieces", () => {
  const state = readyState("piece-a", "piece-b");
  const build = invalidatePieces(state, {changeId: "build-2", changeType: "build", pieceIds: ["piece-a"]});
  assert.equal(build.pieces[0].components.capture, "stale");
  assert.equal(build.pieces[0].components.brand, "valid");
  assert.equal(build.pieces[1].status, "ready");
  const manual = invalidatePieces(state, {changeId: "manual-2", changeType: "manual", pieceIds: ["piece-a"]});
  assert.equal(manual.pieces[0].components.evidence, "stale");
  assert.equal(manual.pieces[0].components.capture, "valid");
  assert.equal(manual.pieces[0].components.voice, "valid");
});

