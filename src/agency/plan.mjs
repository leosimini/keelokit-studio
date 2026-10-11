import {reviewSubject} from "./review.mjs";
import Ajv2020 from "ajv/dist/2020.js";
import {readFile} from "node:fs/promises";
import {resolve} from "node:path";
import {stableId} from "../core/ids.mjs";

const schemaRoot = resolve(import.meta.dirname, "../../schemas/v1");
const planSchema = JSON.parse(await readFile(resolve(schemaRoot, "content-plan.schema.json"), "utf8"));
const briefSchema = JSON.parse(await readFile(resolve(schemaRoot, "brief.schema.json"), "utf8"));
const audienceSchema = JSON.parse(await readFile(resolve(schemaRoot, "audiences.schema.json"), "utf8"));
const ajv = new Ajv2020({allErrors: true, strict: true});
const validatePlan = ajv.compile(planSchema);
const validateBrief = ajv.compile(briefSchema);
const validateAudiences = ajv.compile(audienceSchema);

export class PlanValidationError extends Error {
  constructor(errors) {
    super(errors.join("\n"));
    this.name = "PlanValidationError";
    this.errors = errors;
  }
}

function uniqueKeys(items, label) {
  const keys = items.map(({key}) => key);
  if (keys.some((key) => typeof key !== "string" || key.length === 0) || new Set(keys).size !== keys.length) throw new PlanValidationError([`${label} keys must be unique non-empty strings`]);
  return keys;
}

function schemaErrors(validate, value, label) {
  if (validate(value)) return [];
  return (validate.errors ?? []).map((error) => `${label}${error.instancePath || "/"}: ${error.message}`);
}

function cycleErrors(items, idKey, dependencyKey, label) {
  const byId = new Map(items.map((item) => [item[idKey], item]));
  const visiting = new Set();
  const visited = new Set();
  const errors = [];
  function visit(id, path) {
    if (visiting.has(id)) {
      errors.push(`${label} dependency cycle: ${[...path, id].join(" -> ")}`);
      return;
    }
    if (visited.has(id)) return;
    visiting.add(id);
    for (const dependency of byId.get(id)[dependencyKey]) visit(dependency, [...path, id]);
    visiting.delete(id);
    visited.add(id);
  }
  for (const id of byId.keys()) visit(id, []);
  return errors;
}

function effectivePlanCycleErrors(suites) {
  const dependencies = new Map();
  for (const suite of suites) {
    const suiteNode = `suite:${suite.suite_id}`;
    dependencies.set(suiteNode, [
      ...suite.dependencies.map((dependency) => `suite:${dependency}`),
      ...suite.pieces.map(({piece_id}) => `piece:${piece_id}`)
    ]);
    for (const piece of suite.pieces) {
      dependencies.set(`piece:${piece.piece_id}`, [
        ...piece.dependencies.map((dependency) => `piece:${dependency}`),
        ...suite.dependencies.map((dependency) => `suite:${dependency}`)
      ]);
    }
  }
  const nodes = [...dependencies].map(([id, nodeDependencies]) => ({id, dependencies: nodeDependencies}));
  return cycleErrors(nodes, "id", "dependencies", "Plan");
}

