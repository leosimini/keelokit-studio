import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";
import {contentHash} from "../src/core/ids.mjs";
import {reviewSubject} from "../src/agency/review.mjs";
import {selectRecipes} from "../src/agency/recipes.mjs";
import {createCreativeTreatment, assertCurrentCreativeTreatment, CreativeTreatmentError} from "../src/agency/creative-treatment.mjs";

const fixture = new URL("../fixtures/contracts/field-service/", import.meta.url);
const plan = JSON.parse(await readFile(new URL("content-plan.json", fixture)));
const audiences = JSON.parse(await readFile(new URL("audiences.json", fixture)));
const planSubject = reviewSubject({kind: "plan", scope: "plan-main", document: plan, audiences});
const recipes = selectRecipes({recipeIds: ["task-alternative-value-proof"], objective: "activation"}).map(({recipe_id, version, hash}) => ({recipe_id, version, hash}));
const candidate = {candidate_id: "candidate-test", piece_id: "piece-assign", channel: "help-center", recipes};
const strategyBody = {schema_version: 1, strategy_id: "strategy-test", project_id: plan.project_id, version: 1, source_plan: {plan_id: plan.plan_id, version: plan.version, subject_hash: planSubject.hash, scope: planSubject.scope}, candidates: [candidate]};
const strategy = {...strategyBody, content_hash: contentHash(strategyBody)};
const evidence = {project_id: plan.project_id, evidence: [{evidence_id: "ev-assign", availability: "available", allowed_claims: ["Assign urgent work from one board."], hashes: [`sha256:${"a".repeat(64)}`]}]};
const intent = {
  audience_tension: "Dispatchers need to assign urgent work without losing context.",
  hooks: [{key: "task", text: "Urgent work? Assign it from the board.", selected: true, rationale: "Names the audience task."}, {key: "category", text: "A better dispatch tool.", selected: false, rationale: "Too general to expose the mechanism."}],
  mechanism: "Show the assignment controls and action.", proof: "Show the verified saved assignment.", payoff: "The operator can see who owns the work.", cta: "Open the dispatch board",
  visual_approach: {concept: "Task and visible result", asset_intent: "Verified product capture", motion_intent: "Use restrained focus changes"},
  channel_format: {channel: "help-center", formats: ["16:9"], reasoning: "A readable walkthrough fits operators seeking help."}, recipe_bindings: recipes,
  risks: [{risk: "Small controls can become illegible", mitigation: "Crop the relevant control and verify at export size"}],
  claims: [{claim: "Assign urgent work from one board.", evidence_ids: ["ev-assign"], limitation: "Only the verified dispatcher journey is demonstrated."}],
  accessibility_intent: {captions: "Caption all narration", contrast: "Check text contrast", readability: "Hold essential copy long enough to read", reduced_motion: "Use cuts without required motion cues"},
  unresolved_gaps: [{gap: "No observed engagement data", impact: "Hook preference is a hypothesis", resolution: "Compare outcomes after publication"}]
};
function input() { return structuredClone({projectId: plan.project_id, version: 1, plan, audiences, planSubject, strategy, candidateId: candidate.candidate_id, treatment: intent, evidence}); }
function validate(value, args = input()) { return assertCurrentCreativeTreatment({...args, treatment: value}); }

test("generic treatment preserves explicit creative intent and stable identity without mutating inputs", () => {
  const args = input(); const before = structuredClone(args);
  const value = createCreativeTreatment(args);
  assert.deepEqual(args, before);
  assert.deepEqual(value.intent, intent);
  assert.equal(value.source_strategy.candidate_hash, contentHash(candidate));
  assert.equal(value.audience_hash, contentHash(audiences.audiences[0]));
  assert.equal(validate(value), value);
  const revised = createCreativeTreatment({...args, version: 2, treatment: {...intent, payoff: "A revised payoff"}});
  assert.equal(revised.treatment_id, value.treatment_id);
  assert.notEqual(revised.content_hash, value.content_hash);
});

test("rejects missing rationale, unresolved gaps, accessibility intent and unsupported creative claims", () => {
  for (const mutate of [
    (x) => delete x.treatment.hooks[1].rationale,
    (x) => x.treatment.hooks[1].selected = true,
    (x) => delete x.treatment.unresolved_gaps,
    (x) => delete x.treatment.accessibility_intent.reduced_motion,
    (x) => x.treatment.claims[0].claim = "Guaranteed ten times faster",
    (x) => x.treatment.claims[0].evidence_ids = [],
    (x) => x.treatment.channel_format.formats = ["9:16"],
    (x) => x.treatment.cta = "Buy now",
    (x) => x.treatment.recipe_bindings[0].version += 1
  ]) { const args = input(); mutate(args); assert.throws(() => createCreativeTreatment(args), CreativeTreatmentError); }
});

test("rejects stale plan, audience, strategy candidate, recipes, evidence and artifact hashes", () => {
  const value = createCreativeTreatment(input());
  for (const mutate of [
    (x) => x.plan.suites[0].pieces[0].message = "Changed message",
    (x) => x.audiences.audiences[0].jobs.push("Changed task"),
    (x) => x.planSubject.kind = "brief",
    (x) => { x.strategy.candidates[0].channel = "changed"; const {content_hash, ...body} = x.strategy; x.strategy.content_hash = contentHash(body); },
    (x) => { x.strategy.candidates[0].recipes[0].hash = `sha256:${"b".repeat(64)}`; const {content_hash, ...body} = x.strategy; x.strategy.content_hash = contentHash(body); },
    (x) => x.evidence.evidence[0].hashes = [`sha256:${"c".repeat(64)}`],
    (x) => x.evidence.evidence[0].availability = "disabled",
    (x) => x.strategy.source_plan.subject_hash = `sha256:${"d".repeat(64)}`
  ]) { const args = input(); mutate(args); assert.throws(() => validate(value, args)); }
  const altered = structuredClone(value); altered.intent.payoff = "Unrecorded edit";
  assert.throws(() => validate(altered), /stale or mismatched/);
  const currentArgs = input(); currentArgs.strategy.version += 1;
  const {content_hash, ...body} = currentArgs.strategy; currentArgs.strategy.content_hash = contentHash(body);
  assert.throws(() => validate(value, currentArgs), /stale or mismatched/);
});

test("empty risks, claims and gaps remain explicit rather than inferred", () => {
  const args = input(); args.treatment.risks = []; args.treatment.claims = []; args.treatment.unresolved_gaps = [];
  assert.deepEqual(createCreativeTreatment(args).evidence_bindings, []);
});
