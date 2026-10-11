import Ajv2020 from "ajv/dist/2020.js";
import {execFile} from "node:child_process";
import {createHash} from "node:crypto";
import {constants} from "node:fs";
import {access, mkdtemp, readFile, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {resolve} from "node:path";
import {promisify} from "node:util";
import {createAssetInventory} from "../assets/inventory.mjs";
import {stableId} from "../core/ids.mjs";

const [brandSchema, storyboardSchema, evidenceSchema] = await Promise.all([
  readFile(resolve(import.meta.dirname, "../../schemas/v1/brand.schema.json"), "utf8").then(JSON.parse),
  readFile(resolve(import.meta.dirname, "../../schemas/v1/storyboard.schema.json"), "utf8").then(JSON.parse),
  readFile(resolve(import.meta.dirname, "../../schemas/v1/product-evidence.schema.json"), "utf8").then(JSON.parse)
]);
const ajv = new Ajv2020({allErrors: true, strict: true});
const validateBrand = ajv.compile(brandSchema);
const validateStoryboard = ajv.compile(storyboardSchema);
const validateEvidence = ajv.compile(evidenceSchema);
const components = new Set(["title", "browser", "phone", "feature", "result", "end"]);
const hex = /^#[a-fA-F0-9]{6}$/;
const dataUrl = /^data:([a-zA-Z0-9.+-]+\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/]*={0,2})$/;
const execFileAsync = promisify(execFile);

export class RenderAdapterError extends Error {
  constructor(message, code = "invalid_render_input") {
    super(message);
    this.name = "RenderAdapterError";
    this.code = code;
  }
}

function errors(label, validation) {
  return (validation.errors ?? []).map((error) => `${label}${error.instancePath || "/"}: ${error.message}`).join("\n");
}

function validateTheme(theme) {
  if (!theme || typeof theme !== "object" || Array.isArray(theme)) throw new RenderAdapterError("renderConfig.theme must be explicit");
  const allowedFields = new Set(["background", "foreground", "accent", "surface", "subtitle_background", "font_family", "font_source", "title_px", "body_px", "subtitle_px", "safe_padding"]);
  if (Object.keys(theme).some((field) => !allowedFields.has(field))) throw new RenderAdapterError("renderConfig.theme contains unsupported fields");
  for (const field of ["background", "foreground", "accent", "surface", "subtitle_background"]) if (!hex.test(theme[field])) throw new RenderAdapterError(`renderConfig.theme.${field} must be an explicit six-digit hex color`);
  if (typeof theme.font_family !== "string" || theme.font_family.length === 0) throw new RenderAdapterError("renderConfig.theme.font_family must be explicit");
  if (!theme.font_source || !["system", "brand-asset"].includes(theme.font_source.type)) throw new RenderAdapterError("renderConfig.theme.font_source must identify a system or brand-asset font");
  if (Object.keys(theme.font_source).length !== 2 || !Object.hasOwn(theme.font_source, "asset_id")) throw new RenderAdapterError("renderConfig.theme.font_source must contain only type and asset_id");
  if (theme.font_source.type === "system" && theme.font_source.asset_id !== null) throw new RenderAdapterError("A system font source must have a null asset_id");
  if (theme.font_source.type === "brand-asset" && (typeof theme.font_source.asset_id !== "string" || theme.font_source.asset_id.length === 0)) throw new RenderAdapterError("A brand-asset font source requires an asset_id");
  for (const field of ["title_px", "body_px", "subtitle_px", "safe_padding"]) if (!Number.isInteger(theme[field]) || theme[field] < 1) throw new RenderAdapterError(`renderConfig.theme.${field} must be a positive integer`);
  return {background: theme.background, foreground: theme.foreground, accent: theme.accent, surface: theme.surface, subtitle_background: theme.subtitle_background, font_family: theme.font_family, font_source: structuredClone(theme.font_source), title_px: theme.title_px, body_px: theme.body_px, subtitle_px: theme.subtitle_px, safe_padding: theme.safe_padding};
}

