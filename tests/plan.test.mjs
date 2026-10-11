import assert from "node:assert/strict";
import test from "node:test";
import {createAudienceMap, createBrief} from "../src/agency/brief.mjs";
import {createContentPlan, localizePieces, PlanValidationError} from "../src/agency/plan.mjs";

const sourceIds = ["source-manual"];

function candidate(key, name, stage) {
  return {key, public_name: name, jobs: [`Do ${key}`], stage, vocabulary: [], objections: [], related_roles: [key], ctas: [`Act as ${key}`], source_ids: sourceIds, confirmation_status: "confirmed"};
}

function context(projectId, candidates, objective = "activation", budget = null, channels = ["owned-channel"], languages = {primary: "en-US", additional: []}) {
  const audiences = createAudienceMap({projectId, candidates});
  const brief = createBrief({projectId, version: 1, audiences, knownSourceIds: sourceIds, objective, languages, audienceTreatments: audiences.audiences.map(({audience_id}) => ({audience_id, tone: {value: "Clear", basis: "explicit", confirmation_status: "confirmed"}, voice: {value: null, basis: "none", confirmation_status: "not-applicable"}})), messages: [languages.primary, ...languages.additional].flatMap((language) => audiences.audiences.map(({audience_id}) => ({text: language === "en-US" ? "Supported message" : `Supported message (${language})`, language, audience_ids: [audience_id], source_ids: sourceIds}))), channels, visibility: "public", ui: {surfaces: ["web"], build: "build-1"}, scope: {included: ["primary journey"], excluded: []}, budget: {currency: budget === null ? null : "USD", limit: budget}, reviewers: ["owner"], successCriteria: ["Task is understood"]});
  return {audiences, brief};
}

function piece(key, audienceId, overrides = {}) {
  return {key, audience_id: audienceId, intention: `Explain ${key}`, cta: "Take action", message: "Supported message", evidence_ids: [], evidence_requirements: [`Verify ${key} journey`], structure: ["Context", "Journey", "CTA"], duration_seconds: 45, formats: ["16:9"], language: "en-US", channels: ["owned-channel"], order: 1, dependencies: [], requirements: [], review_criteria: ["Claim matches evidence"], estimated_cost: null, ...overrides};
}

test("plans vary by product objective, audience count, channel, and piece count", () => {
  const first = context("product-a", [candidate("member", "Members", "activation")]);
  const firstPlan = createContentPlan({projectId: "product-a", version: 1, ...first, knownEvidenceIds: [], suiteCandidates: [{key: "activate", objective: "activation", priority: 1, dependencies: [], budget: null, review_criteria: ["Activation path is clear"], pieces: [piece("guide", first.audiences.audiences[0].audience_id)]}], pending: ["Confirm final duration"], outOfScope: []});
  const second = context("product-b", [candidate("buyer", "Buyers", "evaluation"), candidate("operator", "Operators", "use")], "evaluation", null, ["sales-hub", "knowledge-base"]);
  const secondPlan = createContentPlan({projectId: "product-b", version: 1, ...second, knownEvidenceIds: [], suiteCandidates: [{key: "evaluate", objective: "evaluation", priority: 1, dependencies: [], budget: null, review_criteria: ["Decision criteria are clear"], pieces: [piece("overview", second.audiences.audiences[0].audience_id, {channels: ["sales-hub"]}), piece("workflow", second.audiences.audiences[1].audience_id, {order: 2, channels: ["knowledge-base"]})]}], pending: [], outOfScope: ["Paid distribution"]});
  assert.equal(firstPlan.suites[0].pieces.length, 1);
  assert.equal(secondPlan.suites[0].pieces.length, 2);
  assert.notDeepEqual(firstPlan.suites[0].pieces[0].channels, secondPlan.suites[0].pieces[0].channels);
  assert.deepEqual(secondPlan.out_of_scope, ["Paid distribution"]);
});

test("plan assigns stable IDs and resolves declared dependencies", () => {
  const ctx = context("product-a", [candidate("member", "Members", "activation")]);
  const audienceId = ctx.audiences.audiences[0].audience_id;
  const plan = createContentPlan({projectId: "product-a", version: 1, ...ctx, knownEvidenceIds: [], suiteCandidates: [{key: "activate", objective: "activation", priority: 1, dependencies: [], budget: null, review_criteria: ["Clear"], pieces: [piece("intro", audienceId), piece("followup", audienceId, {order: 2, dependencies: ["intro"]})]}], pending: [], outOfScope: []});
  assert.match(plan.plan_id, /^plan-[a-f0-9]{16}$/);
  assert.equal(plan.suites[0].pieces[1].dependencies[0], plan.suites[0].pieces[0].piece_id);
});

