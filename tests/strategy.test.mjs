import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";
import {createContentStrategy, buildPublicationQueue, StrategyError} from "../src/agency/strategy.mjs";
import {reviewSubject} from "../src/agency/review.mjs";
import {addApproval, createInitialState} from "../src/state/store.mjs";
import {createPieceState} from "../src/state/transitions.mjs";
import {createDashboard} from "../src/dashboard/store.mjs";

const root = new URL("../fixtures/contracts/field-service/", import.meta.url);
const audiences = JSON.parse(await readFile(new URL("audiences.json", root)));
const originalPlan = JSON.parse(await readFile(new URL("content-plan.json", root)));
const plan = structuredClone(originalPlan);
plan.suites[0].pieces.push({...structuredClone(plan.suites[0].pieces[0]), piece_id: "piece-followup", intention: "Explain assignment proof", order: 2});
const subject = reviewSubject({kind: "plan", scope: "plan-main", document: plan, audiences});
const sources = {schema_version: 1, project_id: plan.project_id, sources: [{source_id: "src-readme", kind: "readme", location: "README.md", observed_at: "2026-10-11T12:00:00.000Z", build: null, status: "confirmed", content_hash: "a".repeat(64), availability_evidence: "none"}]};
const evidence = {schema_version: 1, project_id: plan.project_id, evidence: [{evidence_id: "ev-assign", hashes: [`sha256:${"b".repeat(64)}`]}]};

function candidate(key, pieceId, expectedImpact, effort, dependsOnKeys = []) {
  return {key, piece_id: pieceId, channel: "help-center", recipe_ids: ["task-alternative-value-proof"], reasoning: {audience_need: "Dispatchers need to assign urgent work", why_this_piece: `Piece ${pieceId} demonstrates the task`, why_this_channel: "The approved help center serves active operators", why_now: "Activation evidence is available", citations: [{kind: "source", id: "src-readme", hash: `sha256:${"a".repeat(64)}`, locator: "audience task"}, {kind: "evidence", id: "ev-assign", hash: `sha256:${"b".repeat(64)}`, locator: "verified result"}]}, impact_hypothesis: {statement: "Showing the verified task may improve activation understanding", objective_fit: 3, expected_impact: expectedImpact, basis: "The piece matches the approved activation task", confidence: "medium", assumptions: ["Help-center visitors intend to activate"], unknowns: ["Observed conversion is unavailable"], observation_ids: []}, effort: {estimated_minutes: effort, basis: "Estimate from one verified capture"}, declared_blockers: [], alternatives: [{label: "Announcement first", reason_not_selected: "It would not demonstrate the task", citations: []}], depends_on_keys: dependsOnKeys, republication: null};
}

const approvedState = (state) => addApproval(state, {approval_id: "approval-plan", kind: "plan", scope: subject.scope, confirmed_by: "owner", confirmed_at: "2026-10-11T12:00:00.000Z", subject_version: subject.version, subject_hash: subject.hash, explicit_method: "conversation", status: "approved"});

function strategy(candidates) { return createContentStrategy({projectId: plan.project_id, version: 1, plan, audiences, planSubject: subject, sourceObservations: sources, evidence, candidates, recordedAt: "2026-10-11T13:00:00.000Z"}); }

test("persists cited strategy reasoning, uncertainty, recipes and deterministic ranking", () => {
  const first = candidate("first", "piece-assign", 2, 20);
  const second = candidate("second", "piece-followup", 3, null);
  const value = strategy([first, second]);
  assert.equal(value.candidates[0].recipes[0].recipe_id, "task-alternative-value-proof");
  assert.deepEqual(value.candidates[0].impact_hypothesis.observation_ids, []);
  assert.match(value.content_hash, /^sha256:/);
  let state = approvedState(createInitialState(plan.project_id)); for (const piece of plan.suites[0].pieces) { const item = createPieceState(piece.piece_id); item.status = "ready"; state.pieces.push(item); }
  const dashboard = createDashboard({projectId: plan.project_id, suites: [{suite_id: "suite-activation", title: "Activation", piece_ids: ["piece-assign", "piece-followup"]}], pieces: plan.suites[0].pieces.map((piece) => ({piece_id: piece.piece_id, suite_id: "suite-activation", title: piece.intention, status: "ready", publications: [{review_id: "review-one", channel: "help-center", published: false, url: null, published_at: null, updated_at: "2026-10-11T13:00:00.000Z"}]})), now: "2026-10-11T13:00:00.000Z"});
  const distributionPlan = {packages: plan.suites[0].pieces.map((piece) => ({piece_id: piece.piece_id, channels: [{channel: "help-center"}]}))};
  const one = buildPublicationQueue({strategy: value, plan, audiences, planSubject: subject, distributionPlan, state, dashboard});
  const two = buildPublicationQueue({strategy: strategy([second, first]), plan, audiences, planSubject: subject, distributionPlan, state, dashboard});
  assert.deepEqual(one.items.map(({piece_id}) => piece_id), ["piece-followup", "piece-assign"]);
  assert.deepEqual(two.items.map(({piece_id}) => piece_id), one.items.map(({piece_id}) => piece_id));
  assert.deepEqual(one.items[0].observed_outcomes, []);
});

