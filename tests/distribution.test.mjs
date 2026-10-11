import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import {createDistributionPlan} from "../src/distribution/plan.mjs";
import {reviewSubject} from "../src/agency/review.mjs";
import {addApproval, createInitialState} from "../src/state/store.mjs";
import {createPieceState, setCurrentSubject} from "../src/state/transitions.mjs";
import {createExportManifest, createIndependentQaReport} from "../src/qa/export.mjs";

const root = new URL("../fixtures/contracts/field-service/", import.meta.url);
const plan = JSON.parse(await readFile(new URL("content-plan.json", root)));
const audiences = JSON.parse(await readFile(new URL("audiences.json", root)));
const piece = plan.suites[0].pieces[0];
const subject = reviewSubject({kind: "plan", scope: "plan-main", document: plan, audiences});

const styleHash = `sha256:${"9".repeat(64)}`;

function readyState({approved = true, styled = true} = {}) {
  let state = createInitialState(plan.project_id);
  const pieceState = createPieceState(piece.piece_id);
  pieceState.status = "ready"; pieceState.components.render = "valid"; pieceState.components.qa = "valid";
  state.pieces.push(pieceState);
  state = setCurrentSubject(state, "plan", subject);
  if (styled) {
    state = setCurrentSubject(state, "style", {kind: "style", scope: "style-main", version: 1, hash: styleHash, piece_ids: [piece.piece_id]});
    state = addApproval(state, {approval_id: "approval-style", kind: "style", scope: "style-main", confirmed_by: "owner", confirmed_at: "2026-10-11T12:00:00.000Z", subject_version: 1, subject_hash: styleHash, explicit_method: "conversation", status: "approved"});
  }
  if (approved) state = addApproval(state, {approval_id: "approval-plan", kind: "plan", scope: subject.scope, confirmed_by: "owner", confirmed_at: "2026-10-11T12:00:00.000Z", subject_version: subject.version, subject_hash: subject.hash, explicit_method: "conversation", status: "approved"});
  return state;
}

const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
const manifest = createExportManifest({pieceId: piece.piece_id, requestedVariants: ["clean-master"], artifacts: [{variant: "clean-master", content_type: "image/png", bytes: png}]});
const qa = createIndependentQaReport({manifest, reviewer: "independent-reviewer", reviewedAt: "2026-10-11T15:00:00.000Z", observations: [{kind: "visual", status: "passed", note: "Complete artifact inspected"}], completeMediaInspected: true});
const candidate = {piece_id: piece.piece_id, public_title: "Complete the field task", description: "A verified workflow.", cta: piece.cta, export_manifest: manifest, qa_report: qa, variants: [{export_variant: "clean-master", public_name: "Landscape master", format: "image/png"}], channels: [{channel: piece.channels[0], placement: "Product education", series: null}]};

test("builds proposal-only channel packages with public names and QA-bound exports", () => {
  const result = createDistributionPlan({state: readyState(), plan, audiences, version: 1, packages: [candidate], channelCapabilities: {[piece.channels[0]]: {status: "verified"}}});
  assert.equal(result.packages[0].publication_status, "not-published");
  assert.equal(result.packages[0].channels[0].proposal_only, true);
  assert.notEqual(result.packages[0].public_title, result.packages[0].piece_id);
});

test("blocks unapproved, unreviewed and out-of-plan packages", () => {
  assert.throws(() => createDistributionPlan({state: readyState({approved: false}), plan, audiences, version: 1, packages: [candidate], channelCapabilities: {}}), /approved plan/);
  assert.throws(() => createDistributionPlan({state: readyState(), plan, audiences, version: 1, packages: [{...candidate, qa_report: {...qa, verdict: "limited"}}], channelCapabilities: {}}), /contract-valid|passing QA/);
  assert.throws(() => createDistributionPlan({state: readyState(), plan, audiences, version: 1, packages: [{...candidate, channels: [{channel: "unknown"}]}], channelCapabilities: {}}), /outside/);
});

test("does not claim unverified channel placement concepts", () => {
  assert.throws(() => createDistributionPlan({state: readyState(), plan, audiences, version: 1, packages: [candidate], channelCapabilities: {[piece.channels[0]]: {status: "unverified"}}}), /require verified/);
  const generic = {...candidate, channels: [{channel: piece.channels[0], placement: null, series: null}]};
  const result = createDistributionPlan({state: readyState(), plan, audiences, version: 1, packages: [generic], channelCapabilities: {}});
  assert.equal(result.packages[0].channels[0].capability_status, "unverified");
});

test("binds package piece, passed manifest and declared format", () => {
  assert.throws(() => createDistributionPlan({state: readyState(), plan, audiences, version: 1, packages: [{...candidate, export_manifest: {...manifest, piece_id: "other"}}], channelCapabilities: {[piece.channels[0]]: {status: "verified"}}}), /contract-valid|own passed export/);
  assert.throws(() => createDistributionPlan({state: readyState(), plan, audiences, version: 1, packages: [{...candidate, variants: [{...candidate.variants[0], format: "video/mp4"}]}], channelCapabilities: {[piece.channels[0]]: {status: "verified"}}}), /format does not match/);
  assert.throws(() => createDistributionPlan({state: readyState(), plan, audiences, version: 1, packages: [{...candidate, qa_report: {piece_id: piece.piece_id, export_manifest_id: manifest.export_manifest_id, verdict: "pass"}}], channelCapabilities: {[piece.channels[0]]: {status: "verified"}}}), /contract-valid/);
  const changedManifest = structuredClone(manifest); changedManifest.artifacts[0].sha256 = "a".repeat(64);
  assert.throws(() => createDistributionPlan({state: readyState(), plan, audiences, version: 1, packages: [{...candidate, export_manifest: changedManifest}], channelCapabilities: {[piece.channels[0]]: {status: "verified"}}}), /identity/);
  const forgedQa = structuredClone(qa); forgedQa.observations[0].status = "failed"; forgedQa.verdict = "pass";
  assert.throws(() => createDistributionPlan({state: readyState(), plan, audiences, version: 1, packages: [{...candidate, qa_report: forgedQa}], channelCapabilities: {[piece.channels[0]]: {status: "verified"}}}), /contract-valid/);
});

test("requires a current style approval for every packaged piece", () => {
  assert.throws(() => createDistributionPlan({state: readyState({styled: false}), plan, audiences, version: 1, packages: [candidate], channelCapabilities: {}}), /style approval/);
});
