import {contentHash, stableId} from "../core/ids.mjs";
import {createAssetInventory} from "./inventory.mjs";

const kinds = new Set(["capture", "logo", "font", "audio", "video", "image", "document", "other"]);
const fields = ["scene_id", "purpose", "evidence_id", "evidence_hash", "build", "role", "locale", "state", "action", "result", "media_kind", "dimensions", "aspect_ratio", "crop", "focus", "duration_seconds", "rights", "approval", "acceptance_criteria"];
const text = (value) => typeof value === "string" && value.trim().length > 0;
const hash = (value) => typeof value === "string" && /^sha256:[a-f0-9]{64}$/.test(value);

export class AssetRequirementsError extends Error {
  constructor(errors) {
    super(errors.join("\n"));
    this.name = "AssetRequirementsError";
    this.errors = errors;
  }
}

function fail(message) { throw new AssetRequirementsError([message]); }

function exactKeys(value, expected, label) {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some((key) => !expected.includes(key)) || expected.some((key) => !Object.hasOwn(value, key))) fail(`${label} requires exactly: ${expected.join(", ")}`);
}

function binding(storyboard) {
  for (const key of ["project_id", "piece_id", "storyboard_id"]) if (!text(storyboard?.[key])) fail(`storyboard.${key} is required`);
  if (!Number.isInteger(storyboard.version) || storyboard.version < 1 || !Array.isArray(storyboard.scenes)) fail("A versioned storyboard with scenes is required");
  const sceneIds = storyboard.scenes.map((scene) => scene.scene_id);
  if (sceneIds.some((id) => !text(id)) || new Set(sceneIds).size !== sceneIds.length) fail("Storyboard scene IDs must be unique non-empty strings");
  return {project_id: storyboard.project_id, piece_id: storyboard.piece_id, storyboard_id: storyboard.storyboard_id, storyboard_version: storyboard.version, storyboard_hash: contentHash(storyboard)};
}

function identity(requirement) {
  return Object.fromEntries(fields.map((field) => [field, requirement[field]]));
}

function assertRequirement(requirement, document, storyboard, evidence) {
  exactKeys(requirement, ["requirement_id", ...fields, "fulfillment"], "requirement");
  for (const field of ["scene_id", "purpose", "media_kind"]) if (!text(requirement[field])) fail(`${field} must be a non-empty string`);
  for (const field of ["evidence_id", "build", "role", "locale", "state", "action", "result", "aspect_ratio", "crop", "focus", "rights"]) if (requirement[field] !== null && !text(requirement[field])) fail(`${field} must be a non-empty string or explicit null`);
  if (!kinds.has(requirement.media_kind)) fail("media_kind is unsupported");
  const scene = storyboard.scenes.find(({scene_id}) => scene_id === requirement.scene_id);
  if (!scene) fail(`Unknown scene ${requirement.scene_id}`);
  if (requirement.dimensions !== null) {
    exactKeys(requirement.dimensions, ["width", "height"], "dimensions");
    if (![requirement.dimensions.width, requirement.dimensions.height].every((value) => Number.isInteger(value) && value > 0)) fail("dimensions must be positive integer pixels");
  }
  if (requirement.duration_seconds !== null && (!Number.isFinite(requirement.duration_seconds) || requirement.duration_seconds <= 0)) fail("duration_seconds must be positive or explicit null");
  if (requirement.aspect_ratio !== null) {
    if (!/^[1-9][0-9]*:[1-9][0-9]*$/.test(requirement.aspect_ratio)) fail("aspect_ratio must use positive width:height integers");
    const [width, height] = requirement.aspect_ratio.split(":").map(Number);
    if (![width, height].every(Number.isSafeInteger)) fail("aspect_ratio integers must be safe");
    if (requirement.dimensions && requirement.dimensions.width * height !== requirement.dimensions.height * width) fail("aspect_ratio must match dimensions");
  }
  exactKeys(requirement.approval, ["status", "review_id"], "approval");
  if (!["pending", "approved"].includes(requirement.approval.status) || (requirement.approval.review_id !== null && !text(requirement.approval.review_id))) fail("approval requires pending or approved status and a review_id or explicit null");
  if (!Array.isArray(requirement.acceptance_criteria) || !requirement.acceptance_criteria.length || requirement.acceptance_criteria.some((criterion) => !text(criterion)) || new Set(requirement.acceptance_criteria).size !== requirement.acceptance_criteria.length) fail("acceptance_criteria must contain unique non-empty strings");
  if (requirement.evidence_id === null) {
    if (requirement.evidence_hash !== null) fail("evidence_hash requires evidence_id");
  } else {
    if (!hash(requirement.evidence_hash)) fail("Evidence binding requires an exact evidence_hash");
    if (!scene.evidence_ids?.includes(requirement.evidence_id) || !storyboard.evidence_ids?.includes(requirement.evidence_id)) fail(`Unknown or unselected evidence ${requirement.evidence_id}`);
    for (const field of ["build", "role", "locale", "state", "action", "result"]) if (!text(requirement[field])) fail(`Evidence requirement needs explicit ${field}`);
    for (const field of ["build", "role", "locale"]) if (requirement[field] !== storyboard.evidence_target?.[field]) fail(`${field} must match storyboard evidence target`);
    if (evidence !== undefined) {
      if (evidence?.project_id !== document.project_id || !Array.isArray(evidence.evidence)) fail("Evidence document must share project_id");
      const record = evidence.evidence.find(({evidence_id}) => evidence_id === requirement.evidence_id);
      if (!record) fail(`Unknown evidence ${requirement.evidence_id}`);
      if (contentHash(record) !== requirement.evidence_hash) fail(`Stale evidence ${requirement.evidence_id}`);
      for (const field of ["build", "role", "locale", "result"]) if (requirement[field] !== record[field]) fail(`${field} must match evidence record`);
      if (!record.steps?.includes(requirement.action)) fail("action must match an evidence step");
    }
  }
  const expectedId = stableId("asset-requirement", {binding: Object.fromEntries(Object.entries(document).filter(([key]) => key !== "schema_version" && key !== "requirements")), requirement: identity(requirement)});
  if (requirement.requirement_id !== expectedId) fail(`Unknown or mismatched requirement ${requirement.requirement_id}`);
  if (requirement.fulfillment !== null) {
    exactKeys(requirement.fulfillment, ["asset_id", "sha256"], "fulfillment");
    if (!text(requirement.fulfillment.asset_id) || typeof requirement.fulfillment.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(requirement.fulfillment.sha256)) fail("fulfillment requires asset_id and SHA-256 bytes hash");
  }
}

