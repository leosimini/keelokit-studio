import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";
import {createStoryboard, renderStoryboardScriptMarkdown, validateStoryboard, StoryboardValidationError} from "../src/agency/storyboard.mjs";
import {createInitialState} from "../src/state/store.mjs";
import {reviewSubject, setReviewSubject, recordReviewOutcome} from "../src/agency/review.mjs";
import {createGuide, renderGuideMarkdown} from "../src/agency/guide.mjs";

const load = async (name) => JSON.parse(await readFile(new URL(`../fixtures/contracts/field-service/${name}.json`, import.meta.url), "utf8"));
const templates = Object.fromEntries(await Promise.all(["audiences", "content-plan", "brand", "assets", "product-evidence"].map(async (name) => [name, await load(name)])));

function setup(intentType = "explainer", options = {}) {
  const {audiences, brand, assets} = structuredClone(templates);
  const plan = structuredClone(templates["content-plan"]);
  const evidence = structuredClone(templates["product-evidence"]);
  const piece = plan.suites[0].pieces[0];
  const record = evidence.evidence[0];
  if (options.language) record.locale = options.language;
  Object.assign(piece, {intention: intentType === "tutorial" ? "Teach first assignment" : "Explain assignment", message: record.allowed_claims[0], language: record.locale, duration_seconds: options.duration ?? 24, formats: options.formats ?? ["16:9"], structure: intentType === "tutorial" ? ["preconditions", "step", "cta"] : ["promise", "walkthrough", "cta"], requirements: intentType === "tutorial" ? ["Signed-in dispatcher"] : []});
  if (options.exception) piece.requirements = [`Storyboard exception: ${options.exception}`];
  let state = createInitialState(plan.project_id);
  state = setReviewSubject(state, "plan", reviewSubject({kind: "plan", scope: "plan-main", document: plan, audiences}));
  state = recordReviewOutcome(state, {kind: "plan", subjectKey: "plan", expectedSubject: state.versions.plan, outcome: "approved", confirmedBy: "owner", explicitMethod: "conversation"});
  const sections = intentType === "tutorial" ? ["preconditions", ...record.steps.map(() => "step"), "cta"] : options.exception ? ["promise", "walkthrough", "walkthrough", "cta"] : piece.structure;
  let stepIndex = 0;
  const scenes = sections.map((section, index) => {
    const step = section === "step" ? record.steps[stepIndex++] : null;
    const text = section === "preconditions" ? piece.requirements[0] : section === "cta" ? piece.cta : step ?? piece.message;
    return {scene_id: `scene-${index + 1}`, section, step, start_seconds: index * piece.duration_seconds / sections.length, end_seconds: (index + 1) * piece.duration_seconds / sections.length, narration: text, on_screen_text: "", evidence_ids: [record.evidence_id], asset_ids: [assets.assets[0].asset_id], claims: ["promise", "walkthrough"].includes(section) ? [{claim: text, evidence_id: record.evidence_id}] : []};
  });
  const context = {plan, audiences, state, evidence, assets, brand};
  const input = {...context, pieceId: piece.piece_id, version: 1, intentType, fps: 30, scenes, structureJustification: options.exception ?? null, evidenceTarget: Object.fromEntries(["feature_or_journey", "surface", "role", "build", "locale", "flags", "availability"].map((key) => [key, record[key]]))};
  return {context, input};
}

test("authors versioned explainer and tutorial with distinct approved structures", () => {
  for (const kind of ["explainer", "tutorial"]) {
    const {context, input} = setup(kind);
    const storyboard = createStoryboard(input);
    assert.equal(validateStoryboard(storyboard, context), storyboard);
    assert.match(storyboard.storyboard_id, /^storyboard-[a-f0-9]{16}$/);
    assert.equal(storyboard.plan_version, context.plan.version);
    assert.equal(storyboard.message, context.plan.suites[0].pieces[0].message);
    assert.equal(storyboard.intent_type, kind);
    assert.deepEqual(storyboard.steps, kind === "tutorial" ? context.evidence.evidence[0].steps : []);
    assert.equal(createStoryboard({...input, version: 2}).storyboard_id, storyboard.storyboard_id);
  }
});

