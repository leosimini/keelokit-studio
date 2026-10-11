import {contentHash, stableId} from "../core/ids.mjs";
import {reviewSubject} from "./review.mjs";
import {selectRecipes} from "./recipes.mjs";

export class CreativeTreatmentError extends Error {
  constructor(message) { super(message); this.name = "CreativeTreatmentError"; }
}

function requireValue(condition, message) { if (!condition) throw new CreativeTreatmentError(message); }
function text(value, label) { requireValue(typeof value === "string" && value.trim().length > 0, `${label} is required`); }
function list(value, label) { requireValue(Array.isArray(value), `${label} must be an explicit array`); }
function strings(value, label) { list(value, label); for (const item of value) text(item, label); requireValue(new Set(value).size === value.length, `${label} must be unique`); }
function same(left, right, label) { requireValue(contentHash(left) === contentHash(right), `${label} is stale or mismatched`); }

function context({plan, audiences, planSubject, strategy, candidateId}) {
  requireValue(plan && audiences && planSubject && strategy, "Plan, audiences, exact plan subject and strategy are required");
  const current = reviewSubject({kind: "plan", scope: planSubject.scope, document: plan, audiences});
  same(planSubject, current, "Plan subject");
  const {content_hash: strategyHash, ...strategyBody} = strategy;
  requireValue(strategyHash === contentHash(strategyBody), "Strategy content hash is stale");
  requireValue(strategy.project_id === plan.project_id, "Strategy project is mismatched");
  const sourcePlan = {plan_id: plan.plan_id, version: plan.version, subject_hash: current.hash, scope: current.scope};
  same(strategy.source_plan, sourcePlan, "Strategy plan binding");
  const candidates = strategy.candidates.filter(({candidate_id}) => candidate_id === candidateId);
  requireValue(candidates.length === 1, "Exactly one current strategy candidate is required");
  const candidate = candidates[0];
  const suite = plan.suites.find(({pieces}) => pieces.some(({piece_id}) => piece_id === candidate.piece_id));
  const piece = suite?.pieces.find(({piece_id}) => piece_id === candidate.piece_id);
  requireValue(piece && piece.channels.includes(candidate.channel), "Candidate must bind a current planned piece and channel");
  const audience = audiences.audiences.find(({audience_id}) => audience_id === piece.audience_id);
  requireValue(audience && audience.confirmation_status !== "rejected", "A current non-rejected audience is required");
  const recipes = selectRecipes({recipeIds: candidate.recipes.map(({recipe_id}) => recipe_id), objective: suite.objective}).map(({recipe_id, version, hash}) => ({recipe_id, version, hash}));
  same(candidate.recipes, recipes, "Candidate recipe binding");
  return {piece, candidate, bindings: {
    source_plan: {plan_id: plan.plan_id, subject: current},
    source_strategy: {strategy_id: strategy.strategy_id, version: strategy.version, hash: strategyHash, candidate_id: candidate.candidate_id, candidate_hash: contentHash(candidate)},
    piece_id: piece.piece_id, piece_hash: contentHash(piece), audience_id: audience.audience_id, audience_hash: contentHash(audience)
  }};
}

function validateIntent(intent, {piece, candidate}, evidence) {
  requireValue(intent && typeof intent === "object" && !Array.isArray(intent), "treatment intent is required");
  for (const field of ["audience_tension", "mechanism", "proof", "payoff", "cta"]) text(intent[field], field);
  requireValue(intent.cta === piece.cta, "Treatment CTA must match the current planned CTA");
  list(intent.hooks, "hooks");
  requireValue(intent.hooks.length >= 2 && intent.hooks.filter(({selected}) => selected === true).length === 1, "Hooks require at least two options and exactly one selected option");
  for (const hook of intent.hooks) {
    for (const field of ["key", "text", "rationale"]) text(hook[field], `hook.${field}`);
    requireValue(typeof hook.selected === "boolean", "hook.selected must be boolean");
  }
  requireValue(new Set(intent.hooks.map(({key}) => key)).size === intent.hooks.length, "Hook keys must be unique");
  for (const field of ["concept", "asset_intent", "motion_intent"]) text(intent.visual_approach?.[field], `visual_approach.${field}`);
  const placement = intent.channel_format;
  requireValue(placement?.channel === candidate.channel, "Treatment channel must match the strategy candidate");
  strings(placement.formats, "channel_format.formats");
  requireValue(placement.formats.length > 0 && placement.formats.every((format) => piece.formats.includes(format)), "Treatment formats must be planned formats");
  text(placement.reasoning, "channel_format.reasoning");
  same(intent.recipe_bindings, candidate.recipes, "Treatment recipe binding");
  for (const [field, required] of [["risks", ["risk", "mitigation"]], ["unresolved_gaps", ["gap", "impact", "resolution"]]]) {
    list(intent[field], field);
    for (const item of intent[field]) for (const key of required) text(item[key], `${field}.${key}`);
  }
  for (const field of ["captions", "contrast", "readability", "reduced_motion"]) text(intent.accessibility_intent?.[field], `accessibility_intent.${field}`);
  list(evidence?.evidence, "evidence.evidence");
  requireValue(new Set(evidence.evidence.map(({evidence_id}) => evidence_id)).size === evidence.evidence.length, "Evidence IDs must be unique");
  const records = new Map(evidence.evidence.map((record) => [record.evidence_id, record]));
  list(intent.claims, "claims");
  const used = new Set();
  for (const claim of intent.claims) {
    text(claim.claim, "claim.claim"); text(claim.limitation, "claim.limitation"); strings(claim.evidence_ids, "claim.evidence_ids");
    requireValue(claim.evidence_ids.length > 0, "Claims require evidence; unsupported ideas belong in unresolved_gaps");
    for (const id of claim.evidence_ids) {
      const record = records.get(id);
      requireValue(piece.evidence_ids.includes(id) && record?.allowed_claims?.includes(claim.claim) && record.availability === "available", `Claim lacks current allowed evidence ${id}`);
      used.add(id);
    }
  }
  return [...used].sort().map((id) => ({evidence_id: id, hash: contentHash(records.get(id))}));
}

export function createCreativeTreatment({projectId, version, plan, audiences, planSubject, strategy, candidateId, treatment, evidence}) {
  requireValue(projectId === plan?.project_id && Number.isInteger(version) && version > 0, "Treatment requires matching project and positive version");
  requireValue(evidence?.project_id === projectId, "Evidence project must match treatment project");
  const current = context({plan, audiences, planSubject, strategy, candidateId});
  const evidenceBindings = validateIntent(treatment, current, evidence);
  const body = {schema_version: 1, treatment_id: stableId("treatment", {projectId, candidateId}), project_id: projectId, version, ...current.bindings, evidence_bindings: evidenceBindings, intent: structuredClone(treatment)};
  return {...body, content_hash: contentHash(body)};
}

export function assertCurrentCreativeTreatment({treatment, plan, audiences, planSubject, strategy, evidence}) {
  requireValue(treatment && treatment.schema_version === 1 && Number.isInteger(treatment.version) && treatment.version > 0, "A versioned creative treatment is required");
  const rebuilt = createCreativeTreatment({projectId: treatment.project_id, version: treatment.version, plan, audiences, planSubject, strategy, candidateId: treatment.source_strategy?.candidate_id, treatment: treatment.intent, evidence});
  same(treatment, rebuilt, "Creative treatment binding or content hash");
  return treatment;
}
