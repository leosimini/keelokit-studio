import Ajv2020 from "ajv/dist/2020.js";
import {readFile} from "node:fs/promises";
import {resolve} from "node:path";
import {stableId} from "../core/ids.mjs";

const schema = JSON.parse(await readFile(resolve(import.meta.dirname, "../../schemas/v1/brand.schema.json"), "utf8"));
const validate = new Ajv2020({allErrors: true, strict: true}).compile(schema);

export class BrandValidationError extends Error {
  constructor(errors) {
    super(errors.join("\n"));
    this.name = "BrandValidationError";
    this.errors = errors;
  }
}

function duplicates(values) {
  return [...new Set(values.filter((value, index) => values.indexOf(value) !== index))];
}

function semanticErrors(brand, {knownSourceIds, knownAssetIds, knownAudienceIds}) {
  const errors = [];
  const sources = new Set(knownSourceIds);
  const assets = new Set(knownAssetIds);
  const audiences = new Set(knownAudienceIds);
  for (const sourceId of brand.source_ids) if (!sources.has(sourceId)) errors.push(`brand.json: unknown source ${sourceId}`);
  for (const color of brand.colors) for (const sourceId of color.source_ids) if (!sources.has(sourceId)) errors.push(`brand.json: color ${color.token} references unknown source ${sourceId}`);
  for (const font of brand.typography) for (const sourceId of font.source_ids) if (!sources.has(sourceId)) errors.push(`brand.json: font ${font.family} references unknown source ${sourceId}`);
  for (const logo of brand.logos) if (!assets.has(logo.asset_id)) errors.push(`brand.json: logo references unknown asset ${logo.asset_id}`);
  for (const font of brand.typography) if (font.asset_id !== null && !assets.has(font.asset_id)) errors.push(`brand.json: font references unknown asset ${font.asset_id}`);
  for (const treatment of brand.treatments) if (treatment.audience_id !== null && !audiences.has(treatment.audience_id)) errors.push(`brand.json: treatment references unknown audience ${treatment.audience_id}`);
  for (const duplicate of duplicates(brand.colors.map(({token}) => token))) errors.push(`brand.json: duplicate color token ${duplicate}`);
  for (const duplicate of duplicates(brand.logos.map(({role}) => role))) errors.push(`brand.json: duplicate logo role ${duplicate}`);
  return errors;
}

export function validateBrand(brand, references) {
  const errors = [];
  if (!validate(brand)) errors.push(...(validate.errors ?? []).map((error) => `brand.json${error.instancePath || "/"}: ${error.message}`));
  if (errors.length === 0) errors.push(...semanticErrors(brand, references));
  if (errors.length > 0) throw new BrandValidationError(errors);
  return brand;
}

export function createBrandProfile({
  projectId,
  version,
  confirmationStatus = "proposed",
  sourceIds,
  logos = [],
  colors = [],
  typography = [],
  video = {minimum_text_px: null, safe_area_horizontal: null, safe_area_vertical: null},
  motion = {guidance: null, reduced_motion: null},
  treatments = [],
  pronunciations = [],
  gaps = [],
  knownSourceIds,
  knownAssetIds = [],
  knownAudienceIds = []
}) {
  if (!Array.isArray(knownSourceIds)) throw new TypeError("knownSourceIds must be an array");
  const brand = {
    schema_version: 1,
    project_id: projectId,
    brand_id: stableId("brand", {projectId}),
    version,
    confirmation_status: confirmationStatus,
    source_ids: [...sourceIds],
    logos: structuredClone(logos),
    colors: structuredClone(colors),
    typography: structuredClone(typography),
    video: structuredClone(video),
    motion: structuredClone(motion),
    treatments: structuredClone(treatments),
    pronunciations: structuredClone(pronunciations),
    gaps: structuredClone(gaps)
  };
  return validateBrand(brand, {knownSourceIds, knownAssetIds, knownAudienceIds});
}

export function extractBrandCandidates(sources) {
  if (!Array.isArray(sources)) throw new TypeError("sources must be an array");
  const sourceIds = [];
  const colorsByToken = new Map();
  const fonts = new Map();
  for (const source of sources) {
    if (!source || typeof source.source_id !== "string" || source.source_id.length === 0) throw new TypeError("Each brand source needs a source_id");
    sourceIds.push(source.source_id);
    for (const color of source.colors ?? []) {
      if (!colorsByToken.has(color.token)) colorsByToken.set(color.token, []);
      colorsByToken.get(color.token).push({...color, source_id: source.source_id});
    }
    for (const font of source.typography ?? []) {
      const key = JSON.stringify([font.family, font.use, font.asset_id ?? null, font.license ?? null]);
      const current = fonts.get(key) ?? {...font, asset_id: font.asset_id ?? null, license: font.license ?? null, source_ids: []};
      current.source_ids.push(source.source_id);
      fonts.set(key, current);
    }
  }
  const colors = [];
  const gaps = [];
  for (const [token, observations] of colorsByToken) {
    const values = new Set(observations.map(({value}) => value));
    const uses = new Set(observations.map(({use}) => use));
    if (values.size > 1 || uses.size > 1) {
      gaps.push({field: `colors.${token}`, reason: "conflicting"});
      continue;
    }
    colors.push({token, value: observations[0].value, use: observations[0].use, source_ids: [...new Set(observations.map(({source_id}) => source_id))], confirmation_status: "unconfirmed"});
  }
  if (colors.length === 0 && !gaps.some(({field}) => field.startsWith("colors."))) gaps.push({field: "colors", reason: "missing"});
  if (fonts.size === 0) gaps.push({field: "typography", reason: "missing"});
  return {
    sourceIds: [...new Set(sourceIds)],
    colors,
    typography: [...fonts.values()].map((font) => ({...font, source_ids: [...new Set(font.source_ids)], confirmation_status: "unconfirmed"})),
    gaps
  };
}

