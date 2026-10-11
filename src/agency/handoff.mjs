import {contentHash, stableId} from "../core/ids.mjs";

const roles = new Set(["content-strategist", "creative-director", "storyboard-director", "motion-director", "asset-producer", "editorial-critic"]);
const statuses = new Set(["ready", "blocked"]);
const sha = /^sha256:[a-f0-9]{64}$/;

export class AgencyHandoffError extends Error {}

function exactInstant(value) {
  return typeof value === "string" && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString() === value;
}

function artifact(value, label) {
  if (!value || typeof value.kind !== "string" || !value.kind.trim() || typeof value.id !== "string" || !value.id.trim() || !Number.isInteger(value.version) || value.version < 1 || !sha.test(value.hash)) throw new AgencyHandoffError(`${label} must identify an exact versioned artifact`);
  return {kind: value.kind, id: value.id, version: value.version, hash: value.hash};
}

export function createAgencyHandoff({projectId, fromRole, toRole, producer, runId, inputs, output, unresolvedIssues = [], status, recordedAt = new Date().toISOString()}) {
  if (typeof projectId !== "string" || !projectId.trim()) throw new AgencyHandoffError("projectId is required");
  if (!roles.has(fromRole) || !roles.has(toRole) || fromRole === toRole) throw new AgencyHandoffError("Handoff roles must be distinct supported specialists");
  if (typeof producer !== "string" || !producer.trim() || typeof runId !== "string" || !runId.trim()) throw new AgencyHandoffError("Producer and run identity are required");
  if (!Array.isArray(inputs) || inputs.length === 0) throw new AgencyHandoffError("At least one exact input artifact is required");
  const normalizedInputs = inputs.map((item) => artifact(item, "Input"));
  const inputKeys = normalizedInputs.map((item) => `${item.kind}:${item.id}:${item.version}`);
  if (new Set(inputKeys).size !== inputKeys.length) throw new AgencyHandoffError("Input artifacts must be unique");
  const normalizedOutput = artifact(output, "Output");
  if (!Array.isArray(unresolvedIssues) || unresolvedIssues.some((item) => typeof item !== "string" || !item.trim())) throw new AgencyHandoffError("Unresolved issues must be explicit strings");
  if (!statuses.has(status) || (status === "ready" && unresolvedIssues.length > 0) || (status === "blocked" && unresolvedIssues.length === 0)) throw new AgencyHandoffError("Handoff status must agree with unresolved issues");
  if (!exactInstant(recordedAt)) throw new AgencyHandoffError("recordedAt must be an exact ISO instant");
  const base = {schema_version: 1, project_id: projectId, from_role: fromRole, to_role: toRole, producer, run_id: runId, recorded_at: recordedAt, inputs: normalizedInputs, output: normalizedOutput, unresolved_issues: [...unresolvedIssues], status};
  return {...base, handoff_id: stableId("agency-handoff", base), content_hash: contentHash(base)};
}

export function assertAgencyHandoffCurrent(handoff, {projectId, inputs, output}) {
  const rebuilt = createAgencyHandoff({projectId: handoff?.project_id, fromRole: handoff?.from_role, toRole: handoff?.to_role, producer: handoff?.producer, runId: handoff?.run_id, inputs: handoff?.inputs, output: handoff?.output, unresolvedIssues: handoff?.unresolved_issues, status: handoff?.status, recordedAt: handoff?.recorded_at});
  if (handoff?.handoff_id !== rebuilt.handoff_id || handoff?.content_hash !== rebuilt.content_hash) throw new AgencyHandoffError("Handoff identity does not match its contents");
  if (handoff.project_id !== projectId) throw new AgencyHandoffError("Handoff belongs to another project");
  const currentInputs = inputs.map((item) => artifact(item, "Current input"));
  const currentOutput = artifact(output, "Current output");
  if (contentHash(currentInputs) !== contentHash(handoff.inputs) || contentHash(currentOutput) !== contentHash(handoff.output)) throw new AgencyHandoffError("Handoff is stale for the current artifacts");
  return handoff;
}