/** Bind explicit requests to one immutable storyboard revision. */
export function createAssetRequirements({storyboard, requirements, evidence}) {
  const bound = binding(storyboard);
  if (!Array.isArray(requirements)) fail("requirements must be an array");
  const document = {schema_version: 1, ...bound, requirements: requirements.map((input) => {
    exactKeys(input, fields, "requirement input");
    const requirement = structuredClone(input);
    return {requirement_id: stableId("asset-requirement", {binding: bound, requirement}), ...requirement, fulfillment: null};
  })};
  return validateAssetRequirements(document, {storyboard, evidence});
}

/** Validate binding and all populated fulfillments against the current inventory. */
export function validateAssetRequirements(document, {storyboard, assets, evidence}) {
  const bound = binding(storyboard);
  exactKeys(document, ["schema_version", ...Object.keys(bound), "requirements"], "asset requirements document");
  if (document.schema_version !== 1 || Object.entries(bound).some(([key, value]) => document[key] !== value)) fail("Stale or mismatched project, piece or storyboard binding");
  if (!Array.isArray(document.requirements)) fail("requirements must be an array");
  const ids = new Set();
  for (const requirement of document.requirements) {
    assertRequirement(requirement, document, storyboard, evidence);
    if (ids.has(requirement.requirement_id)) fail("Duplicate requirement ID");
    ids.add(requirement.requirement_id);
  }
  if (assets !== undefined) {
    if (assets?.project_id !== document.project_id) fail("Asset inventory must share project_id");
    createAssetInventory({projectId: assets.project_id, assets: assets.assets});
  }
  const byId = new Map((assets?.assets ?? []).map((asset) => [asset.asset_id, asset]));
  for (const requirement of document.requirements) {
    if (requirement.fulfillment === null) continue;
    if (!assets) fail("Fulfillment validation requires the current asset inventory");
    if (requirement.evidence_id !== null && evidence === undefined) fail("Evidence fulfillment requires the current evidence document");
    const asset = byId.get(requirement.fulfillment.asset_id);
    if (!asset) fail(`Unknown fulfillment asset ${requirement.fulfillment.asset_id}`);
    if (asset.sha256 !== requirement.fulfillment.sha256) fail("Fulfillment asset hash mismatch");
    const checked = new Set();
    function checkAvailability(record) {
      if (checked.has(record.asset_id)) return;
      checked.add(record.asset_id);
      if (record.status !== "valid" || record.approval.status === "unapproved") fail(`Stale or rejected fulfillment asset ${record.asset_id}`);
      if (record.evidence_id && record.evidence_id !== requirement.evidence_id) fail("Fulfillment evidence mismatch");
      for (const dependency of record.depends_on) {
        if (dependency.type === "asset") checkAvailability(byId.get(dependency.id));
        if (dependency.type === "evidence") {
          if (dependency.id !== requirement.evidence_id) fail("Fulfillment evidence dependency mismatch");
          if (dependency.sha256 !== null && !evidence?.evidence.find(({evidence_id}) => evidence_id === dependency.id)?.hashes.includes(`sha256:${dependency.sha256}`)) fail("Fulfillment evidence dependency hash mismatch");
        }
      }
    }
    checkAvailability(asset);
    if (asset.kind !== requirement.media_kind) fail("Fulfillment media kind mismatch");
    if (asset.approval.status !== requirement.approval.status || (requirement.approval.review_id !== null && asset.approval.review_id !== requirement.approval.review_id)) fail("Fulfillment approval mismatch");
    if (requirement.rights !== null && asset.origin.license !== requirement.rights) fail("Fulfillment rights mismatch");
    if ((asset.evidence_id ?? null) !== requirement.evidence_id) fail("Fulfillment evidence mismatch");
  }
  return document;
}

/** Record an existing asset without changing the request or caller-owned inputs. */
export function fulfillAssetRequirement(document, {requirementId, assetId, assetSha256, storyboard, assets, evidence}) {
  validateAssetRequirements(document, {storyboard, assets, evidence});
  const next = structuredClone(document);
  const requirement = next.requirements.find(({requirement_id}) => requirement_id === requirementId);
  if (!requirement) fail(`Unknown requirement ${requirementId}`);
  requirement.fulfillment = {asset_id: assetId, sha256: assetSha256};
  return validateAssetRequirements(next, {storyboard, assets, evidence});
}
