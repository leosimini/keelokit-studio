import {randomUUID} from "node:crypto";
import {assertValidState, hasCurrentApproval, StateValidationError} from "./store.mjs";

const transitions = new Map([
  ["discovered", new Set(["interviewing", "brief_draft", "blocked"])],
  ["interviewing", new Set(["brief_draft", "blocked"])],
  ["brief_draft", new Set(["interviewing", "plan_draft", "blocked"])],
  ["plan_draft", new Set(["brief_draft", "awaiting_plan_approval", "blocked"])],
  ["awaiting_plan_approval", new Set(["plan_draft", "pilot_in_progress", "producing", "blocked"])],
  ["pilot_in_progress", new Set(["awaiting_style_approval", "blocked"])],
  ["awaiting_style_approval", new Set(["pilot_in_progress", "producing", "blocked"])],
  ["producing", new Set(["reviewing", "blocked"])],
  ["reviewing", new Set(["producing", "ready", "blocked"])],
  ["ready", new Set(["reviewing", "blocked"])],
  ["blocked", new Set(["interviewing", "brief_draft", "plan_draft", "awaiting_plan_approval", "pilot_in_progress", "awaiting_style_approval", "producing", "reviewing"])]
]);

const invalidationMap = {
  title: ["script", "composition", "render", "qa", "distribution"],
  ui: ["evidence", "capture", "script", "voice", "composition", "render", "qa", "distribution"],
  role: ["evidence", "capture", "script", "voice", "composition", "render", "qa", "distribution"],
  journey: ["evidence", "capture", "script", "voice", "composition", "render", "qa", "distribution"],
  build: ["evidence", "capture", "script", "voice", "composition", "render", "qa", "distribution"],
  manual: ["evidence", "script", "composition", "render", "qa", "distribution"],
  brand: ["brand", "composition", "render", "qa", "distribution"],
  voice: ["voice", "composition", "render", "qa", "distribution"]
};

export class TransitionError extends Error {
  constructor(message) {
    super(message);
    this.name = "TransitionError";
  }
}

export function createPieceState(pieceId, {planSubject = "plan", styleSubject = "style"} = {}) {
  return {
    piece_id: pieceId,
    plan_subject: planSubject,
    style_subject: styleSubject,
    status: "draft",
    components: {
      evidence: "missing",
      capture: "missing",
      script: "missing",
      voice: "missing",
      brand: "missing",
      composition: "missing",
      render: "missing",
      qa: "missing",
      distribution: "missing"
    },
    invalidations: []
  };
}

export function setCurrentSubject(state, key, subject, now = new Date().toISOString()) {
  const next = structuredClone(state);
  next.versions[key] = structuredClone(subject);
  next.events.push({event_id: randomUUID(), type: "subject.versioned", recorded_at: now, details: {key, scope: subject.scope, version: subject.version, hash: subject.hash}});
  next.updated_at = now;
  return assertValidState(next);
}

function requireApproval(state, kind, subjectKey, label) {
  const subject = state.versions[subjectKey];
  if (!subject || !hasCurrentApproval(state, {kind, scope: subject.scope, subjectVersion: subject.version, subjectHash: subject.hash})) {
    throw new TransitionError(`${label} requires a current explicit ${kind} approval for the persisted scope, version, and hash`);
  }
  return subject;
}

const planningPhases = new Set(["interviewing", "brief_draft", "plan_draft"]);

function interruptedPhase(state) {
  const entered = state.events.findLast((event) => event.type === "engagement.transitioned" && event.details?.to === "blocked");
  return entered?.details?.from ?? null;
}