function verifiedDataSources(inventory, assetSources) {
  if (!assetSources || typeof assetSources !== "object" || Array.isArray(assetSources)) throw new RenderAdapterError("assetSources must map asset IDs to data URLs");
  const sources = Object.create(null);
  const mediaTypes = Object.create(null);
  const known = new Set(inventory.assets.map(({asset_id}) => asset_id));
  const visualTypes = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
  const fontTypes = new Set(["font/woff", "font/woff2", "font/ttf", "font/otf", "application/font-woff", "application/x-font-ttf", "application/vnd.ms-fontobject"]);
  for (const assetId of Object.keys(assetSources)) if (!known.has(assetId)) throw new RenderAdapterError(`Asset source ${assetId} is not present in the inventory`);
  for (const asset of inventory.assets) {
    if (!Object.hasOwn(assetSources, asset.asset_id)) continue;
    const match = dataUrl.exec(assetSources[asset.asset_id]);
    if (!match) throw new RenderAdapterError(`Asset source ${asset.asset_id} must be an embedded base64 data URL`);
    const allowed = asset.kind === "font" ? fontTypes : visualTypes;
    if (!allowed.has(match[1])) throw new RenderAdapterError(`Asset source ${asset.asset_id} has unsupported media type ${match[1]}`);
    const bytes = Buffer.from(match[2], "base64");
    if (createHash("sha256").update(bytes).digest("hex") !== asset.sha256) throw new RenderAdapterError(`Asset source ${asset.asset_id} does not match its inventory hash`);
    sources[asset.asset_id] = assetSources[asset.asset_id];
    mediaTypes[asset.asset_id] = match[1];
  }
  return {sources, mediaTypes};
}

function optionalSceneMap(name, value, sceneIds, validateValue) {
  const map = value ?? {};
  if (!map || typeof map !== "object" || Array.isArray(map)) throw new RenderAdapterError(`renderConfig.${name} must be an object`);
  for (const [sceneId, entry] of Object.entries(map)) {
    if (!sceneIds.includes(sceneId)) throw new RenderAdapterError(`renderConfig.${name} references unknown scene ${sceneId}`);
    if (!validateValue(entry)) throw new RenderAdapterError(`renderConfig.${name}.${sceneId} is invalid`);
  }
  return structuredClone(map);
}

export async function remotionRenderCapability({browserExecutable}) {
  if (typeof browserExecutable !== "string" || browserExecutable.length === 0) return {status: "blocked", adapter: "remotion", version: "4.0.534", reason: "An explicit Chromium-compatible browser executable is required", licensing: "Remotion licensing eligibility must be confirmed by the installing organization"};
  try {
    await access(browserExecutable, constants.X_OK);
    const version = await execFileAsync(browserExecutable, ["--version"], {timeout: 5000, maxBuffer: 1024 * 1024});
    if (!/Chrom(?:e|ium)/i.test(`${version.stdout}\n${version.stderr}`)) throw new Error("Not a Chromium-compatible browser");
    return {status: "available", adapter: "remotion", version: "4.0.534", browser_executable: browserExecutable, outputs: ["png-preview"], licensing: "Remotion licensing eligibility must be confirmed by the installing organization"};
  } catch {
    return {status: "blocked", adapter: "remotion", version: "4.0.534", reason: "Configured browser executable is unavailable", licensing: "Remotion licensing eligibility must be confirmed by the installing organization"};
  }
}

