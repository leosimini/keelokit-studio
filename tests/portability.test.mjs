import assert from "node:assert/strict";
import {mkdtemp} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join, resolve} from "node:path";
import test from "node:test";
import {verifyPortability} from "../src/verification/portability.mjs";
import {createInitialState, initializeState, loadState, saveState} from "../src/state/store.mjs";
import {createPieceState, invalidatePieces} from "../src/state/transitions.mjs";
import {preparePaidJob, recordJobResult} from "../src/state/jobs.mjs";
import {createDashboard, initializeDashboard, loadDashboard, saveDashboard, setPublication} from "../src/dashboard/store.mjs";

const root = resolve(import.meta.dirname, "..");

test("validates two unrelated products without fixture or example leakage into core", async () => {
  const report = await verifyPortability({repositoryRoot: root, fixtures: [resolve(root, "fixtures/contracts/field-service"), resolve(root, "fixtures/contracts/learning-platform")], forbiddenTokens: ["jou" + "na"]});
  assert.equal(report.status, "passed");
  assert.equal(report.products.length, 2);
  assert.notEqual(report.products[0].project_id, report.products[1].project_id);
  assert.notEqual(report.products[0].audience_count, report.products[1].audience_count);
  assert.deepEqual(report.core_leaks, []);
});

test("resumes jobs, publication history and selective refresh across sessions", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "studio-resume-e2e-"));
  let state = createInitialState("portable-project");
  state.costs = {currency: "USD", approved_limit: 2, known_total: 0};
  const pieceA = createPieceState("piece-a"), pieceB = createPieceState("piece-b");
  for (const piece of [pieceA, pieceB]) { piece.status = "ready"; for (const component of Object.keys(piece.components)) piece.components[component] = "valid"; }
  state.pieces.push(pieceA, pieceB);
  const prepared = preparePaidJob(state, {provider: "configured", operation: "voice", requestIdentity: {text: "approved"}, estimatedCost: 0.2, currency: "USD", maxAttempts: 2});
  state = recordJobResult(state, {provider: "configured", operation: "voice", requestHash: prepared.request_hash, status: "uncertain", providerJobId: "remote-one", reservedCost: 0.2, currency: "USD", source: "submission"});
  await initializeState(projectRoot, state);
  let dashboard = createDashboard({projectId: state.project_id, suites: [{suite_id: "suite-one", title: "Use", piece_ids: ["piece-a", "piece-b"]}], pieces: ["piece-a", "piece-b"].map((piece_id) => ({piece_id, suite_id: "suite-one", title: piece_id, status: "ready", publications: [{review_id: "review-one", channel: "configured", published: false, url: null, published_at: null, updated_at: "2026-10-11T12:00:00.000Z"}]}))});
  await initializeDashboard(projectRoot, dashboard);
  state = await loadState(projectRoot); dashboard = await loadDashboard(projectRoot);
  assert.equal(preparePaidJob(state, {provider: "configured", operation: "voice", requestIdentity: {text: "approved"}, estimatedCost: 0.2, currency: "USD", maxAttempts: 2}).action, "query-required");
  dashboard = await saveDashboard(projectRoot, setPublication(dashboard, {pieceId: "piece-a", reviewId: "review-one", channel: "configured", published: true, publishedAt: "2026-10-11T13:00:00.000Z", url: "https://example.test/a", updatedAt: "2026-10-11T13:00:00.000Z"}));
  state = invalidatePieces(state, {changeId: "build-two", changeType: "build", pieceIds: ["piece-b"]});
  state = (await saveState(projectRoot, state)).state;
  const resumedState = await loadState(projectRoot), resumedDashboard = await loadDashboard(projectRoot);
  assert.equal(resumedState.pieces[0].status, "ready");
  assert.equal(resumedState.pieces[1].components.capture, "stale");
  assert.equal(resumedDashboard.pieces[0].publications[0].published, true);
});
