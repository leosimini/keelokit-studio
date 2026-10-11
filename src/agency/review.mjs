import {randomUUID} from "node:crypto";
import Ajv2020 from "ajv/dist/2020.js";
import {readFile} from "node:fs/promises";
import {resolve} from "node:path";
import {contentHash, stableId} from "../core/ids.mjs";
import {addApproval, assertValidState, hasCurrentApproval} from "../state/store.mjs";
import {setCurrentSubject} from "../state/transitions.mjs";
import {renderBriefMarkdown} from "./brief.mjs";

const schemaRoot = resolve(import.meta.dirname, "../../schemas/v1");
const briefSchema = JSON.parse(await readFile(resolve(schemaRoot, "brief.schema.json"), "utf8"));
const planSchema = JSON.parse(await readFile(resolve(schemaRoot, "content-plan.schema.json"), "utf8"));
const audienceSchema = JSON.parse(await readFile(resolve(schemaRoot, "audiences.schema.json"), "utf8"));
const ajv = new Ajv2020({allErrors: true, strict: true});
const validators = {brief: ajv.compile(briefSchema), plan: ajv.compile(planSchema)};
const validateAudiences = ajv.compile(audienceSchema);

export class ReviewError extends Error {
  constructor(message) {
    super(message);
    this.name = "ReviewError";
  }
}

function validationErrors(validate, value, label) {
  if (validate(value)) return [];
  return (validate.errors ?? []).map((error) => `${label}${error.instancePath || "/"}: ${error.message}`);
}

function assertReviewInputs(kind, document, audiences) {
  const errors = [...validationErrors(validators[kind], document, `${kind}.json`), ...validationErrors(validateAudiences, audiences, "audiences.json")];
  if (document?.project_id !== audiences?.project_id) errors.push(`${kind} and audiences must share project_id`);
  const audienceIds = audiences?.audiences?.map(({audience_id}) => audience_id) ?? [];
  if (new Set(audienceIds).size !== audienceIds.length) errors.push("audiences.json: audience_id values must be unique");
  if (kind === "plan") {
    const known = new Set(audienceIds);
    for (const piece of document?.suites?.flatMap(({pieces}) => pieces) ?? []) if (!known.has(piece.audience_id)) errors.push(`plan.json: unknown audience ${piece.audience_id}`);
  }
  if (errors.length > 0) throw new ReviewError(errors.join("\n"));
}

function scopedAudiences(kind, document, audiences) {
  const referenced = new Set(kind === "brief"
    ? [...document.audience_treatments.map(({audience_id}) => audience_id), ...document.messages.flatMap(({audience_ids}) => audience_ids)]
    : document.suites.flatMap(({pieces}) => pieces.map(({audience_id}) => audience_id)));
  return {
    schema_version: audiences.schema_version,
    project_id: audiences.project_id,
    audiences: audiences.audiences.filter(({audience_id}) => referenced.has(audience_id)).toSorted((left, right) => left.audience_id.localeCompare(right.audience_id))
  };
}

export function reviewSubject({kind, scope, document, audiences}) {
  if (!["brief", "plan"].includes(kind)) throw new ReviewError("Review subject kind must be brief or plan");
  if (typeof scope !== "string" || scope.length === 0) throw new ReviewError("Review subject scope is required");
  assertReviewInputs(kind, document, audiences);
  const pieceIds = kind === "plan" ? document.suites.flatMap(({pieces}) => pieces.map(({piece_id}) => piece_id)) : [];
  if (new Set(pieceIds).size !== pieceIds.length) throw new ReviewError("Reviewed plan must contain unique piece IDs");
  return {kind, project_id: document.project_id, scope, version: document.version, hash: contentHash({document, audiences: scopedAudiences(kind, document, audiences)}), piece_ids: pieceIds};
}

export function setReviewSubject(state, subjectKey, subject, now) {
  if (typeof subjectKey !== "string" || subjectKey.length === 0) throw new ReviewError("subjectKey is required");
  if (subject.project_id !== state.project_id) throw new ReviewError("Review subject project_id must match engagement state");
  return setCurrentSubject(state, subjectKey, subject, now);
}

export function recordReviewOutcome(state, {kind, subjectKey, expectedSubject, outcome, confirmedBy, explicitMethod, comments = [], recordedAt = new Date().toISOString()}) {
  assertValidState(state);
  if (!["brief", "plan"].includes(kind)) throw new ReviewError("Review kind must be brief or plan");
  const subject = state.versions[subjectKey];
  if (!subject) throw new ReviewError(`Current review subject ${subjectKey} is missing`);
  if (subject.kind !== kind) throw new ReviewError(`Review kind ${kind} does not match subject kind ${subject.kind ?? "unknown"}`);
  if (!expectedSubject || ["kind", "project_id", "scope", "version", "hash"].some((key) => expectedSubject[key] !== subject[key])) throw new ReviewError("Review response does not match the currently persisted subject");
  if (!Array.isArray(comments) || comments.some((comment) => typeof comment !== "string" || comment.length === 0)) throw new ReviewError("Review comments must be non-empty strings");
  if (typeof confirmedBy !== "string" || confirmedBy.length === 0) throw new ReviewError("Explicit review requires confirmedBy");
  if (!["conversation", "file", "dashboard", "api"].includes(explicitMethod)) throw new ReviewError("Explicit review requires a supported method");
  if (outcome === "changes_requested") {
    if (comments.length === 0) throw new ReviewError("Requested changes require at least one comment");
    const revocationId = stableId("approval", {kind, subjectKey, scope: subject.scope, version: subject.version, hash: subject.hash, confirmedBy, explicitMethod, recordedAt, outcome});
    const next = addApproval(state, {approval_id: revocationId, kind, scope: subject.scope, confirmed_by: confirmedBy, confirmed_at: recordedAt, subject_version: subject.version, subject_hash: subject.hash, explicit_method: explicitMethod, status: "revoked"}, recordedAt);
    next.events.push({event_id: randomUUID(), type: "review.changes-requested", recorded_at: recordedAt, details: {kind, subject_key: subjectKey, scope: subject.scope, subject_version: subject.version, subject_hash: subject.hash, comments: [...comments]}});
    next.updated_at = recordedAt;
    return assertValidState(next);
  }
  if (outcome !== "approved") throw new ReviewError("Review outcome must be approved or changes_requested");
  const approvalId = stableId("approval", {kind, subjectKey, scope: subject.scope, version: subject.version, hash: subject.hash, confirmedBy, explicitMethod, recordedAt});
  return addApproval(state, {approval_id: approvalId, kind, scope: subject.scope, confirmed_by: confirmedBy, confirmed_at: recordedAt, subject_version: subject.version, subject_hash: subject.hash, explicit_method: explicitMethod, status: "approved"}, recordedAt);
}