test("rejects stale citations, unsupported recipes and cyclic publication dependencies", () => {
  const stale = candidate("one", "piece-assign", 2, 20); stale.reasoning.citations[0].hash = `sha256:${"c".repeat(64)}`;
  assert.throws(() => strategy([stale]), /Stale citation/);
  const unknown = candidate("one", "piece-assign", 2, 20); unknown.recipe_ids = ["unknown"];
  assert.throws(() => strategy([unknown]), /Unknown recipe/);
  assert.throws(() => strategy([candidate("one", "piece-assign", 2, 20, ["two"]), candidate("two", "piece-followup", 2, 20, ["one"])]), /cycle/);
});

test("keeps unknown effort unknown and blocks readiness without validated distribution inputs", () => {
  const value = strategy([candidate("one", "piece-assign", 2, null)]);
  const state = approvedState(createInitialState(plan.project_id));
  const dashboard = createDashboard({projectId: plan.project_id, suites: [{suite_id: "suite-activation", title: "Activation", piece_ids: ["piece-assign"]}], pieces: [{piece_id: "piece-assign", suite_id: "suite-activation", title: "Assign", status: "draft", publications: [{review_id: "review-one", channel: "help-center", published: false, url: null, published_at: null, updated_at: "2026-10-11T13:00:00.000Z"}]}], now: "2026-10-11T13:00:00.000Z"});
  const queue = buildPublicationQueue({strategy: value, plan, audiences, planSubject: subject, state, dashboard});
  assert.equal(queue.items[0].status, "blocked");
  assert.equal(queue.items[0].rank_components.estimated_minutes, null);
  assert.deepEqual(queue.items[0].observed_outcomes, []);
  assert.throws(() => createContentStrategy({projectId: plan.project_id, version: 1, plan, audiences, planSubject: {...subject, hash: `sha256:${"d".repeat(64)}`}, sourceObservations: sources, evidence, candidates: [candidate("one", "piece-assign", 2, 20)]}), StrategyError);
});

test("refuses a queue from a tampered strategy, a stale plan or an unapproved plan", () => {
  const value = strategy([candidate("one", "piece-assign", 2, 20)]);
  const state = approvedState(createInitialState(plan.project_id));
  const dashboard = createDashboard({projectId: plan.project_id, suites: [{suite_id: "suite-activation", title: "Activation", piece_ids: ["piece-assign", "piece-followup"]}], pieces: plan.suites[0].pieces.map((piece) => ({piece_id: piece.piece_id, suite_id: "suite-activation", title: piece.intention, status: "draft", publications: []}))});
  const args = {strategy: value, plan, audiences, planSubject: subject, state, dashboard};
  assert.ok(buildPublicationQueue(args));
  assert.throws(() => buildPublicationQueue({...args, strategy: {...value, content_hash: `sha256:${"0".repeat(64)}`}}), /content hash/);
  assert.throws(() => buildPublicationQueue({...args, plan: {...plan, suites: [{...plan.suites[0], pieces: plan.suites[0].pieces.map((piece, index) => index === 0 ? {...piece, intention: "Changed after approval"} : piece)}]}}), /exact current plan subject/);
  assert.throws(() => buildPublicationQueue({...args, state: createInitialState(plan.project_id)}), /plan approval/);
});