test("plan rejects unknown references, duplicate order, and budget overflow", () => {
  const ctx = context("product-a", [candidate("member", "Members", "activation")], "activation", 10);
  const audienceId = ctx.audiences.audiences[0].audience_id;
  const base = {projectId: "product-a", version: 1, ...ctx, knownEvidenceIds: [], pending: [], outOfScope: []};
  assert.throws(() => createContentPlan({...base, suiteCandidates: [{key: "suite", objective: "activation", priority: 1, dependencies: ["missing"], budget: null, review_criteria: ["Clear"], pieces: [piece("one", audienceId)]}]}), /unknown suite dependency/);
  assert.throws(() => createContentPlan({...base, suiteCandidates: [{key: "suite", objective: "activation", priority: 1, dependencies: [], budget: null, review_criteria: ["Clear"], pieces: [piece("one", audienceId), piece("two", audienceId)]}]}), /piece order must be unique/);
  assert.throws(() => createContentPlan({...base, suiteCandidates: [{key: "suite", objective: "activation", priority: 1, dependencies: [], budget: null, review_criteria: ["Clear"], pieces: [piece("one", audienceId, {estimated_cost: 11})]}]}), /exceeds brief budget/);
  assert.throws(() => createContentPlan({...base, suiteCandidates: [{key: "suite", objective: "activation", priority: 1, dependencies: [], budget: null, review_criteria: ["Clear"], pieces: [piece("one", "audience-unknown")]}]}), PlanValidationError);
  assert.throws(() => createContentPlan({...base, suiteCandidates: [{key: "suite", objective: "activation", priority: 1, dependencies: [], budget: 1, review_criteria: ["Clear"], pieces: [piece("one", audienceId, {estimated_cost: 2})]}]}), /exceeds suite budget/);
});

test("plan rejects dependency cycles and self-dependencies", () => {
  const ctx = context("product-a", [candidate("member", "Members", "activation")]);
  const audienceId = ctx.audiences.audiences[0].audience_id;
  const base = {projectId: "product-a", version: 1, ...ctx, knownEvidenceIds: [], pending: [], outOfScope: []};
  assert.throws(() => createContentPlan({...base, suiteCandidates: [{key: "suite", objective: "activation", priority: 1, dependencies: ["suite"], budget: null, review_criteria: ["Clear"], pieces: [piece("one", audienceId)]}]}), /Suite dependency cycle/);
  assert.throws(() => createContentPlan({...base, suiteCandidates: [{key: "suite", objective: "activation", priority: 1, dependencies: [], budget: null, review_criteria: ["Clear"], pieces: [piece("one", audienceId, {dependencies: ["two"]}), piece("two", audienceId, {order: 2, dependencies: ["one"]})]}]}), /Piece dependency cycle/);
  assert.throws(() => createContentPlan({...base, suiteCandidates: [
    {key: "first", objective: "activation", priority: 1, dependencies: ["second"], budget: null, review_criteria: ["Clear"], pieces: [piece("intro", audienceId)]},
    {key: "second", objective: "use", priority: 2, dependencies: [], budget: null, review_criteria: ["Clear"], pieces: [piece("followup", audienceId, {dependencies: ["intro"]})]}
  ]}), /Plan dependency cycle/);
});

test("plan enforces the brief audience, message, channels, and complete inputs", () => {
  const ctx = context("product-a", [candidate("member", "Members", "activation"), candidate("other", "Other", "use")]);
  const treatedId = ctx.audiences.audiences[0].audience_id;
  const untreatedId = ctx.audiences.audiences[1].audience_id;
  ctx.brief.audience_treatments.pop();
  ctx.brief.messages.pop();
  const base = {projectId: "product-a", version: 1, ...ctx, knownEvidenceIds: [], pending: [], outOfScope: []};
  const suite = (plannedPiece) => [{key: "suite", objective: "activation", priority: 1, dependencies: [], budget: null, review_criteria: ["Clear"], pieces: [plannedPiece]}];
  assert.throws(() => createContentPlan({...base, suiteCandidates: suite(piece("one", untreatedId))}), /outside the brief/);
  assert.throws(() => createContentPlan({...base, suiteCandidates: suite(piece("one", treatedId, {message: "Unsupported promise"}))}), /unsupported message/);
  assert.throws(() => createContentPlan({...base, suiteCandidates: suite(piece("one", treatedId, {channels: ["undeclared"]}))}), /outside the brief/);
  assert.throws(() => createContentPlan({...base, brief: {project_id: "product-a", budget: {limit: null}}, suiteCandidates: suite(piece("one", treatedId))}), /brief.json/);
  const missingCost = piece("one", treatedId);
  delete missingCost.estimated_cost;
  assert.throws(() => createContentPlan({...base, suiteCandidates: suite(missingCost)}), /estimated_cost/);
});


