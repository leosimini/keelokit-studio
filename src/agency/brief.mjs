import Ajv2020 from "ajv/dist/2020.js";
import {readFile} from "node:fs/promises";
import {resolve} from "node:path";
import {stableId} from "../core/ids.mjs";

const schemaRoot = resolve(import.meta.dirname, "../../schemas/v1");
const audienceSchema = JSON.parse(await readFile(resolve(schemaRoot, "audiences.schema.json"), "utf8"));
const briefSchema = JSON.parse(await readFile(resolve(schemaRoot, "brief.schema.json"), "utf8"));
const ajv = new Ajv2020({allErrors: true, strict: true});
const validateAudiences = ajv.compile(audienceSchema);
const validateBrief = ajv.compile(briefSchema);

export class BriefValidationError extends Error {
  constructor(errors) {
    super(errors.join("\n"));
    this.name = "BriefValidationError";
    this.errors = errors;
  }
}

function assertSchema(validate, value, label) {
  if (!validate(value)) throw new BriefValidationError((validate.errors ?? []).map((error) => `${label}${error.instancePath || "/"}: ${error.message}`));
}

function duplicates(values) {
  return [...new Set(values.filter((value, index) => values.indexOf(value) !== index))];
}

function semanticErrors(brief, audiences, knownSourceIds) {
  const errors = [];
  if (brief.project_id !== audiences.project_id) errors.push("brief: project_id must match audiences.json");
  const sourceIds = new Set(knownSourceIds);
  const audienceIdList = audiences.audiences.map(({audience_id}) => audience_id);
  for (const duplicate of duplicates(audienceIdList)) errors.push(`audiences.json: duplicate audience_id ${duplicate}`);
  const audienceById = new Map(audiences.audiences.map((audience) => [audience.audience_id, audience]));
  for (const audience of audiences.audiences) {
    for (const sourceId of audience.source_ids) if (!sourceIds.has(sourceId)) errors.push(`audiences.json: audience ${audience.audience_id} references unknown source ${sourceId}`);
  }
  const treatmentIds = brief.audience_treatments.map(({audience_id}) => audience_id);
  for (const duplicate of duplicates(treatmentIds)) errors.push(`brief.json: duplicate audience treatment ${duplicate}`);
  for (const audienceId of treatmentIds) {
    const audience = audienceById.get(audienceId);
    if (!audience) errors.push(`brief.json: unknown audience ${audienceId}`);
    else if (audience.confirmation_status === "rejected") errors.push(`brief.json: rejected audience ${audienceId} cannot be included`);
  }
  const treatedIds = new Set(treatmentIds);
  const languages = [brief.languages.primary, ...brief.languages.additional];
  if (brief.languages.additional.includes(brief.languages.primary)) errors.push("brief.json: the primary language cannot also be an additional language");
  for (const language of languages) if (!brief.messages.some((message) => message.language === language)) errors.push(`brief.json: language ${language} has no supported message`);
  for (const message of brief.messages) {
    if (!languages.includes(message.language)) errors.push(`brief.json: message language ${message.language} is not a brief language`);
    for (const audienceId of message.audience_ids) if (!treatedIds.has(audienceId)) errors.push(`brief.json: message references untreated audience ${audienceId}`);
    for (const sourceId of message.source_ids) if (!sourceIds.has(sourceId)) errors.push(`brief.json: message references unknown source ${sourceId}`);
  }
  return errors;
}

export function createAudienceMap({projectId, candidates}) {
  if (typeof projectId !== "string" || projectId.length === 0) throw new TypeError("projectId is required");
  if (!Array.isArray(candidates) || candidates.length === 0) throw new TypeError("At least one project-defined audience candidate is required");
  const keys = candidates.map(({key}) => key);
  if (keys.some((key) => typeof key !== "string" || key.length === 0) || duplicates(keys).length > 0) throw new TypeError("Audience candidate keys must be unique non-empty strings");
  const result = {
    schema_version: 1,
    project_id: projectId,
    audiences: candidates.map(({key, ...candidate}) => ({
      ...structuredClone(candidate),
      audience_id: stableId("audience", {projectId, key})
    }))
  };
  assertSchema(validateAudiences, result, "audiences.json");
  return result;
}