export function renderPlanMarkdown(plan, audiences) {
  if (plan.project_id !== audiences.project_id) throw new ReviewError("Plan and audiences must share project_id");
  const byId = new Map(audiences.audiences.map((audience) => [audience.audience_id, audience]));
  const inline = (value) => String(value).replace(/\s+/g, " ").trim();
  const lines = [`# Production plan — v${plan.version}`, ""];
  for (const suite of [...plan.suites].sort((left, right) => left.priority - right.priority)) {
    lines.push(`## ${inline(suite.objective)} — priority ${suite.priority}`, `Suite ID: ${suite.suite_id}`, `Suite dependencies: ${suite.dependencies.length ? suite.dependencies.join(", ") : "none"}`, `Budget: ${suite.budget ?? "unconfirmed"}`, `Review: ${suite.review_criteria.map(inline).join("; ")}`, "");
    for (const piece of [...suite.pieces].sort((left, right) => left.order - right.order)) {
      const audience = byId.get(piece.audience_id);
      if (!audience) throw new ReviewError(`Unknown audience ${piece.audience_id}`);
      lines.push(`### ${piece.order}. ${inline(piece.intention)}`, `Piece ID: ${piece.piece_id}`, `Audience: ${inline(audience.public_name)} (${piece.audience_id})`, `Message: ${inline(piece.message)}`, `CTA: ${inline(piece.cta)}`, `Structure: ${piece.structure.map(inline).join(" → ")}`, `Duration: ${piece.duration_seconds ?? "unconfirmed"} seconds`, `Language: ${inline(piece.language)}`, `Formats: ${piece.formats.map(inline).join(", ")}`, `Channels: ${piece.channels.map(inline).join(", ")}`, `Piece dependencies: ${piece.dependencies.length ? piece.dependencies.join(", ") : "none"}`, `Requirements: ${piece.requirements.length ? piece.requirements.map(inline).join("; ") : "none"}`, `Evidence: ${piece.evidence_ids.length === 0 ? "pending" : piece.evidence_ids.join(", ")}`, `Evidence required: ${piece.evidence_requirements.map(inline).join("; ")}`, `Estimated cost: ${piece.estimated_cost ?? "unconfirmed"}`, `Review: ${piece.review_criteria.map(inline).join("; ")}`, "");
    }
  }
  lines.push("## Pending", ...(plan.pending.length ? plan.pending.map((item) => `- ${inline(item)}`) : ["- None"]), "", "## Out of scope", ...(plan.out_of_scope.length ? plan.out_of_scope.map((item) => `- ${inline(item)}`) : ["- None"]), "");
  return lines.join("\n");
}

export function renderReviewMarkdown({brief, plan, audiences, knownSourceIds, state, briefSubjectKey = "brief", planSubjectKey = "plan"}) {
  const briefSubject = state.versions[briefSubjectKey];
  const planSubject = state.versions[planSubjectKey];
  if (!briefSubject || !planSubject) throw new ReviewError("Brief and plan review subjects must be persisted before rendering review");
  if (briefSubject.kind !== "brief" || planSubject.kind !== "plan") throw new ReviewError("Persisted review subjects have incorrect kinds");
  assertReviewInputs("brief", brief, audiences);
  assertReviewInputs("plan", plan, audiences);
  const briefAudiences = scopedAudiences("brief", brief, audiences);
  const planAudiences = scopedAudiences("plan", plan, audiences);
  if (briefSubject.version !== brief.version || briefSubject.hash !== contentHash({document: brief, audiences: briefAudiences})) throw new ReviewError("Rendered brief does not match its persisted review subject");
  if (planSubject.version !== plan.version || planSubject.hash !== contentHash({document: plan, audiences: planAudiences})) throw new ReviewError("Rendered plan does not match its persisted review subject");
  const approvalLine = (kind, subject) => hasCurrentApproval(state, {kind, scope: subject.scope, subjectVersion: subject.version, subjectHash: subject.hash}) ? "approved" : "approval required";
  return [
    "# Keelokit Studio review",
    "",
    `Brief subject: v${briefSubject.version} ${briefSubject.hash} — ${approvalLine("brief", briefSubject)}`,
    `Plan subject: v${planSubject.version} ${planSubject.hash} — ${approvalLine("plan", planSubject)}`,
    "",
    renderBriefMarkdown(brief, briefAudiences, knownSourceIds),
    "",
    renderPlanMarkdown(plan, planAudiences)
  ].join("\n");
}