test("a plan records the exact brief it was built on", async () => {
  const {reviewSubject: subjectOf} = await import("../src/agency/review.mjs");
  const ctx = context("product-a", [candidate("member", "Members", "activation")]);
  const audienceId = ctx.audiences.audiences[0].audience_id;
  const built = createContentPlan({projectId: "product-a", version: 1, ...ctx, knownEvidenceIds: [], suiteCandidates: [{key: "activate", objective: "activation", priority: 1, dependencies: [], budget: null, review_criteria: ["Clear"], pieces: [piece("intro", audienceId)]}], pending: [], outOfScope: []});
  assert.equal(built.source_brief.hash, subjectOf({kind: "brief", scope: "any", document: ctx.brief, audiences: ctx.audiences}).hash);
  assert.equal(subjectOf({kind: "plan", scope: "plan-main", document: built, audiences: ctx.audiences}).brief_hash, built.source_brief.hash);
});

const suite = (pieces) => [{key: "activate", objective: "activation", priority: 1, dependencies: [], budget: null, review_criteria: ["Clear"], pieces}];
const build = (ctx, pieces) => createContentPlan({projectId: "product-a", version: 1, ...ctx, knownEvidenceIds: [], suiteCandidates: suite(pieces), pending: [], outOfScope: []});

test("pieces must use a brief language and a message written in that language", () => {
  const ctx = context("product-a", [candidate("member", "Members", "activation")]);
  const audienceId = ctx.audiences.audiences[0].audience_id;
  assert.throws(() => build(ctx, [piece("intro", audienceId, {language: "fr-FR"})]), /language fr-FR is outside the brief/);
  const bilingual = context("product-a", [candidate("member", "Members", "activation")], "activation", null, ["owned-channel"], {primary: "en-US", additional: ["es-AR"]});
  assert.throws(() => build(bilingual, [piece("intro", audienceId, {language: "es-AR"})]), /unsupported message/);
});

test("a multilingual brief requires every piece to be localized or explicitly excepted", () => {
  const ctx = context("product-a", [candidate("member", "Members", "activation")], "activation", null, ["owned-channel"], {primary: "en-US", additional: ["es-AR"]});
  const audienceId = ctx.audiences.audiences[0].audience_id;
  assert.throws(() => build(ctx, [piece("intro", audienceId)]), /intro.*not localized|is not localized/);
  assert.ok(build(ctx, [piece("intro", audienceId, {requirements: ["Localization exception: English-only launch note"]})]));
});

test("localizePieces expands each piece into one complete variant per language and remaps dependencies", () => {
  const ctx = context("product-a", [candidate("member", "Members", "activation")], "activation", null, ["owned-channel"], {primary: "en-US", additional: ["es-AR"]});
  const audienceId = ctx.audiences.audiences[0].audience_id;
  const base = [piece("intro", audienceId), piece("next", audienceId, {order: 2, dependencies: ["intro"]})];
  const variants = localizePieces(base, {
    "en-US": {},
    "es-AR": {intro: {message: "Supported message (es-AR)", intention: "Explicar intro", cta: "Actuar"}, next: {message: "Supported message (es-AR)", intention: "Explicar next", cta: "Actuar"}}
  });
  assert.deepEqual(variants.map(({key}) => key), ["intro.en-US", "next.en-US", "intro.es-AR", "next.es-AR"]);
  assert.deepEqual(variants.find(({key}) => key === "next.es-AR").dependencies, ["intro.es-AR"]);
  const plan = build(ctx, variants.map((variant, index) => ({...variant, order: index + 1})));
  const pieces = plan.suites[0].pieces;
  assert.equal(new Set(pieces.map(({piece_id}) => piece_id)).size, 4);
  const groups = Object.groupBy(pieces, ({localization_group}) => localization_group);
  assert.equal(Object.keys(groups).length, 2);
  for (const group of Object.values(groups)) assert.deepEqual(group.map(({language}) => language).sort(), ["en-US", "es-AR"]);
  assert.throws(() => build(ctx, variants.filter(({key}) => key !== "next.es-AR").map((variant, index) => ({...variant, order: index + 1}))), /missing es-AR/);
});
