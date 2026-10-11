import Ajv2020 from "ajv/dist/2020.js";
import {readFile} from "node:fs/promises";
import {resolve} from "node:path";
import {stableId} from "../core/ids.mjs";
import {assertValidState, hasCurrentApproval} from "../state/store.mjs";
import {createAssetInventory} from "../assets/inventory.mjs";
import {evaluateEvidenceRequest} from "./evidence.mjs";
import {reviewSubject} from "./review.mjs";
import {assertCurrentCreativeTreatment} from "./creative-treatment.mjs";

const schema = JSON.parse(await readFile(resolve(import.meta.dirname, "../../schemas/v1/storyboard.schema.json"), "utf8"));
const validate = new Ajv2020({allErrors: true, strict: true}).compile(schema);
const brandSchema = JSON.parse(await readFile(resolve(import.meta.dirname, "../../schemas/v1/brand.schema.json"), "utf8"));
const validateBrand = new Ajv2020({allErrors: true, strict: true}).compile(brandSchema);

export class StoryboardValidationError extends Error {
  constructor(errors) {
    super(errors.join("\n"));
    this.name = "StoryboardValidationError";
    this.errors = errors;
  }
}

function approvedPiece({plan, audiences, state, pieceId, subjectKey = "plan"}) {
  assertValidState(state);
  const persisted = state.versions[subjectKey];
  if (!persisted || state.project_id !== plan.project_id) throw new StoryboardValidationError(["Current plan subject is missing or belongs to another project"]);
  const subject = reviewSubject({kind: "plan", scope: persisted.scope, document: plan, audiences});
  if (["kind", "project_id", "scope", "version", "hash"].some((key) => subject[key] !== persisted[key]) ||
      !hasCurrentApproval(state, {kind: "plan", scope: subject.scope, subjectVersion: subject.version, subjectHash: subject.hash})) {
    throw new StoryboardValidationError(["Storyboard requires current approved plan and audiences"]);
  }
  const piece = plan.suites.flatMap(({pieces}) => pieces).find(({piece_id}) => piece_id === pieceId);
  if (!piece) throw new StoryboardValidationError([`Unknown approved piece ${pieceId}`]);
  return {piece, subject};
}

