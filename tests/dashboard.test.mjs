import assert from "node:assert/strict";
import {mkdtemp, readFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import test from "node:test";
import {createDashboard, initializeDashboard, loadDashboard, saveDashboard, setPublication} from "../src/dashboard/store.mjs";
import {renderDashboardHtml} from "../src/dashboard/html.mjs";

function sample(now = "2026-10-11T15:00:00.000Z") { return createDashboard({projectId: "project-one", suites: [{suite_id: "suite-one", title: "Activation", piece_ids: ["piece-one"]}], pieces: [{piece_id: "piece-one", suite_id: "suite-one", title: "First task", status: "ready", blockers: [], previews: [{artifact_id: "preview-one", label: "Preview", path: "media/studio/preview.png", status: "not-reviewed"}], exports: [{artifact_id: "export-one", label: "Clean master", path: "media/studio/master.mp4", status: "passed"}], publications: [{review_id: "review-one", channel: "configured-channel", published: false, url: null, published_at: null, updated_at: now}]}], now}); }

test("persists progress, previews, exports, history and publication toggles across sessions", async () => {
  const root = await mkdtemp(join(tmpdir(), "studio-dashboard-"));
  await initializeDashboard(root, sample());
  let dashboard = await loadDashboard(root);
  dashboard = setPublication(dashboard, {pieceId: "piece-one", reviewId: "review-one", channel: "configured-channel", published: true, url: "https://example.test/piece", publishedAt: "2026-10-11T16:00:00.000Z", updatedAt: "2026-10-11T16:01:00.000Z"});
  dashboard = await saveDashboard(root, dashboard);
  const restarted = await loadDashboard(root);
  assert.equal(restarted.revision, 1);
  assert.equal(restarted.pieces[0].publications[0].published, true);
  assert.equal(restarted.pieces[0].history.at(-1).status, "published");
  const unpublished = await saveDashboard(root, setPublication(restarted, {pieceId: "piece-one", reviewId: "review-one", channel: "configured-channel", published: false, updatedAt: "2026-10-11T17:00:00.000Z"}));
  assert.equal(unpublished.pieces[0].publications[0].url, null);
  assert.ok((await readFile(join(root, ".keelokit/studio/dashboard.json"), "utf8")).includes('"revision": 2'));
});

test("renders a standalone HTML view without trusting project text as markup", () => {
  const dashboard = sample(); dashboard.pieces[0].title = "<script>alert(1)</script>";
  const html = renderDashboardHtml(dashboard);
  assert.match(html, /Blockers/); assert.match(html, /Previews/); assert.match(html, /Exports/); assert.match(html, /Publication annotations/);
  assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/);
  assert.match(html, /Export state/);
});

test("rejects executable artifact paths and invalid publication metadata", () => {
  const dashboard = sample(); dashboard.pieces[0].previews[0].path = "javascript:alert(1)";
  assert.throws(() => renderDashboardHtml(createDashboard({projectId: dashboard.project_id, suites: dashboard.suites, pieces: dashboard.pieces})), /portable/);
  const valid = sample();
  assert.throws(() => setPublication(valid, {pieceId: "piece-one", reviewId: "unknown", channel: "configured-channel", published: true}), /already be configured/);
  assert.throws(() => setPublication(valid, {pieceId: "piece-one", reviewId: "review-one", channel: "configured-channel", published: true, url: "https://", updatedAt: "not-a-date"}), /valid HTTP/);
});

test("rejects publication URL leakage after unmark and stale concurrent saves", async () => {
  const root = await mkdtemp(join(tmpdir(), "studio-dashboard-"));
  await initializeDashboard(root, sample());
  const first = await loadDashboard(root), stale = await loadDashboard(root);
  await saveDashboard(root, setPublication(first, {pieceId: "piece-one", reviewId: "review-one", channel: "configured-channel", published: true, updatedAt: "2026-10-11T16:00:00.000Z"}));
  await assert.rejects(() => saveDashboard(root, stale), /revision changed/);
});