export function createContentPlan({projectId, version, brief, audiences, knownEvidenceIds, suiteCandidates, pending, outOfScope}) {
  const inputErrors = [...schemaErrors(validateBrief, brief, "brief.json"), ...schemaErrors(validateAudiences, audiences, "audiences.json")];
  if (inputErrors.length > 0) throw new PlanValidationError(inputErrors);
  if (brief.project_id !== projectId || audiences.project_id !== projectId) throw new PlanValidationError(["Plan, brief, and audiences must share project_id"]);
  if (!Array.isArray(knownEvidenceIds) || !Array.isArray(suiteCandidates) || suiteCandidates.length === 0) throw new TypeError("Known evidence and at least one suite candidate are required");
  if (!Array.isArray(pending) || !Array.isArray(outOfScope)) throw new TypeError("pending and outOfScope must be explicit arrays");
  uniqueKeys(suiteCandidates, "Suite");
  const pieceCandidates = suiteCandidates.flatMap(({pieces}) => {
    if (!Array.isArray(pieces) || pieces.length === 0) throw new PlanValidationError(["Every suite requires at least one proposed piece"]);
    return pieces;
  });
  uniqueKeys(pieceCandidates, "Piece");

  const suiteIds = new Map(suiteCandidates.map(({key}) => [key, stableId("suite", {projectId, key})]));
  const pieceIds = new Map(pieceCandidates.map(({key}) => [key, stableId("piece", {projectId, key})]));
  const unknownDependencies = [];
  const suites = suiteCandidates.map((suite) => ({
    suite_id: suiteIds.get(suite.key),
    objective: suite.objective,
    priority: suite.priority,
    dependencies: suite.dependencies.map((key) => {
      if (!suiteIds.has(key)) unknownDependencies.push(`unknown suite dependency ${key}`);
      return suiteIds.get(key) ?? key;
    }),
    budget: suite.budget,
    review_criteria: structuredClone(suite.review_criteria),
    pieces: suite.pieces.map((piece) => ({
      piece_id: pieceIds.get(piece.key),
      audience_id: piece.audience_id,
      intention: piece.intention,
      cta: piece.cta,
      message: piece.message,
      evidence_ids: [...piece.evidence_ids],
      evidence_requirements: [...piece.evidence_requirements],
      structure: [...piece.structure],
      duration_seconds: piece.duration_seconds,
      formats: [...piece.formats],
      language: piece.language,
      channels: [...piece.channels],
      order: piece.order,
      dependencies: piece.dependencies.map((key) => {
        if (!pieceIds.has(key)) unknownDependencies.push(`unknown piece dependency ${key}`);
        return pieceIds.get(key) ?? key;
      }),
      requirements: [...piece.requirements],
      review_criteria: [...piece.review_criteria],
      estimated_cost: piece.estimated_cost
    }))
  }));
  if (unknownDependencies.length > 0) throw new PlanValidationError(unknownDependencies);

  const plan = {schema_version: 1, project_id: projectId, plan_id: stableId("plan", {projectId}), version, source_brief: {version: brief.version, hash: reviewSubject({kind: "brief", scope: "brief", document: brief, audiences}).hash}, suites, pending: [...pending], out_of_scope: [...outOfScope]};
  if (!validatePlan(plan)) throw new PlanValidationError((validatePlan.errors ?? []).map((error) => `content-plan.json${error.instancePath || "/"}: ${error.message}`));

  const errors = [];
  const audienceIdList = audiences.audiences.map(({audience_id}) => audience_id);
  if (new Set(audienceIdList).size !== audienceIdList.length) errors.push("audiences.json: audience_id values must be unique");
  const audienceById = new Map(audiences.audiences.map((audience) => [audience.audience_id, audience]));
  const treatedAudienceIds = new Set(brief.audience_treatments.map(({audience_id}) => audience_id));
  const evidenceIds = new Set(knownEvidenceIds);
  const priorities = suites.map(({priority}) => priority);
  if (new Set(priorities).size !== priorities.length) errors.push("content-plan.json: suite priorities must be unique");
  for (const suite of suites) {
    const orders = suite.pieces.map(({order}) => order);
    if (new Set(orders).size !== orders.length) errors.push(`content-plan.json: piece order must be unique in suite ${suite.suite_id}`);
    for (const piece of suite.pieces) {
      const audience = audienceById.get(piece.audience_id);
      if (!audience) errors.push(`content-plan.json: unknown audience ${piece.audience_id}`);
      else if (audience.confirmation_status === "rejected") errors.push(`content-plan.json: rejected audience ${piece.audience_id}`);
      if (!treatedAudienceIds.has(piece.audience_id)) errors.push(`content-plan.json: audience ${piece.audience_id} is outside the brief`);
      const supportedMessage = brief.messages.some((message) => message.text === piece.message && message.audience_ids.includes(piece.audience_id));
      if (!supportedMessage) errors.push(`content-plan.json: unsupported message for audience ${piece.audience_id}`);
      for (const channel of piece.channels) if (!brief.channels.includes(channel)) errors.push(`content-plan.json: channel ${channel} is outside the brief`);
      for (const evidenceId of piece.evidence_ids) if (!evidenceIds.has(evidenceId)) errors.push(`content-plan.json: unknown evidence ${evidenceId}`);
    }
    const suiteKnownCost = suite.pieces.reduce((sum, piece) => sum + (piece.estimated_cost ?? 0), 0);
    if (suite.budget !== null && suiteKnownCost > suite.budget) errors.push(`content-plan.json: known cost ${suiteKnownCost} exceeds suite budget ${suite.budget}`);
  }
  if (!suites.some(({objective}) => objective === brief.objective)) errors.push(`content-plan.json: no suite serves brief objective ${brief.objective}`);
  errors.push(...cycleErrors(suites, "suite_id", "dependencies", "Suite"));
  errors.push(...cycleErrors(suites.flatMap(({pieces}) => pieces), "piece_id", "dependencies", "Piece"));
  errors.push(...effectivePlanCycleErrors(suites));
  const knownCost = suites.flatMap(({pieces}) => pieces).reduce((sum, piece) => sum + (piece.estimated_cost ?? 0), 0);
  if (brief.budget.limit !== null && knownCost > brief.budget.limit) errors.push(`content-plan.json: known cost ${knownCost} exceeds brief budget ${brief.budget.limit}`);
  if (errors.length > 0) throw new PlanValidationError(errors);
  return plan;
}