export function createBrief({projectId, version, audiences, knownSourceIds, objective, languages, audienceTreatments, messages, channels, visibility, ui, scope, budget, reviewers, successCriteria}) {
  assertSchema(validateAudiences, audiences, "audiences.json");
  if (!Array.isArray(knownSourceIds)) throw new TypeError("knownSourceIds must be an array");
  const brief = {
    schema_version: 1,
    project_id: projectId,
    brief_id: stableId("brief", {projectId}),
    version,
    objective,
    languages: structuredClone(languages),
    audience_treatments: structuredClone(audienceTreatments),
    messages: structuredClone(messages),
    channels: [...channels],
    visibility,
    ui: structuredClone(ui),
    scope: structuredClone(scope),
    budget: structuredClone(budget),
    reviewers: [...reviewers],
    success_criteria: [...successCriteria]
  };
  assertSchema(validateBrief, brief, "brief.json");

  const errors = semanticErrors(brief, audiences, knownSourceIds);
  if (errors.length > 0) throw new BriefValidationError(errors);
  return brief;
}

export function renderBriefMarkdown(brief, audiences, knownSourceIds) {
  assertSchema(validateBrief, brief, "brief.json");
  assertSchema(validateAudiences, audiences, "audiences.json");
  if (!Array.isArray(knownSourceIds)) throw new TypeError("knownSourceIds must be an array");
  const errors = semanticErrors(brief, audiences, knownSourceIds);
  if (errors.length > 0) throw new BriefValidationError(errors);
  const byId = new Map(audiences.audiences.map((audience) => [audience.audience_id, audience]));
  const inline = (value) => String(value).replace(/\s+/g, " ").trim();
  const lines = [
    `# Product marketing brief — v${brief.version}`,
    "",
    `Objective: ${inline(brief.objective)}`,
    `Languages: ${[brief.languages.primary, ...brief.languages.additional].map(inline).join(", ")} (primary first)`,
    `Channels: ${brief.channels.map(inline).join(", ")}`,
    `Visibility: ${inline(brief.visibility)}`,
    `UI: ${brief.ui.surfaces.map(inline).join(", ")} (${inline(brief.ui.build ?? "build unconfirmed")})`,
    `Budget: ${brief.budget.limit === null ? "unconfirmed" : `${inline(brief.budget.currency ?? "currency unconfirmed")} ${brief.budget.limit}`}`,
    `Reviewers: ${brief.reviewers.map(inline).join(", ")}`,
    "",
    "## Audiences"
  ];
  for (const treatment of brief.audience_treatments) {
    const audience = byId.get(treatment.audience_id);
    if (!audience) throw new BriefValidationError([`brief.json: unknown audience ${treatment.audience_id}`]);
    lines.push("", `### ${inline(audience.public_name)}`, `Audience status: ${audience.confirmation_status}`, `Jobs: ${audience.jobs.map(inline).join("; ")}`, `CTAs: ${audience.ctas.map(inline).join("; ")}`, `Tone: ${inline(treatment.tone.value ?? "not applicable")} (${treatment.tone.confirmation_status})`, `Voice: ${inline(treatment.voice.value ?? "not applicable")} (${treatment.voice.confirmation_status})`);
  }
  lines.push("", "## Supported messages");
  for (const message of brief.messages) {
    const names = message.audience_ids.map((audienceId) => inline(byId.get(audienceId).public_name));
    lines.push(`- ${inline(message.text)} [${inline(message.language)}; audiences: ${names.join(", ")}; sources: ${message.source_ids.map(inline).join(", ")}]`);
  }
  lines.push("", "## Scope", ...brief.scope.included.map((item) => `- Included: ${inline(item)}`), ...brief.scope.excluded.map((item) => `- Excluded: ${inline(item)}`), "", "## Success criteria", ...brief.success_criteria.map((item) => `- ${inline(item)}`), "");
  return lines.join("\n");
}

