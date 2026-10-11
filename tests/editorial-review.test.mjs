import assert from "node:assert/strict";
import test from "node:test";
import {assertEditorialReviewCurrent, createEditorialReview, editorialDimensions, EditorialReviewError} from "../src/agency/editorial-review.mjs";

const scores = Object.fromEntries(editorialDimensions.map((dimension) => [dimension, 4]));
const reviewedInputs = Object.fromEntries(["channel", "motion", "strategy", "treatment"].map((key, index) => [key, `sha256:${String(index + 1).repeat(64)}`]));
const candidate = {piece_id: "piece-one", storyboard_id: "storyboard-one", storyboard_version: 2, storyboard_hash: `sha256:${"a".repeat(64)}`, preview_artifact_id: "preview-one", preview_hash: `sha256:${"b".repeat(64)}`, reviewed_inputs: reviewedInputs};
const input = {projectId: "product-one", pieceId: candidate.piece_id, storyboardId: candidate.storyboard_id, storyboardVersion: candidate.storyboard_version, storyboardHash: candidate.storyboard_hash, previewArtifactId: candidate.preview_artifact_id, previewHash: candidate.preview_hash, reviewedInputs, reviewer: "cold-editorial-critic", reviewedAt: "2026-10-11T13:00:00.000Z", scores, attempts: ["Tried to disprove the hook"], limits: ["No performance data"]};

test("binds a passing editorial review to the exact storyboard and preview revision", () => {
  const report = createEditorialReview(input);
  assert.equal(report.verdict, "pass");
  assert.equal(assertEditorialReviewCurrent(report, candidate), report);
  assert.throws(() => assertEditorialReviewCurrent(report, {...candidate, preview_hash: `sha256:${"c".repeat(64)}`}), /stale/);
  assert.throws(() => assertEditorialReviewCurrent(report, {...candidate, reviewed_inputs: {...reviewedInputs, motion: `sha256:${"f".repeat(64)}`}}), /stale/);
});

test("derives blocking verdicts from findings, low scores, or missing review inputs", () => {
  const finding = {severity: "blocking", dimension: "progression", location: "scene 2", problem: "Repeats the promise", consequence: "No payoff", revision: "Show evidenced mechanism"};
  const changes = createEditorialReview({...input, findings: [finding]});
  assert.equal(changes.verdict, "changes_requested");
  assert.throws(() => assertEditorialReviewCurrent(changes, candidate), /changes_requested/);
  assert.equal(createEditorialReview({...input, scores: {...scores, hook: 2}}).verdict, "changes_requested");
  assert.equal(createEditorialReview({...input, reviewBlockers: ["Preview unavailable"]}).verdict, "not_reviewable");
});

test("rejects incomplete rubrics and forged report contents", () => {
  const incomplete = {...scores}; delete incomplete.hook;
  assert.throws(() => createEditorialReview({...input, scores: incomplete}), EditorialReviewError);
  const report = createEditorialReview(input);
  const forged = structuredClone(report); forged.scores.hook = 1;
  assert.throws(() => assertEditorialReviewCurrent(forged, candidate), /identity/);
});