export function prepareRemotionRender({storyboard, brand, assets, evidence, assetSources, renderConfig}) {
  if (!validateStoryboard(storyboard)) throw new RenderAdapterError(errors("storyboard.json", validateStoryboard));
  if (!validateBrand(brand)) throw new RenderAdapterError(errors("brand.json", validateBrand));
  if (!assets || assets.schema_version !== 1) throw new RenderAdapterError("assets.json must be a versioned asset inventory");
  const inventory = createAssetInventory({projectId: assets.project_id, assets: assets.assets});
  if (!validateEvidence(evidence)) throw new RenderAdapterError(errors("product-evidence.json", validateEvidence));
  if (storyboard.project_id !== brand.project_id || storyboard.project_id !== inventory.project_id || storyboard.project_id !== evidence.project_id) throw new RenderAdapterError("Storyboard, brand, assets, and evidence must belong to the same project");
  const evidenceIds = evidence.evidence.map(({evidence_id}) => evidence_id);
  const evidenceSet = new Set(evidenceIds);
  const evidenceById = new Map(evidence.evidence.map((record) => [record.evidence_id, record]));
  if (evidenceSet.size !== evidenceIds.length) throw new RenderAdapterError("product-evidence.json must have unique evidence_id values");
  if (!renderConfig || !Number.isInteger(renderConfig.width) || !Number.isInteger(renderConfig.height) || renderConfig.width < 2 || renderConfig.height < 2 || renderConfig.width % 2 || renderConfig.height % 2) throw new RenderAdapterError("renderConfig requires explicit positive even width and height");
  const theme = validateTheme(renderConfig.theme);
  const {sources: sourceMap, mediaTypes} = verifiedDataSources(inventory, assetSources);
  const assetsById = new Map(inventory.assets.map((asset) => [asset.asset_id, asset]));
  const sceneIds = storyboard.scenes.map(({scene_id}) => scene_id);
  if (new Set(sceneIds).size !== sceneIds.length) throw new RenderAdapterError("Storyboard scene_id values must be unique");
  const orderedScenes = [...storyboard.scenes].sort((left, right) => left.start_seconds - right.start_seconds);
  for (let index = 0; index < orderedScenes.length; index += 1) {
    const scene = orderedScenes[index];
    if (scene.end_seconds <= scene.start_seconds || scene.end_seconds > storyboard.duration_seconds) throw new RenderAdapterError(`Scene ${scene.scene_id} has invalid timeline bounds`);
    if (index > 0 && scene.start_seconds < orderedScenes[index - 1].end_seconds) throw new RenderAdapterError(`Scene ${scene.scene_id} overlaps ${orderedScenes[index - 1].scene_id}`);
    if (new Set(scene.asset_ids).size !== scene.asset_ids.length || new Set(scene.evidence_ids).size !== scene.evidence_ids.length) throw new RenderAdapterError(`Scene ${scene.scene_id} must not duplicate asset or evidence references`);
  }
  const sceneComponents = renderConfig.scene_components;
  if (!sceneComponents || typeof sceneComponents !== "object" || Array.isArray(sceneComponents)) throw new RenderAdapterError("renderConfig.scene_components must select a component for every scene");
  if (Object.keys(sceneComponents).length !== sceneIds.length || Object.keys(sceneComponents).some((id) => !sceneIds.includes(id))) throw new RenderAdapterError("renderConfig.scene_components must match the storyboard scenes exactly");
  const subtitles = optionalSceneMap("subtitles", renderConfig.subtitles, sceneIds, (value) => typeof value === "string");
  const stepLabels = optionalSceneMap("step_labels", renderConfig.step_labels, sceneIds, (value) => value === null || typeof value === "string");
  const highlights = optionalSceneMap("highlights", renderConfig.highlights, sceneIds, (value) => value === null || (value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === 2 && Number.isFinite(value.x) && value.x >= 0 && value.x <= 100 && Number.isFinite(value.y) && value.y >= 0 && value.y <= 100));
  const scenes = storyboard.scenes.map((scene) => {
    const component = sceneComponents[scene.scene_id];
    if (!components.has(component)) throw new RenderAdapterError(`Scene ${scene.scene_id} requires a supported component selection`);
    for (const evidenceId of scene.evidence_ids) if (!evidenceSet.has(evidenceId)) throw new RenderAdapterError(`Scene ${scene.scene_id} references unknown evidence ${evidenceId}`);
    for (const assetId of scene.asset_ids) {
      if (!assetsById.has(assetId)) throw new RenderAdapterError(`Scene ${scene.scene_id} references unknown asset ${assetId}`);
      if (!Object.hasOwn(sourceMap, assetId)) throw new RenderAdapterError(`Scene ${scene.scene_id} asset ${assetId} has no hash-verified render source`);
      const evidenceId = assetsById.get(assetId).evidence_id;
      if (["browser", "phone", "feature"].includes(component) && evidenceId === null) throw new RenderAdapterError(`Scene ${scene.scene_id} product asset ${assetId} requires direct evidence linkage`);
      if (evidenceId !== null) {
        if (!scene.evidence_ids.includes(evidenceId)) throw new RenderAdapterError(`Scene ${scene.scene_id} asset ${assetId} is not linked to its evidence ${evidenceId}`);
        const record = evidenceById.get(evidenceId);
        const asset = assetsById.get(assetId);
        if (!record?.hashes.includes(`sha256:${asset.sha256}`)) throw new RenderAdapterError(`Scene ${scene.scene_id} asset ${assetId} bytes are not bound to evidence ${evidenceId}`);
        if (!record.capture_paths.includes(asset.path) && !record.capture_paths.includes(asset.origin.source)) throw new RenderAdapterError(`Scene ${scene.scene_id} asset ${assetId} path is not bound to evidence ${evidenceId}`);
      }
    }
    if (["browser", "phone"].includes(component) && scene.asset_ids.length === 0) throw new RenderAdapterError(`${component} scene ${scene.scene_id} requires a supplied product asset`);
    return {
      ...structuredClone(scene),
      component,
      from_frame: Math.round(scene.start_seconds * storyboard.fps),
      duration_frames: Math.round(scene.end_seconds * storyboard.fps) - Math.round(scene.start_seconds * storyboard.fps),
      subtitle: Object.hasOwn(subtitles, scene.scene_id) ? subtitles[scene.scene_id] : "",
      step_label: Object.hasOwn(stepLabels, scene.scene_id) ? stepLabels[scene.scene_id] : null,
      highlight: Object.hasOwn(highlights, scene.scene_id) ? highlights[scene.scene_id] : null
    };
  });
  if (scenes.some(({duration_frames}) => duration_frames < 1)) throw new RenderAdapterError("Every scene must occupy at least one frame");
  const logoId = renderConfig.logo_asset_id ?? null;
  if (logoId !== null && (!assetsById.has(logoId) || !Object.hasOwn(sourceMap, logoId))) throw new RenderAdapterError("Configured logo must reference a hash-verified asset");
  if (logoId !== null && !brand.logos.some(({asset_id}) => asset_id === logoId)) throw new RenderAdapterError("Configured logo must be declared by the brand record");
  const fontAssetId = theme.font_source.type === "brand-asset" ? theme.font_source.asset_id : null;
  if (fontAssetId !== null && (!brand.typography.some(({asset_id: id, family}) => id === fontAssetId && family === theme.font_family) || !assetsById.has(fontAssetId) || !Object.hasOwn(sourceMap, fontAssetId))) throw new RenderAdapterError("Configured brand font must match brand typography and a hash-verified asset");
  if (fontAssetId !== null && !/^data:(?:font\/(?:woff2?|ttf|otf)|application\/(?:font-woff|x-font-ttf|vnd\.ms-fontobject));base64,/.test(sourceMap[fontAssetId])) throw new RenderAdapterError("Configured brand font asset must use a supported embedded font media type");
  const renderTheme = fontAssetId === null ? theme : {...theme, font_family: "KeelokitStudioPinnedFont", font_src: sourceMap[fontAssetId]};
  const durationInFrames = Math.round(storyboard.duration_seconds * storyboard.fps);
  if (durationInFrames < 1) throw new RenderAdapterError("Storyboard duration must occupy at least one frame");
  const inputProps = {width: renderConfig.width, height: renderConfig.height, fps: storyboard.fps, duration_in_frames: durationInFrames, theme: renderTheme, scenes, asset_sources: sourceMap, logo_src: logoId === null ? null : sourceMap[logoId]};
  const selectedAssetIds = [...new Set(storyboard.scenes.flatMap(({asset_ids}) => asset_ids).concat(logoId ?? [], fontAssetId ?? []))].sort();
  for (const assetId of selectedAssetIds) {
    for (const dependency of assetsById.get(assetId).depends_on) {
      if (dependency.type === "evidence" && !evidenceSet.has(dependency.id)) throw new RenderAdapterError(`Asset ${assetId} references unknown evidence dependency ${dependency.id}`);
      if (dependency.type === "brand" && dependency.id !== brand.brand_id) throw new RenderAdapterError(`Asset ${assetId} references unknown brand dependency ${dependency.id}`);
    }
  }
  const assetHashes = selectedAssetIds.map((id) => `${id}:${assetsById.get(id).sha256}:${mediaTypes[id]}`);
  const assetRecordHashes = selectedAssetIds.map((id) => `${id}:${stableId("asset-record", assetsById.get(id))}`);
  const assetStates = selectedAssetIds.map((id) => ({asset_id: id, status: assetsById.get(id).status, approval: structuredClone(assetsById.get(id).approval)}));
  if (assetStates.some(({status}) => status !== "valid")) throw new RenderAdapterError("Stale assets cannot enter a new render");
  const selectedEvidence = [...new Set(storyboard.scenes.flatMap(({evidence_ids}) => evidence_ids))].sort();
  const evidenceHashes = selectedEvidence.map((id) => `${id}:${stableId("evidence-record", evidenceById.get(id))}`);
  const brandHash = stableId("brand-record", brand);
  const manifest = {
    schema_version: 1,
    project_id: storyboard.project_id,
    piece_id: storyboard.piece_id,
    adapter: "remotion",
    engine_version: "4.0.534",
    render_id: stableId("render", {storyboard, brand, assetHashes, assetRecordHashes, evidenceHashes, renderConfig}),
    brand: {brand_id: brand.brand_id, version: brand.version, confirmation_status: brand.confirmation_status, record_hash: brandHash},
    assets: assetHashes,
    asset_record_hashes: assetRecordHashes,
    asset_states: assetStates,
    evidence_ids: selectedEvidence,
    evidence_hashes: evidenceHashes,
    configuration: {width: renderConfig.width, height: renderConfig.height, fps: storyboard.fps, duration_in_frames: inputProps.duration_in_frames},
    qa_status: "not-reviewed"
  };
  return {inputProps, manifest};
}

