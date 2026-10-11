import Ajv2020 from "ajv/dist/2020.js";
import {readFile} from "node:fs/promises";
import {resolve} from "node:path";
import {stableId} from "../core/ids.mjs";

const schema = JSON.parse(await readFile(resolve(import.meta.dirname, "../../schemas/v1/product-evidence.schema.json"), "utf8"));
const validate = new Ajv2020({allErrors: true, strict: true}).compile(schema);
const adapterCapabilities = new Map([
  ["playwright-web", {surface: "web", verifications: new Set(["live-capture", "configured-unavailable"])}],
  ["adb-android", {surface: "native", verifications: new Set(["live-capture", "configured-unavailable"])}],
  ["simctl-ios", {surface: "native", verifications: new Set(["screenshot-only", "configured-unavailable"])}],
  ["cli", {surface: "cli", verifications: new Set(["reproducible-request"])}],
  ["api", {surface: "api", verifications: new Set(["reproducible-request"])}],
  ["provided-material", {surface: "provided-material", verifications: new Set(["provenance-limited"])}]
]);

export class EvidenceValidationError extends Error {
  constructor(errors) {
    super(errors.join("\n"));
    this.name = "EvidenceValidationError";
    this.errors = errors;
  }
}

function duplicates(values) {
  return [...new Set(values.filter((value, index) => values.indexOf(value) !== index))];
}

export function validateEvidenceDocument(document) {
  const errors = [];
  if (!validate(document)) errors.push(...(validate.errors ?? []).map((error) => `product-evidence.json${error.instancePath || "/"}: ${error.message}`));
  if (errors.length === 0) {
    for (const duplicate of duplicates(document.evidence.map(({evidence_id}) => evidence_id))) errors.push(`product-evidence.json: duplicate evidence_id ${duplicate}`);
    for (const evidence of document.evidence) {
      const capability = adapterCapabilities.get(evidence.adapter);
      if (!capability) errors.push(`product-evidence.json: unknown evidence adapter ${evidence.adapter}`);
      else {
        if (capability.surface !== evidence.surface) errors.push(`product-evidence.json: adapter ${evidence.adapter} cannot verify ${evidence.surface}`);
        if (!capability.verifications.has(evidence.verification)) errors.push(`product-evidence.json: adapter ${evidence.adapter} cannot provide ${evidence.verification}`);
      }
    }
  }
  if (errors.length > 0) throw new EvidenceValidationError(errors);
  return document;
}

export function createEvidenceRecord({projectId, featureOrJourney, procedureHash, surface, adapter, verification, role, availability, flags = [], build, commit = null, locale, steps, result, capturePaths = [], hashes, allowedClaims = []}) {
  for (const [name, value] of [["flags", flags], ["steps", steps], ["capturePaths", capturePaths], ["hashes", hashes], ["allowedClaims", allowedClaims]]) {
    if (!Array.isArray(value)) throw new TypeError(`${name} must be an array`);
  }
  const record = {
    evidence_id: stableId("evidence", {projectId, featureOrJourney, procedureHash, surface, adapter, role, availability, build, commit, locale, flags: [...flags].sort(), result, hashes: [...hashes].sort()}),
    feature_or_journey: featureOrJourney,
    procedure_hash: procedureHash,
    surface,
    adapter,
    verification,
    role,
    availability,
    flags: [...flags],
    build,
    commit,
    locale,
    steps: [...steps],
    result,
    capture_paths: [...capturePaths],
    hashes: [...hashes],
    allowed_claims: [...allowedClaims]
  };
  validateEvidenceDocument({schema_version: 1, project_id: projectId, evidence: [record]});
  return record;
}

function addBlocker(blockers, evidenceId, code, expected, observed) {
  blockers.push({evidence_id: evidenceId, code, expected, observed});
}

export function evaluateEvidenceRequest({document, evidenceIds, claims = [], target}) {
  validateEvidenceDocument(document);
  if (!Array.isArray(evidenceIds) || evidenceIds.length === 0) throw new TypeError("evidenceIds must contain at least one selected evidence ID");
  if (evidenceIds.some((value) => typeof value !== "string" || value.length === 0)) throw new TypeError("evidenceIds must contain non-empty strings");
  if (!Array.isArray(claims)) throw new TypeError("claims must be an array");
  if (!target || typeof target !== "object") throw new TypeError("target is required");
  for (const field of ["feature_or_journey", "surface", "role", "build", "locale"]) if (typeof target[field] !== "string" || target[field].length === 0) throw new TypeError(`target.${field} is required`);
  if (!Array.isArray(target.flags)) throw new TypeError("target.flags must be an array");
  if (target.flags.some((value) => typeof value !== "string" || value.length === 0) || new Set(target.flags).size !== target.flags.length) throw new TypeError("target.flags must contain unique non-empty strings");
  if (!["available", "disabled", "failed", "unknown"].includes(target.availability)) throw new TypeError("target.availability is invalid");
  for (const request of claims) {
    if (!request || typeof request.claim !== "string" || request.claim.length === 0 || typeof request.evidence_id !== "string" || request.evidence_id.length === 0) throw new TypeError("Each claim needs non-empty claim and evidence_id strings");
  }
  const selectedIds = [...new Set(evidenceIds)];
  const byId = new Map(document.evidence.map((evidence) => [evidence.evidence_id, evidence]));
  const selected = [];
  const blockers = [];
  if (target.availability !== "available") addBlocker(blockers, null, "target_unavailable", "available", target.availability);

  for (const evidenceId of selectedIds) {
    const evidence = byId.get(evidenceId);
    if (!evidence) {
      addBlocker(blockers, evidenceId, "unknown_evidence", "existing evidence ID", null);
      continue;
    }
    selected.push(evidence);
    if (evidence.availability !== "available") addBlocker(blockers, evidenceId, "feature_unavailable", "available", evidence.availability);
    for (const [field, code] of [["feature_or_journey", "journey_mismatch"], ["surface", "surface_mismatch"], ["role", "role_mismatch"], ["build", "build_mismatch"], ["locale", "locale_mismatch"]]) {
      if (target[field] !== evidence[field]) addBlocker(blockers, evidenceId, code, target[field], evidence[field]);
    }
    if (Object.hasOwn(target, "commit") && target.commit !== evidence.commit) addBlocker(blockers, evidenceId, "commit_mismatch", target.commit, evidence.commit);
    const expectedFlags = [...new Set(target.flags)].sort();
    const observedFlags = [...evidence.flags].sort();
    if (JSON.stringify(expectedFlags) !== JSON.stringify(observedFlags)) addBlocker(blockers, evidenceId, "flag_mismatch", expectedFlags, observedFlags);
  }

  for (const request of claims) {
    const evidence = byId.get(request.evidence_id);
    if (!selectedIds.includes(request.evidence_id)) addBlocker(blockers, request.evidence_id, "evidence_not_selected", "selected evidence ID", request.evidence_id);
    else if (evidence && !evidence.allowed_claims.includes(request.claim)) addBlocker(blockers, request.evidence_id, "claim_not_allowed", request.claim, evidence.allowed_claims);
  }

  return blockers.length === 0
    ? {status: "ready", evidence: structuredClone(selected), claims: structuredClone(claims), blockers: []}
    : {status: "blocked", evidence: structuredClone(selected), claims: [], blockers: structuredClone(blockers)};
}