export function validateStoryboard(storyboard, context) {
  if (!validate(storyboard)) throw new StoryboardValidationError((validate.errors ?? []).map((error) => `storyboard.json${error.instancePath || "/"}: ${error.message}`));
  if (!Object.hasOwn(storyboard, "version")) throw new StoryboardValidationError(["Authoring requires a versioned storyboard; legacy fixtures are schema-only examples"]);
  const {piece, subject} = approvedPiece({...context, pieceId: storyboard.piece_id});
  const {plan, evidence, assets, brand} = context;
  const errors = [];
  const same = (actual, expected) => JSON.stringify(actual) === JSON.stringify(expected);
  const narrativeCopy = storyboard.narrative_copy ?? [];
  if (storyboard.treatment_hash !== undefined && storyboard.treatment_hash !== null) {
    try {
      assertCurrentCreativeTreatment({treatment: context.treatment, plan, audiences: context.audiences, planSubject: subject, strategy: context.strategy, evidence});
      const allowed = context.treatment.intent.hooks.filter(({selected}) => selected).map(({text}) => text);
      if (storyboard.treatment_hash !== context.treatment.content_hash || !same(narrativeCopy, allowed)) errors.push("Narrative copy must match the selected current treatment hook");
    } catch (error) { errors.push(`Creative treatment: ${error.message}`); }
  } else if (narrativeCopy.length) errors.push("Narrative copy requires a current bound creative treatment");
  if (!validateBrand(brand)) errors.push(...(validateBrand.errors ?? []).map((error) => `brand.json${error.instancePath || "/"}: ${error.message}`));
  for (const [key, expected] of Object.entries({project_id: plan.project_id, plan_id: plan.plan_id, plan_version: subject.version, plan_hash: subject.hash, plan_scope: subject.scope, audience_id: piece.audience_id, intention: piece.intention, message: piece.message, cta: piece.cta, language: piece.language, structure: piece.structure, evidence_ids: piece.evidence_ids})) {
    if (!same(storyboard[key], expected)) errors.push(`${key} must match approved piece or plan`);
  }
  if (piece.duration_seconds !== null && storyboard.duration_seconds !== piece.duration_seconds) errors.push("duration_seconds must match approved piece");
  if (new Set(storyboard.formats).size !== storyboard.formats.length || storyboard.formats.some((format) => !piece.formats.includes(format))) errors.push("formats must be unique approved piece formats");
  if (evidence.project_id !== plan.project_id || assets.project_id !== plan.project_id || brand?.project_id !== plan.project_id) errors.push("Evidence, assets and brand must share plan project_id");
  createAssetInventory({projectId: assets.project_id, assets: assets.assets});
  const assetById = new Map(assets.assets.map((asset) => [asset.asset_id, asset]));
  const selected = new Set(storyboard.evidence_ids);
  const checked = evaluateEvidenceRequest({document: evidence, evidenceIds: storyboard.evidence_ids, claims: storyboard.scenes.flatMap(({claims}) => claims), target: storyboard.evidence_target});
  for (const blocker of checked.blockers) errors.push(`Evidence ${blocker.evidence_id ?? "target"}: ${blocker.code}`);
  if (!checked.evidence.some(({allowed_claims}) => allowed_claims.includes(storyboard.message))) errors.push("Approved message requires a supported evidence claim");
  if (storyboard.evidence_target.locale !== storyboard.language) errors.push("Evidence locale must match storyboard language");
  if (piece.structure.includes("promise") && storyboard.intent_type !== "explainer") errors.push("Approved promise structure requires explainer intent_type");
  if (piece.structure.includes("step") && storyboard.intent_type !== "tutorial") errors.push("Approved step structure requires tutorial intent_type");
  const requiredPreconditions = piece.requirements.filter((requirement) => !requirement.startsWith("Storyboard exception: "));
  const expectedSteps = storyboard.evidence_ids.flatMap((id) => checked.evidence.find(({evidence_id}) => evidence_id === id)?.steps ?? []);
  if (storyboard.intent_type === "tutorial") {
    if (!same(storyboard.preconditions, requiredPreconditions)) errors.push("Tutorial must retain approved preconditions");
    if (!same(storyboard.steps, expectedSteps)) errors.push("Tutorial must retain all evidence steps in order");
    if (!same(storyboard.scenes.filter(({section}) => section === "step").map(({step}) => step), expectedSteps)) errors.push("Tutorial scenes must retain all steps in order");
    for (const precondition of requiredPreconditions) if (!storyboard.scenes.some(({section, narration, on_screen_text}) => section === "preconditions" && [narration, on_screen_text].includes(precondition))) errors.push(`Tutorial omits precondition ${precondition}`);
    if (!same(piece.structure, ["preconditions", "step", "cta"])) errors.push("Tutorial needs approved preconditions, step and CTA structure");
  } else if (storyboard.steps.length || storyboard.preconditions.length) errors.push("Only tutorial storyboards declare preconditions and steps");
  const sections = storyboard.scenes.map(({section}) => section);
  const runs = sections.filter((section, index) => index === 0 || sections[index - 1] !== section);
  if (!same(runs, piece.structure)) errors.push("Scene sections must follow approved structure");
  if (storyboard.intent_type === "explainer") {
    const normal = same(piece.structure, ["promise", "walkthrough", "cta"]) && ["promise", "walkthrough", "cta"].every((section) => sections.filter((value) => value === section).length === 1);
    const justification = storyboard.structure_justification;
    if (!normal && (!justification || !piece.requirements.includes(`Storyboard exception: ${justification}`))) errors.push("Explainer needs one promise, one walkthrough and one CTA or explicit approved justification");
    if (normal && justification !== null) errors.push("Normal explainer does not require structure justification");
    for (const scene of storyboard.scenes.filter(({section}) => ["promise", "walkthrough"].includes(section))) if (scene.claims.length === 0) errors.push(`Explainer ${scene.section} requires a supported claim`);
  } else if (storyboard.structure_justification !== null) errors.push("Structure justification is only for explainers");
  if (new Set(storyboard.scenes.map(({scene_id}) => scene_id)).size !== storyboard.scenes.length) errors.push("Scene IDs must be unique");
  let end = 0;
  for (const scene of storyboard.scenes) {
    if (scene.start_seconds !== end || scene.end_seconds <= scene.start_seconds || scene.end_seconds > storyboard.duration_seconds) errors.push(`Scene ${scene.scene_id} must form a contiguous positive timeline`);
    end = scene.end_seconds;
    if (!piece.structure.includes(scene.section)) errors.push(`Scene ${scene.scene_id} has unapproved section`);
    if (scene.section !== "step" && scene.step !== null) errors.push(`Scene ${scene.scene_id} only step sections may declare a step`);
    for (const id of scene.evidence_ids) if (!selected.has(id)) errors.push(`Scene ${scene.scene_id} references unknown or unselected evidence ${id}`);
    for (const claim of scene.claims) if (!scene.evidence_ids.includes(claim.evidence_id)) errors.push(`Scene ${scene.scene_id} claim evidence must be selected in the scene`);
    const allowedText = new Set([...scene.claims.map(({claim}) => claim), ...storyboard.preconditions, ...(scene.step === null ? [] : [scene.step]), storyboard.cta, ...narrativeCopy]);
    for (const text of [scene.narration, scene.on_screen_text]) if (text && !allowedText.has(text)) errors.push(`Scene ${scene.scene_id} contains unsupported text or claim: ${text}`);
    if (!scene.narration && !scene.on_screen_text) errors.push(`Scene ${scene.scene_id} needs narration or on-screen text`);
    if (scene.section === "step" && ![scene.narration, scene.on_screen_text].includes(scene.step)) errors.push(`Scene ${scene.scene_id} must communicate its step`);
    if (scene.section === "step" && !checked.evidence.some(({evidence_id, steps}) => scene.evidence_ids.includes(evidence_id) && steps.includes(scene.step))) errors.push(`Scene ${scene.scene_id} step requires matching scene evidence`);
    if (scene.section === "promise" && ![scene.narration, scene.on_screen_text].includes(storyboard.message)) errors.push(`Scene ${scene.scene_id} must communicate approved promise`);
    if (scene.section === "cta" && ![scene.narration, scene.on_screen_text].includes(storyboard.cta)) errors.push(`Scene ${scene.scene_id} must communicate approved CTA`);
    const visited = new Set();
    function checkAsset(id) {
      if (visited.has(id)) return;
      visited.add(id);
      const asset = assetById.get(id);
      if (!asset) { errors.push(`Scene ${scene.scene_id} references unknown asset ${id}`); return; }
      if (asset.status !== "valid" || asset.approval.status === "unapproved") errors.push(`Asset ${id} is unavailable or rejected`);
      if (asset.evidence_id && !scene.evidence_ids.includes(asset.evidence_id)) errors.push(`Asset ${id} evidence is incompatible with scene`);
      for (const dependency of asset.depends_on) {
        if (dependency.type === "asset") checkAsset(dependency.id);
        if (dependency.type === "evidence" && (!scene.evidence_ids.includes(dependency.id) || (dependency.sha256 !== null && !evidence.evidence.find(({evidence_id}) => evidence_id === dependency.id)?.hashes.includes(dependency.sha256)))) errors.push(`Asset ${id} evidence dependency is incompatible`);
        if (dependency.type === "brand" && dependency.id !== brand.brand_id) errors.push(`Asset ${id} brand dependency is incompatible`);
      }
    }
    for (const id of scene.asset_ids) checkAsset(id);
  }
  if (end !== storyboard.duration_seconds) errors.push("Scenes must cover storyboard duration");
  if (errors.length) throw new StoryboardValidationError(errors);
  return storyboard;
}

