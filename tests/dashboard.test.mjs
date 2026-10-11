import assert from "node:assert/strict";
import {mkdtemp, readFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import test from "node:test";
import {createDashboard, initializeDashboard, loadDashboard, saveDashboard, setPublication} from "../src/dashboard/store.mjs";
import {renderDashboardHtml} from "../src/dashboard/html.mjs";
import {projectDashboard} from "../src/dashboard/project.mjs";

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
  assert.match(html, /Recommended publication queue/);
});

test("projects production and ranking idempotently without erasing publication history", () => {
  const dashboard = sample();
  dashboard.pieces[0].history.push({revision_id: "publication-event", kind: "publication", status: "published", recorded_at: "2026-10-11T15:10:00.000Z", details: {channel: "configured-channel"}});
  const plan = {project_id: "project-one", plan_id: "plan-one", version: 1, suites: [{suite_id: "suite-one", objective: "Activation", pieces: [{piece_id: "piece-one", intention: "First task", channels: ["configured-channel"]}]}]};
  const queue = {project_id: "project-one", source_plan: {plan_id: "plan-one", version: 1}, dashboard_revision: 0, items: [{candidate_id: "candidate-one", piece_id: "piece-one", channel: "configured-channel", position: 1, status: "ready", blockers: [], selection_reason: "Addresses the highest-friction activation step.", recipe_ids: ["prerequisite-tutorial"], impact_hypothesis: "A concrete walkthrough may reduce setup uncertainty.", observed_outcomes: []}]};
  const event = {kind: "render", status: "passed", recorded_at: "2026-10-11T15:20:00.000Z", details: {manifest_id: "manifest-one"}};
  const update = {piece_id: "piece-one", status: "ready", blockers: [], previews: [{artifact_id: "preview-two", label: "Motion preview", path: "media/studio/motion.mp4", status: "passed"}], exports: [], events: [event]};
  const first = projectDashboard({dashboard, plan, queue, pieceUpdates: [update], now: "2026-10-11T15:30:00.000Z"});
  const replayed = projectDashboard({dashboard: first, plan, queue: {...queue, dashboard_revision: first.revision}, pieceUpdates: [update], now: "2026-10-11T15:31:00.000Z"});
  assert.equal(replayed.pieces[0].history.filter(({kind}) => kind === "render").length, 1);
  assert.ok(replayed.pieces[0].history.some(({revision_id}) => revision_id === "publication-event"));
  assert.deepEqual(replayed.pieces[0].publications, dashboard.pieces[0].publications);
  assert.equal(replayed.recommendations[0].recipe_ids[0], "prerequisite-tutorial");
  assert.throws(() => projectDashboard({dashboard, plan: {...plan, version: 2}, queue, now: "2026-10-11T15:31:00.000Z"}), /stale/);
  assert.throws(() => projectDashboard({dashboard, plan, queue: {...queue, items: [{...queue.items[0], piece_id: "removed"}]}, now: "2026-10-11T15:31:00.000Z"}), /unknown planned piece/);
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
