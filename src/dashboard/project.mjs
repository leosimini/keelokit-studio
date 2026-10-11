import {stableId} from "../core/ids.mjs";
import {createDashboard} from "./store.mjs";

export class DashboardProjectionError extends Error {}

function eventFrom(update, event) {
  if (!event || typeof event.kind !== "string" || !event.kind || typeof event.status !== "string" || !event.status || typeof event.recorded_at !== "string" || Number.isNaN(Date.parse(event.recorded_at)) || new Date(event.recorded_at).toISOString() !== event.recorded_at || !event.details || typeof event.details !== "object" || Array.isArray(event.details)) throw new DashboardProjectionError("Production history events require kind, status, exact time and details");
  return {...structuredClone(event), revision_id: event.revision_id ?? stableId("revision", {pieceId: update.piece_id, kind: event.kind, status: event.status, recordedAt: event.recorded_at, details: event.details})};
}

export function projectDashboard({dashboard, plan, queue = null, pieceUpdates = [], now = new Date().toISOString()}) {
  if (!dashboard || dashboard.project_id !== plan?.project_id || queue && queue.project_id !== plan.project_id) throw new DashboardProjectionError("Dashboard, plan and queue must share a project");
  if (typeof now !== "string" || Number.isNaN(Date.parse(now)) || new Date(now).toISOString() !== now) throw new DashboardProjectionError("now must be an exact ISO instant");
  const plannedPieces = plan.suites.flatMap((suite) => suite.pieces.map((piece) => ({piece, suite})));
  const plannedIds = new Set(plannedPieces.map(({piece}) => piece.piece_id));
  const updates = new Map();
  for (const update of pieceUpdates) {
    if (!plannedIds.has(update.piece_id) || updates.has(update.piece_id)) throw new DashboardProjectionError(`Unknown or duplicate piece update ${update.piece_id}`);
    updates.set(update.piece_id, update);
  }
  const prior = new Map(dashboard.pieces.map((piece) => [piece.piece_id, piece]));
  const suites = plan.suites.map((suite) => ({suite_id: suite.suite_id, title: suite.objective, piece_ids: suite.pieces.map(({piece_id}) => piece_id)}));
  const pieces = plannedPieces.map(({piece, suite}) => {
    const before = prior.get(piece.piece_id);
    const update = updates.get(piece.piece_id);
    const history = [...(before?.history ?? [])];
    const knownEvents = new Set(history.map(({revision_id}) => revision_id));
    for (const raw of update?.events ?? []) { const event = eventFrom(update, raw); if (!knownEvents.has(event.revision_id)) { history.push(event); knownEvents.add(event.revision_id); } }
    return {piece_id: piece.piece_id, suite_id: suite.suite_id, title: piece.intention, status: update?.status ?? before?.status ?? "draft", blockers: [...new Set(update?.blockers ?? before?.blockers ?? [])], previews: structuredClone(update?.previews ?? before?.previews ?? []), exports: structuredClone(update?.exports ?? before?.exports ?? []), history, publications: structuredClone(before?.publications ?? [])};
  });
  const recommendations = (queue?.items ?? []).map(({candidate_id, piece_id, channel, position, status, blockers, selection_reason, recipe_ids, impact_hypothesis, observed_outcomes}) => ({candidate_id, piece_id, channel, position, status, blockers: [...blockers], selection_reason, recipe_ids: [...recipe_ids], impact_hypothesis, observed_outcomes: structuredClone(observed_outcomes)}));
  const projected = createDashboard({projectId: plan.project_id, suites, pieces, recommendations, now});
  return {...projected, revision: dashboard.revision};
}