export function createStoryboard({plan, audiences, state, evidence, assets, brand, treatment = null, strategy = null, pieceId, version, intentType, fps, durationSeconds, formats, evidenceTarget, scenes, structureJustification = null, subjectKey = "plan"}) {
  const context = {plan, audiences, state, evidence, assets, brand, treatment, strategy, subjectKey};
  const {piece, subject} = approvedPiece({...context, pieceId});
  const selected = piece.evidence_ids.map((id) => evidence.evidence.find(({evidence_id}) => evidence_id === id)).filter(Boolean);
  const narrativeCopy = treatment?.intent?.hooks?.filter(({selected}) => selected).map(({text}) => text) ?? [];
  const storyboard = structuredClone({schema_version: 1, storyboard_id: stableId("storyboard", {projectId: plan.project_id, pieceId}), version, project_id: plan.project_id, plan_id: plan.plan_id, plan_version: plan.version, plan_hash: subject.hash, plan_scope: subject.scope, piece_id: pieceId, audience_id: piece.audience_id, intention: piece.intention, intent_type: intentType, message: piece.message, cta: piece.cta, structure: piece.structure, duration_seconds: durationSeconds ?? piece.duration_seconds, formats: formats ?? piece.formats, language: piece.language, fps, evidence_ids: piece.evidence_ids, evidence_target: evidenceTarget, preconditions: intentType === "tutorial" ? piece.requirements.filter((requirement) => !requirement.startsWith("Storyboard exception: ")) : [], steps: intentType === "tutorial" ? selected.flatMap(({steps}) => steps) : [], structure_justification: structureJustification, treatment_hash: treatment?.content_hash ?? null, narrative_copy: narrativeCopy, scenes});
  return validateStoryboard(storyboard, context);
}