export async function renderRemotionPreview(options) {
  const capability = await remotionRenderCapability({browserExecutable: options.browserExecutable});
  if (capability.status !== "available") throw new RenderAdapterError(capability.reason, "render_capability_unavailable");
  const prepared = prepareRemotionRender(options);
  const bundleDirectory = await mkdtemp(resolve(tmpdir(), "keelokit-studio-remotion-"));
  try {
    const [{bundle}, {renderStill, selectComposition}] = await Promise.all([import("@remotion/bundler"), import("@remotion/renderer")]);
    const serveUrl = await bundle({entryPoint: resolve(import.meta.dirname, "entry.mjs"), outDir: bundleDirectory, logLevel: "error"});
    const composition = await selectComposition({serveUrl, id: "KeelokitStudioPiece", inputProps: prepared.inputProps, browserExecutable: options.browserExecutable, logLevel: "error"});
    const result = await renderStill({serveUrl, composition, inputProps: prepared.inputProps, browserExecutable: options.browserExecutable, imageFormat: "png", output: null, logLevel: "error"});
    if (!result.buffer) throw new RenderAdapterError("Remotion did not return an in-memory preview", "render_failed");
    return {...prepared, artifact: {kind: "preview", content_type: result.contentType, bytes: result.buffer, sha256: createHash("sha256").update(result.buffer).digest("hex")}};
  } finally {
    await rm(bundleDirectory, {recursive: true, force: true});
  }
}
