import {randomUUID} from "node:crypto";
import {stableId} from "../core/ids.mjs";
import {assertValidState} from "../state/store.mjs";

const statuses = new Set(["confirmed", "inferred", "contradictory", "stale", "missing"]);
const impacts = new Set(["blocking", "limited", "informational"]);

function intersects(fieldScopes, activeScopes) {
  return fieldScopes.length === 0 || activeScopes.length === 0 || fieldScopes.some((scope) => activeScopes.includes(scope));
}

function relevantScopes(fieldScopes, activeScopes) {
  if (activeScopes.length === 0) return fieldScopes;
  if (fieldScopes.length === 0) return activeScopes;
  return fieldScopes.filter((scope) => activeScopes.includes(scope));
}

function pendingScopes(decisions, field, activeScopes) {
  const requiredScopes = relevantScopes(field.scope_ids, activeScopes);
  const current = decisions.filter((decision) =>
    decision.topic === `intake:${field.field_id}` &&
    decision.value?.status === "confirmed" &&
    decision.value?.subject_hash === field.subject_hash &&
    Array.isArray(decision.value.scope_ids)
  );
  if (current.some((decision) => decision.value.scope_ids.length === 0)) return null;
  if (requiredScopes.length === 0) return [];
  const covered = new Set(current.flatMap((decision) => decision.value.scope_ids));
  return requiredScopes.filter((scope) => !covered.has(scope));
}

function validateField(field) {
  if (!field || typeof field.field_id !== "string" || field.field_id.length === 0) throw new TypeError("Intake fields require field_id");
  if (typeof field.prompt !== "string" || field.prompt.length === 0) throw new TypeError(`Intake field ${field.field_id} requires a prompt`);
  if (!statuses.has(field.status)) throw new TypeError(`Unsupported intake status for ${field.field_id}: ${field.status}`);
  if (!impacts.has(field.impact)) throw new TypeError(`Unsupported gap impact for ${field.field_id}: ${field.impact}`);
  if (typeof field.subject_hash !== "string" || !/^sha256:[a-f0-9]{64}$/.test(field.subject_hash)) throw new TypeError(`Intake field ${field.field_id} requires subject_hash`);
  if (field.owner !== null && field.owner !== undefined && (typeof field.owner !== "string" || field.owner.length === 0)) throw new TypeError(`Intake field ${field.field_id} has an invalid owner`);
  if (!Array.isArray(field.scope_ids) || new Set(field.scope_ids).size !== field.scope_ids.length || field.scope_ids.some((scope) => typeof scope !== "string" || scope.length === 0)) throw new TypeError(`Intake field ${field.field_id} requires unique scope_ids`);
  if (field.source_ids !== undefined && (!Array.isArray(field.source_ids) || new Set(field.source_ids).size !== field.source_ids.length || field.source_ids.some((source) => typeof source !== "string" || source.length === 0))) throw new TypeError(`Intake field ${field.field_id} requires unique source_ids`);
}

export function planIntake({projectId, fields, decisions = [], activeScopeIds = [], batchSize = 3}) {
  if (typeof projectId !== "string" || projectId.length === 0) throw new TypeError("projectId is required");
  if (!Array.isArray(fields) || !Array.isArray(decisions) || !Array.isArray(activeScopeIds)) throw new TypeError("fields, decisions, and activeScopeIds must be arrays");
  if (new Set(activeScopeIds).size !== activeScopeIds.length || activeScopeIds.some((scope) => typeof scope !== "string" || scope.length === 0)) throw new TypeError("activeScopeIds must contain unique non-empty strings");
  if (![2, 3].includes(batchSize)) throw new TypeError("Intake question batches must contain two or three questions when available");

  const seen = new Set();
  const unresolved = [];
  for (const field of fields) {
    validateField(field);
    if (seen.has(field.field_id)) throw new TypeError(`Duplicate intake field: ${field.field_id}`);
    seen.add(field.field_id);
    if (!intersects(field.scope_ids, activeScopeIds) || field.status === "confirmed") continue;
    const scopes = pendingScopes(decisions, field, activeScopeIds);
    if (scopes === null || (relevantScopes(field.scope_ids, activeScopeIds).length > 0 && scopes.length === 0)) continue;
    unresolved.push({field, scopes});
  }

  const gaps = unresolved.map(({field, scopes}) => ({
    gap_id: stableId("gap", {projectId, fieldId: field.field_id, subjectHash: field.subject_hash, scopeIds: [...scopes].sort()}),
    description: field.prompt,
    impact: field.impact,
    owner: field.owner ?? null,
    scope_ids: [...scopes]
  }));
  const blockedScopeIds = [...new Set(gaps
    .filter(({impact}) => impact === "blocking")
    .flatMap(({scope_ids: scopes}) => {
      if (scopes.length === 0) return activeScopeIds.length === 0 ? ["project"] : activeScopeIds;
      return activeScopeIds.length === 0 ? scopes : scopes.filter((scope) => activeScopeIds.includes(scope));
    }))];
  const questions = unresolved.slice(0, batchSize).map(({field, scopes}) => ({
    field_id: field.field_id,
    prompt: field.prompt,
    reason: field.status,
    subject_hash: field.subject_hash,
    current_value: structuredClone(field.value ?? null),
    source_ids: [...(field.source_ids ?? [])],
    scope_ids: [...scopes]
  }));

  return {questions, gaps, blocked_scope_ids: blockedScopeIds, remaining_questions: Math.max(0, unresolved.length - questions.length)};
}

export function recordIntakeDecision(state, {fieldId, subjectHash, answer, scopeIds = [], source, recordedAt = new Date().toISOString()}) {
  assertValidState(state);
  if (typeof fieldId !== "string" || fieldId.length === 0) throw new TypeError("fieldId is required");
  if (typeof subjectHash !== "string" || !/^sha256:[a-f0-9]{64}$/.test(subjectHash)) throw new TypeError("subjectHash is required");
  if (answer === undefined) throw new TypeError("Intake answers cannot be undefined");
  if (!Array.isArray(scopeIds) || new Set(scopeIds).size !== scopeIds.length || scopeIds.some((scope) => typeof scope !== "string" || scope.length === 0)) throw new TypeError("scopeIds must contain unique non-empty strings");
  if (typeof source !== "string" || source.length === 0) throw new TypeError("Decision source is required");
  const next = structuredClone(state);
  const normalizedScopes = [...scopeIds].sort();
  const decisionId = stableId("decision", {projectId: state.project_id, fieldId, subjectHash, answer, scopeIds: normalizedScopes, recordedAt});
  next.decisions.push({
    decision_id: decisionId,
    topic: `intake:${fieldId}`,
    value: {answer: structuredClone(answer), status: "confirmed", subject_hash: subjectHash, scope_ids: normalizedScopes},
    source,
    recorded_at: recordedAt
  });
  next.events.push({
    event_id: randomUUID(),
    type: "intake.decision-recorded",
    recorded_at: recordedAt,
    details: {decision_id: decisionId, field_id: fieldId, subject_hash: subjectHash, scope_ids: normalizedScopes}
  });
  next.updated_at = recordedAt;
  if (next.engagement_phase === "discovered") next.engagement_phase = "interviewing";
  return assertValidState(next);
}