export function transitionEngagement(state, target, options = {}, now = new Date().toISOString()) {
  const allowed = transitions.get(state.engagement_phase);
  if (!allowed?.has(target)) throw new TransitionError(`Cannot transition from ${state.engagement_phase} to ${target}`);
  if (state.engagement_phase === "blocked" && !planningPhases.has(target) && target !== interruptedPhase(state)) {
    throw new TransitionError(`blocked work resumes only at the interrupted phase (${interruptedPhase(state) ?? "unknown"}) or a planning phase, not ${target}`);
  }
  if (["awaiting_plan_approval", "pilot_in_progress", "producing"].includes(target)) requireApproval(state, "brief", options.briefSubject ?? "brief", target);
  if (target === "ready") assertReadyPieces(state, options);

  const planSubjectKey = options.planSubject ?? "plan";
  let planSubject;
  if (["pilot_in_progress", "producing"].includes(target)) planSubject = requireApproval(state, "plan", planSubjectKey, target);
  if (target === "pilot_in_progress") {
    if (!Array.isArray(options.pilotPieceIds) || options.pilotPieceIds.length === 0) throw new TransitionError("pilot_in_progress requires at least one planned pilot piece");
    const pieces = new Map(state.pieces.map((piece) => [piece.piece_id, piece]));
    for (const pieceId of options.pilotPieceIds) {
      const piece = pieces.get(pieceId);
      if (!piece || piece.plan_subject !== planSubjectKey || !planSubject.piece_ids.includes(pieceId)) {
        throw new TransitionError(`pilot piece ${pieceId} is outside the approved plan subject ${planSubjectKey}`);
      }
    }
  }
  if (target === "producing") {
    if (!Array.isArray(options.productionPieceIds) || options.productionPieceIds.length === 0) throw new TransitionError("producing requires at least one planned piece");
    const pieces = new Map(state.pieces.map((piece) => [piece.piece_id, piece]));
    for (const pieceId of options.productionPieceIds) {
      const piece = pieces.get(pieceId);
      if (!piece || piece.plan_subject !== planSubjectKey || !planSubject.piece_ids.includes(pieceId)) {
        throw new TransitionError(`production piece ${pieceId} is outside the approved plan subject ${planSubjectKey}`);
      }
      const styleSubject = requireApproval(state, "style", piece.style_subject, `production piece ${pieceId}`);
      if (!styleSubject.piece_ids.includes(pieceId)) throw new TransitionError(`style subject ${piece.style_subject} does not cover production piece ${pieceId}`);
    }
  }

  const next = structuredClone(state);
  next.engagement_phase = target;
  next.events.push({
    event_id: randomUUID(),
    type: "engagement.transitioned",
    recorded_at: now,
    details: {from: state.engagement_phase, to: target, piece_ids: target === "producing" ? [...options.productionPieceIds] : target === "pilot_in_progress" ? [...options.pilotPieceIds] : target === "ready" ? [...options.readyPieceIds] : []}
  });
  next.updated_at = now;
  return assertValidState(next);
}

function assertReadyPieces(state, options) {
  if (!Array.isArray(options.readyPieceIds) || options.readyPieceIds.length === 0) throw new TransitionError("ready requires readyPieceIds naming at least one piece");
  for (const pieceId of options.readyPieceIds) {
    const piece = state.pieces.find((candidate) => candidate.piece_id === pieceId);
    if (!piece) throw new TransitionError(`ready piece ${pieceId} is not persisted`);
    for (const component of ["render", "qa"]) if (piece.components[component] !== "valid") throw new TransitionError(`ready piece ${pieceId} requires a valid ${component} component`);
    const style = requireApproval(state, "style", piece.style_subject, `ready piece ${pieceId}`);
    if (!style.piece_ids.includes(pieceId)) throw new TransitionError(`style subject ${piece.style_subject} does not cover ready piece ${pieceId}`);
  }
}

export function invalidatePieces(state, {changeId, changeType, pieceIds}, now = new Date().toISOString()) {
  if (!changeId) throw new StateValidationError([{instancePath: "/change_id", message: "must be provided"}]);
  const components = invalidationMap[changeType];
  if (!components) throw new StateValidationError([{instancePath: "/change_type", message: "is not supported"}]);
  const selected = new Set(pieceIds ?? []);
  const known = new Set(state.pieces.map(({piece_id}) => piece_id));
  for (const pieceId of selected) if (!known.has(pieceId)) throw new StateValidationError([{instancePath: "/piece_ids", message: `references unknown piece ${pieceId}`}]);

  const next = structuredClone(state);
  const affectedStyles = new Set();
  for (const piece of next.pieces) {
    if (!selected.has(piece.piece_id)) continue;
    for (const component of components) if (piece.components[component] === "valid") piece.components[component] = "stale";
    piece.status = "stale";
    piece.invalidations.push({change_id: changeId, change_type: changeType, components: [...components], recorded_at: now});
    if (["brand", "voice"].includes(changeType)) affectedStyles.add(piece.style_subject);
  }
  for (const subject of affectedStyles) delete next.versions[subject];
  next.events.push({
    event_id: randomUUID(),
    type: "pieces.invalidated",
    recorded_at: now,
    details: {change_id: changeId, change_type: changeType, piece_ids: [...selected], components: [...components], invalidated_style_subjects: [...affectedStyles]}
  });
  next.updated_at = now;
  return assertValidState(next);
}

