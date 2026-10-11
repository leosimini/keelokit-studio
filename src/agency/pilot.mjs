import {randomUUID} from "node:crypto";
import {contentHash, stableId} from "../core/ids.mjs";
import {addApproval, assertValidState, hasCurrentApproval} from "../state/store.mjs";
import {setCurrentSubject} from "../state/transitions.mjs";

export class PilotError extends Error {}

function currentApproval(state, kind, subject) {
  return hasCurrentApproval(state, {kind, scope: subject.scope, subjectVersion: subject.version, subjectHash: subject.hash});
}

export function selectPilotSet({state, planSubjectKey = "plan", candidates}) {
  assertValidState(state);
  const plan = state.versions[planSubjectKey];
  if (!plan || plan.kind !== "plan" || !currentApproval(state, "plan", plan)) throw new PilotError("Pilot creation requires the current persisted plan approval");
  if (!Array.isArray(candidates) || candidates.length === 0) throw new PilotError("Pilot candidates are required");
  const planned = new Set(plan.piece_ids);
  const selected = new Map();
  for (const candidate of candidates) {
    if (!candidate || !planned.has(candidate.piece_id)) throw new PilotError(`Pilot candidate ${candidate?.piece_id ?? "unknown"} is outside approved plan scope`);
    if (typeof candidate.style_signature !== "string" || !candidate.style_signature) throw new PilotError("Every candidate requires an explicit material style signature");
    if (typeof candidate.preview_artifact_id !== "string" || !candidate.preview_artifact_id || typeof candidate.preview_hash !== "string" || !/^sha256:[a-f0-9]{64}$/.test(candidate.preview_hash)) throw new PilotError("Every candidate requires a content-bound preview artifact");
    if (!selected.has(candidate.style_signature)) selected.set(candidate.style_signature, structuredClone(candidate));
  }
  return [...selected.values()].sort((left, right) => left.style_signature.localeCompare(right.style_signature));
}

export function createPilotReview({state, planSubjectKey = "plan", candidates, scope, version}) {
  if (typeof scope !== "string" || !scope || !Number.isInteger(version) || version < 1) throw new PilotError("Pilot style scope and positive version are required");
  const pieces = selectPilotSet({state, planSubjectKey, candidates});
  const plan = state.versions[planSubjectKey];
  const coveredPieceIds = [...new Set(candidates.map(({piece_id}) => piece_id))].sort();
  const review = {project_id: state.project_id, scope, version, plan: {scope: plan.scope, version: plan.version, hash: plan.hash}, covered_piece_ids: coveredPieceIds, pilots: pieces};
  const subject = {kind: "style", project_id: state.project_id, scope, version, hash: contentHash(review), piece_ids: coveredPieceIds};
  return {review: {...review, review_id: stableId("pilot-review", review)}, subject};
}

export function persistPilotSubject(state, subjectKey, subject, now = new Date().toISOString()) {
  if (subject.kind !== "style" || subject.project_id !== state.project_id) throw new PilotError("Style subject must belong to the engagement project");
  return setCurrentSubject(state, subjectKey, subject, now);
}

export function recordStyleOutcome(state, {subjectKey, expectedSubject, outcome, confirmedBy, explicitMethod, comments = [], recordedAt = new Date().toISOString()}) {
  assertValidState(state);
  const current = state.versions[subjectKey];
  if (!current || current.kind !== "style") throw new PilotError("A persisted style subject is required");
  if (!expectedSubject || ["scope", "version", "hash"].some((key) => expectedSubject[key] !== current[key])) throw new PilotError("Style response does not match the currently persisted pilot subject");
  if (typeof confirmedBy !== "string" || !confirmedBy || !["conversation", "file", "dashboard", "api"].includes(explicitMethod)) throw new PilotError("Style review requires explicit reviewer and method");
  if (!Array.isArray(comments) || comments.some((value) => typeof value !== "string" || !value)) throw new PilotError("Style comments must be non-empty strings");
  if (!new Set(["approved", "changes_requested"]).has(outcome) || (outcome === "changes_requested" && comments.length === 0)) throw new PilotError("Style outcome must be approved or changes_requested with comments");
  const status = outcome === "approved" ? "approved" : "revoked";
  let next = addApproval(state, {approval_id: stableId("approval", {subjectKey, expectedSubject, outcome, confirmedBy, explicitMethod, recordedAt}), kind: "style", scope: current.scope, confirmed_by: confirmedBy, confirmed_at: recordedAt, subject_version: current.version, subject_hash: current.hash, explicit_method: explicitMethod, status}, recordedAt);
  next.events.push({event_id: randomUUID(), type: outcome === "approved" ? "style.approved" : "style.changes-requested", recorded_at: recordedAt, details: {subject_key: subjectKey, scope: current.scope, version: current.version, hash: current.hash, comments: [...comments]}});
  next.updated_at = recordedAt;
  return assertValidState(next);
}

export function styleGate(state, pieceIds) {
  assertValidState(state);
  const failures = [];
  for (const pieceId of pieceIds) {
    const piece = state.pieces.find((candidate) => candidate.piece_id === pieceId);
    if (!piece) { failures.push({piece_id: pieceId, reason: "piece is not persisted"}); continue; }
    const subject = state.versions[piece.style_subject];
    if (!subject || !subject.piece_ids.includes(pieceId) || !currentApproval(state, "style", subject)) failures.push({piece_id: pieceId, reason: "current style approval is missing or stale"});
  }
  return {status: failures.length ? "blocked" : "ready", failures};
}
