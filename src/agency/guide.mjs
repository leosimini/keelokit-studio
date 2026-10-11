import Ajv2020 from "ajv/dist/2020.js";
import {readFile} from "node:fs/promises";
import {resolve} from "node:path";
import {stableId} from "../core/ids.mjs";
import {validateStoryboard} from "./storyboard.mjs";

const schema = JSON.parse(await readFile(resolve(import.meta.dirname, "../../schemas/v1/guide.schema.json"), "utf8"));
const validate = new Ajv2020({allErrors: true, strict: true}).compile(schema);

export class GuideError extends Error {}

export function createGuide({storyboard, context, version, title, manualReferences = [], gaps = []}) {
  validateStoryboard(storyboard, context);
  if (!Number.isInteger(version) || version < 1 || typeof title !== "string" || !title || !Array.isArray(manualReferences) || !Array.isArray(gaps)) throw new GuideError("Guide version, title, manual references and gaps are required");
  const refs = manualReferences.map((reference) => ({...structuredClone(reference), relationship: "reference-only"}));
  const sections = storyboard.scenes.map((scene) => ({section_id: stableId("guide-section", {storyboard_id: storyboard.storyboard_id, scene_id: scene.scene_id}), kind: scene.section, texts: [...new Set([scene.narration, scene.on_screen_text].filter(Boolean))], evidence_ids: [...new Set(scene.evidence_ids)], asset_ids: [...new Set(scene.asset_ids)]}));
  if (sections.some(({texts}) => texts.length === 0)) throw new GuideError("Every guide section requires supported storyboard text");
  if (storyboard.intent_type === "tutorial") for (const required of [...storyboard.preconditions, ...storyboard.steps]) if (!sections.some(({texts}) => texts.includes(required))) throw new GuideError(`Guide omits tutorial requirement ${required}`);
  const guide = {schema_version: 1, guide_id: stableId("guide", {project_id: storyboard.project_id, piece_id: storyboard.piece_id}), version, project_id: storyboard.project_id, piece_id: storyboard.piece_id, storyboard_id: storyboard.storyboard_id, storyboard_version: storyboard.version, title, audience_id: storyboard.audience_id, language: storyboard.language, sections, manual_references: refs, gaps: [...gaps]};
  if (!validate(guide)) throw new GuideError((validate.errors ?? []).map(({instancePath, message}) => `${instancePath}: ${message}`).join("; "));
  return guide;
}

export function renderGuideMarkdown(guide) {
  if (!validate(guide)) throw new GuideError("Guide does not satisfy its contract");
  const clean = (value) => String(value).replace(/[\r\n]+/g, " ").trim();
  const lines = [`# ${clean(guide.title)}`, "", `Audience: ${clean(guide.audience_id)}`, `Language: ${clean(guide.language)}`, ""];
  for (const section of guide.sections) lines.push(`## ${clean(section.kind)}`, "", ...section.texts.flatMap((text) => [clean(text), ""]), `Evidence: ${section.evidence_ids.map(clean).join(", ")}`, "");
  if (guide.manual_references.length) lines.push("## Existing manual references", "", ...guide.manual_references.map((ref) => `- ${clean(ref.path)} (${ref.source_id}, sha256:${ref.sha256})`), "");
  if (guide.gaps.length) lines.push("## Gaps", "", ...guide.gaps.map((gap) => `- ${clean(gap)}`), "");
  return lines.join("\n");
}