function escapeHtml(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

function swatchStyle(value) {
  return /^#[0-9a-f]{3}(?:[0-9a-f]{3})?(?:[0-9a-f]{2})?$/i.test(value) ? ` style="background:${value}"` : "";
}

export function renderBrandReferenceHtml(brand, references) {
  validateBrand(brand, references);
  const sources = brand.source_ids.length === 0 ? "none" : brand.source_ids.map(escapeHtml).join(", ");
  const logos = brand.logos.length === 0
    ? '<p class="empty">No logos observed.</p>'
    : `<ul>${brand.logos.map((logo) => `<li>${escapeHtml(logo.role)} — asset <code>${escapeHtml(logo.asset_id)}</code></li>`).join("")}</ul>`;
  const colors = brand.colors.length === 0
    ? '<p class="empty">No color tokens observed.</p>'
    : `<div class="grid">${brand.colors.map((color) => `<article><span class="swatch"${swatchStyle(color.value)}></span><strong>${escapeHtml(color.token)}</strong><code>${escapeHtml(color.value)}</code><p>${escapeHtml(color.use)} — ${escapeHtml(color.confirmation_status)}</p><small>Sources: ${color.source_ids.map(escapeHtml).join(", ")}</small></article>`).join("")}</div>`;
  const typography = brand.typography.length === 0
    ? '<p class="empty">No typography observed.</p>'
    : `<ul>${brand.typography.map((font) => `<li><strong>${escapeHtml(font.family)}</strong> — ${escapeHtml(font.use)}; asset: ${escapeHtml(font.asset_id ?? "system/unprovided")}; license: ${escapeHtml(font.license ?? "unconfirmed")}; ${escapeHtml(font.confirmation_status)}; sources: ${font.source_ids.map(escapeHtml).join(", ")}</li>`).join("")}</ul>`;
  const treatments = brand.treatments.length === 0
    ? '<p class="empty">No audience or locale treatments observed.</p>'
    : `<ul>${brand.treatments.map((item) => `<li>${escapeHtml(item.locale)} / ${escapeHtml(item.audience_id ?? "shared")}: tone ${escapeHtml(item.tone ?? "unconfirmed")}; voice ${escapeHtml(item.voice_id ?? "unconfirmed")} / model ${escapeHtml(item.voice_model ?? "unconfirmed")} (${escapeHtml(item.confirmation_status)})</li>`).join("")}</ul>`;
  const pronunciations = brand.pronunciations.length === 0
    ? '<p class="empty">No pronunciations recorded.</p>'
    : `<ul>${brand.pronunciations.map((item) => `<li>${escapeHtml(item.term)} (${escapeHtml(item.locale)}): ${escapeHtml(item.guide)}</li>`).join("")}</ul>`;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Brand reference — ${escapeHtml(brand.project_id)}</title>
<style>body{font:16px/1.5 system-ui,sans-serif;max-width:960px;margin:auto;padding:2rem;color:#171717}header{border-bottom:1px solid #ccc}.status{padding:.5rem 1rem;background:#fff4ce}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:1rem}article{border:1px solid #ddd;border-radius:.5rem;padding:1rem}.swatch{display:block;height:5rem;border:1px solid #bbb;background:repeating-linear-gradient(45deg,#eee,#eee 8px,#fff 8px,#fff 16px)}code{display:block}.empty{color:#666}</style></head>
<body><header><h1>Brand reference</h1><p>Version ${brand.version}; brand ID: <code>${escapeHtml(brand.brand_id)}</code></p><p>Sources: ${sources}</p><p class="status">Status: ${escapeHtml(brand.confirmation_status)}. Extraction is not approval.</p></header>
<main><section><h2>Logos</h2>${logos}</section><section><h2>Colors</h2>${colors}</section><section><h2>Typography</h2>${typography}</section><section><h2>Audience and locale treatments</h2>${treatments}</section><section><h2>Pronunciations</h2>${pronunciations}</section>
<section><h2>Video constraints</h2><p>Minimum text: ${escapeHtml(brand.video.minimum_text_px ?? "unconfirmed")} px; horizontal safe area: ${escapeHtml(brand.video.safe_area_horizontal ?? "unconfirmed")}; vertical safe area: ${escapeHtml(brand.video.safe_area_vertical ?? "unconfirmed")}.</p></section>
<section><h2>Motion</h2><p>${escapeHtml(brand.motion.guidance ?? "Unconfirmed")}; reduced motion: ${escapeHtml(brand.motion.reduced_motion ?? "unconfirmed")}.</p></section>
<section><h2>Open gaps</h2>${brand.gaps.length === 0 ? '<p class="empty">None recorded.</p>' : `<ul>${brand.gaps.map((gap) => `<li>${escapeHtml(gap.field)}: ${escapeHtml(gap.reason)}</li>`).join("")}</ul>`}</section></main></body></html>`;
}