export function renderStoryboardScriptMarkdown(storyboard, context) {
  validateStoryboard(storyboard, context);
  const inline = (value) => String(value).replace(/\s+/g, " ").trim();
  const lines = [
    `# Script — ${inline(storyboard.intention)}`,
    "",
    `Piece: ${storyboard.piece_id}`,
    `Storyboard: ${storyboard.storyboard_id} v${storyboard.version}`,
    `Audience: ${storyboard.audience_id}`,
    `Language: ${storyboard.language}`,
    `Duration: ${storyboard.duration_seconds} seconds`,
    `Formats: ${storyboard.formats.map(inline).join(", ")}`,
    `Status: draft bound to approved plan v${storyboard.plan_version}`,
    "",
    "## Core message",
    "",
    inline(storyboard.message),
    "",
    "## Complete narration",
    "",
    storyboard.scenes.map(({narration}) => inline(narration)).filter(Boolean).join(" "),
    "",
    "## Scene script"
  ];
  for (const scene of storyboard.scenes) {
    lines.push(
      "",
      `### ${inline(scene.section)} — ${scene.start_seconds}s–${scene.end_seconds}s`,
      "",
      `- Narration: ${inline(scene.narration || "None")}`,
      `- On-screen text: ${inline(scene.on_screen_text || "None")}`,
      `- Product step: ${inline(scene.step ?? "Not applicable")}`,
      `- Visual source: ${scene.asset_ids.length ? scene.asset_ids.map(inline).join(", ") : "No product asset selected; text-only composition"}`,
      `- Evidence: ${scene.evidence_ids.map(inline).join(", ")}`
    );
  }
  lines.push("", "## Call to action", "", inline(storyboard.cta), "");
  return lines.join("\n");
}