test("renders a readable evidence-bound production script", () => {
  const {context, input} = setup("explainer");
  const storyboard = createStoryboard(input);
  const markdown = renderStoryboardScriptMarkdown(storyboard, context);
  assert.match(markdown, /^# Script — Explain assignment/m);
  assert.match(markdown, /## Complete narration/);
  assert.match(markdown, /### promise — 0s–8s/);
  assert.match(markdown, /Visual source: capture-assign/);
  assert.match(markdown, new RegExp(storyboard.evidence_ids[0]));
  const changed = structuredClone(storyboard);
  changed.scenes[0].narration = "Unsupported promise";
  assert.throws(() => renderStoryboardScriptMarkdown(changed, context), /unsupported text or claim/);
});

test("accepts approved alternatives without a fixed duration or format", () => {
  for (const options of [{duration: 12, formats: ["9:16"], language: "es-AR"}, {duration: 90, formats: ["16:9", "1:1"], language: "en-US"}]) {
    const {input} = setup("explainer", options);
    const storyboard = createStoryboard(input);
    assert.equal(storyboard.duration_seconds, options.duration);
    assert.deepEqual(storyboard.formats, options.formats);
    assert.equal(storyboard.language, options.language);
  }
  const {input, context} = setup();
  const storyboard = createStoryboard(input);
  assert.throws(() => validateStoryboard({...storyboard, formats: ["unapproved"]}, context), /approved piece formats/);
  assert.throws(() => validateStoryboard({...storyboard, duration_seconds: 60}, context), /duration_seconds must match/);
});

test("blocks missing, stale, revoked and audience-modified approval", () => {
  for (const mutate of [(ctx) => { ctx.state.approvals = []; }, (ctx) => { ctx.plan.version++; }, (ctx) => { ctx.state.approvals[0].status = "revoked"; }, (ctx) => { ctx.audiences.audiences[0].public_name = "Changed"; }]) {
    const {input, context} = setup();
    mutate(context);
    assert.throws(() => createStoryboard(input), /current approved plan/);
  }
  const {input} = setup();
  assert.throws(() => createStoryboard({...input, pieceId: "missing"}), /Unknown approved piece/);
});

test("rejects unknown, unavailable and incompatible evidence or assets", () => {
  for (const [mutate, expected] of [
    [(ctx, sb) => { sb.scenes[0].evidence_ids = ["missing"]; }, /unknown or unselected evidence/],
    [(ctx, sb) => { sb.scenes[0].asset_ids = ["missing"]; }, /unknown asset/],
    [(ctx) => { ctx.evidence.evidence[0].availability = "disabled"; ctx.evidence.evidence[0].allowed_claims = []; }, /feature_unavailable/],
    [(ctx, sb) => { sb.evidence_target.build = "other"; }, /build_mismatch/],
    [(ctx) => { ctx.assets.assets[0].status = "stale"; }, /unavailable/],
    [(ctx) => { ctx.assets.assets[0].evidence_id = "other"; }, /incompatible/],
    [(ctx) => { ctx.assets.assets[0].depends_on[0].sha256 = "a".repeat(64); }, /dependency is incompatible/]
  ]) {
    const {input, context} = setup();
    const storyboard = createStoryboard(input);
    mutate(context, storyboard);
    assert.throws(() => validateStoryboard(storyboard, context), expected);
  }
});

test("rejects unsupported claims including undeclared narration", () => {
  const {input, context} = setup();
  const storyboard = createStoryboard(input);
  const unsupported = structuredClone(storyboard);
  unsupported.scenes[1].claims[0].claim = "Completes every assignment instantly";
  unsupported.scenes[1].narration = unsupported.scenes[1].claims[0].claim;
  assert.throws(() => validateStoryboard(unsupported, context), /claim_not_allowed/);
  const hidden = structuredClone(storyboard);
  hidden.scenes[1].on_screen_text = "Completes every assignment instantly";
  assert.throws(() => validateStoryboard(hidden, context), /unsupported text or claim/);
});

test("tutorial retains preconditions and every supported step in order", () => {
  const {input, context} = setup("tutorial");
  const storyboard = createStoryboard(input);
  for (const mutate of [(sb) => sb.steps.pop(), (sb) => sb.preconditions.pop(), (sb) => { sb.scenes[1].step = sb.scenes[2].step; }, (sb) => { sb.scenes[0].narration = sb.cta; }, (sb) => { sb.intent_type = "custom"; }]) {
    const changed = structuredClone(storyboard);
    mutate(changed);
    assert.throws(() => validateStoryboard(changed, context), /retain|precondition|requires tutorial/);
  }
});

test("explainer departures require a justification in the approved plan", () => {
  const {input, context} = setup("explainer", {exception: "Compare two approved approaches"});
  const storyboard = createStoryboard(input);
  assert.equal(storyboard.scenes.length, 4);
  assert.throws(() => validateStoryboard({...storyboard, structure_justification: null}, context), /explicit approved justification/);
  assert.throws(() => validateStoryboard({...storyboard, structure_justification: "Unreviewed reason"}, context), /explicit approved justification/);
});

test("rejects invalid timing, duplicate scene IDs and missing authoring fields", () => {
  const {input, context} = setup();
  const storyboard = createStoryboard(input);
  for (const mutate of [(sb) => { sb.scenes[1].start_seconds++; }, (sb) => { sb.scenes[1].scene_id = sb.scenes[0].scene_id; }, (sb) => { delete sb.language; }]) {
    const changed = structuredClone(storyboard);
    mutate(changed);
    assert.throws(() => validateStoryboard(changed, context), StoryboardValidationError);
  }
});

test("derives a cited guide from the same approved tutorial evidence without overwriting manuals", () => {
  const {input, context} = setup("tutorial");
  const storyboard = createStoryboard(input);
  const guide = createGuide({storyboard, context, version: 1, title: "Assignment tutorial", manualReferences: [{source_id: "manual-one", path: "docs/manual.md", sha256: "a".repeat(64)}], gaps: ["Owner review remains pending"]});
  assert.deepEqual(guide.sections.filter(({kind}) => kind === "step").map(({texts}) => texts[0]), storyboard.steps);
  assert.equal(guide.manual_references[0].relationship, "reference-only");
  assert.match(renderGuideMarkdown(guide), /Evidence:/);
  assert.throws(() => createGuide({storyboard: {...storyboard, scenes: storyboard.scenes.slice(0, -2).concat(storyboard.scenes.at(-1))}, context, version: 1, title: "Incomplete"}), /timeline|retain|cover/);
});
