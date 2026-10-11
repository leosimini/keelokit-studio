import Ajv2020 from "ajv/dist/2020.js";
import {createHash, randomUUID} from "node:crypto";
import {constants} from "node:fs";
import {link, mkdir, open, readFile, realpath, stat, unlink} from "node:fs/promises";
import {extname, resolve} from "node:path";
import {stableId} from "../core/ids.mjs";
import {resolveConsumerPath} from "../core/paths.mjs";

const schema = JSON.parse(await readFile(resolve(import.meta.dirname, "../../schemas/v1/assets.schema.json"), "utf8"));
const validate = new Ajv2020({allErrors: true, strict: true}).compile(schema);
const kinds = new Set(["capture", "logo", "font", "audio", "video", "image", "document", "other"]);
const originTypes = new Set(["captured", "provided", "generated", "derived"]);
const approvalStatuses = new Set(["pending", "approved", "unapproved"]);
const dependencyTypes = new Set(["asset", "brand", "evidence", "provided-material", "source"]);

function isPortableProjectPath(path) {
  if (typeof path !== "string" || path.length === 0 || path.includes("\\") || path.includes("\0") || path.startsWith("/") || /^[A-Za-z]:/.test(path)) return false;
  const segments = path.split("/");
  return segments.every((segment) => segment !== "" && segment !== "." && segment !== "..");
}

export class AssetInventoryError extends Error {
  constructor(errors) {
    super(errors.join("\n"));
    this.name = "AssetInventoryError";
    this.errors = errors;
  }
}

function assertInventory(inventory) {
  if (!validate(inventory)) throw new AssetInventoryError((validate.errors ?? []).map((error) => `assets.json${error.instancePath || "/"}: ${error.message}`));
  const ids = inventory.assets.map(({asset_id}) => asset_id);
  if (new Set(ids).size !== ids.length) throw new AssetInventoryError(["assets.json: asset_id values must be unique"]);
  const paths = inventory.assets.map(({path}) => path);
  if (new Set(paths).size !== paths.length) throw new AssetInventoryError(["assets.json: paths must be unique"]);
  const known = new Map(inventory.assets.map((asset) => [asset.asset_id, asset]));
  for (const asset of inventory.assets) {
    if (!isPortableProjectPath(asset.path)) throw new AssetInventoryError([`assets.json: asset ${asset.asset_id} path must be a portable project-relative path`]);
    if (asset.approval.status !== "pending" && asset.approval.review_id === null) throw new AssetInventoryError([`assets.json: asset ${asset.asset_id} requires a review_id for ${asset.approval.status} approval state`]);
    const dependencyKeys = asset.depends_on.map((dependency) => `${dependency.type}:${dependency.id}:${dependency.sha256 ?? ""}`);
    if (new Set(dependencyKeys).size !== dependencyKeys.length) throw new AssetInventoryError([`assets.json: asset ${asset.asset_id} has duplicate dependencies`]);
    for (const dependency of asset.depends_on) {
      if (dependency.type === "asset" && !known.has(dependency.id)) throw new AssetInventoryError([`assets.json: asset ${asset.asset_id} references unknown asset dependency ${dependency.id}`]);
      if (dependency.type === "asset" && dependency.id === asset.asset_id) throw new AssetInventoryError([`assets.json: asset ${asset.asset_id} cannot depend on itself`]);
      if (dependency.type === "asset" && dependency.sha256 !== known.get(dependency.id)?.sha256) throw new AssetInventoryError([`assets.json: asset ${asset.asset_id} dependency hash does not match ${dependency.id}`]);
    }
  }
  const visiting = new Set();
  const visited = new Set();
  function visit(assetId) {
    if (visiting.has(assetId)) throw new AssetInventoryError([`assets.json: asset dependency cycle includes ${assetId}`]);
    if (visited.has(assetId)) return;
    visiting.add(assetId);
    for (const dependency of known.get(assetId).depends_on) if (dependency.type === "asset") visit(dependency.id);
    visiting.delete(assetId);
    visited.add(assetId);
  }
  for (const assetId of known.keys()) visit(assetId);
  return inventory;
}

function assertMetadata({projectId, kind, origin, approval, dependsOn, evidenceId}) {
  if (typeof projectId !== "string" || projectId.length === 0) throw new TypeError("projectId must be a non-empty string");
  if (!kinds.has(kind)) throw new TypeError("kind is not supported");
  if (!origin || !originTypes.has(origin.type) || typeof origin.source !== "string" || origin.source.length === 0) throw new TypeError("origin requires a supported type and non-empty source");
  if (origin.license !== undefined && origin.license !== null && (typeof origin.license !== "string" || origin.license.length === 0)) throw new TypeError("origin.license must be a non-empty string or null");
  if (origin.observed_at !== undefined && origin.observed_at !== null && (typeof origin.observed_at !== "string" || origin.observed_at.length === 0)) throw new TypeError("origin.observed_at must be a non-empty string or null");
  if (!approval || !approvalStatuses.has(approval.status) || !Object.hasOwn(approval, "review_id")) throw new TypeError("approval requires status and review_id");
  if (approval.review_id !== null && (typeof approval.review_id !== "string" || approval.review_id.length === 0)) throw new TypeError("approval.review_id must be a non-empty string or null");
  if (approval.status !== "pending" && approval.review_id === null) throw new TypeError(`${approval.status} approval requires a review_id`);
  if (!Array.isArray(dependsOn)) throw new TypeError("dependsOn must be an array");
  const dependencyKeys = new Set();
  for (const dependency of dependsOn) {
    if (!dependency || !dependencyTypes.has(dependency.type) || typeof dependency.id !== "string" || dependency.id.length === 0 || !Object.hasOwn(dependency, "sha256")) throw new TypeError("Each dependency requires a supported type, id, and sha256");
    if (dependency.sha256 !== null && !/^[a-f0-9]{64}$/.test(dependency.sha256)) throw new TypeError("Dependency sha256 must be a SHA-256 digest or null");
    if (dependency.type === "asset" && dependency.sha256 === null) throw new TypeError("Asset dependencies require a SHA-256 digest");
    const key = `${dependency.type}:${dependency.id}:${dependency.sha256 ?? ""}`;
    if (dependencyKeys.has(key)) throw new TypeError("dependsOn must not contain duplicate dependencies");
    dependencyKeys.add(key);
  }
  if (evidenceId !== null && (typeof evidenceId !== "string" || evidenceId.length === 0)) throw new TypeError("evidenceId must be a non-empty string or null");
}

async function hashHandle(handle) {
  const hash = createHash("sha256");
  for await (const chunk of handle.createReadStream({autoClose: false})) hash.update(chunk);
  return hash.digest("hex");
}

async function descriptorPath(handle) {
  for (const candidate of [`/proc/self/fd/${handle.fd}`, `/dev/fd/${handle.fd}`]) {
    try { return await realpath(candidate); } catch (error) {
      if (error.code !== "ENOENT" && error.code !== "ENOTDIR") throw error;
    }
  }
  throw new Error("Safe asset persistence is unavailable because this platform cannot verify opened-file identity");
}

async function descriptorAccessRoot(handle) {
  for (const candidate of [`/proc/self/fd/${handle.fd}`, `/dev/fd/${handle.fd}`]) {
    try {
      await stat(candidate);
      return candidate;
    } catch (error) {
      if (error.code !== "ENOENT" && error.code !== "ENOTDIR") throw error;
    }
  }
  throw new Error("Safe asset persistence is unavailable because this platform cannot address an opened directory");
}

async function verifiedSource({projectRoot, sourcePath}) {
  if (typeof sourcePath !== "string") throw new TypeError("sourcePath must be a project-relative path");
  const normalized = sourcePath.split(/[\\/]+/).join("/");
  const absolute = await resolveConsumerPath(projectRoot, normalized);
  if (!Number.isInteger(constants.O_NOFOLLOW) || !Number.isInteger(constants.O_NONBLOCK)) throw new Error("Safe asset persistence is unavailable on this platform");
  const handle = await open(absolute, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    if (await descriptorPath(handle) !== absolute || await resolveConsumerPath(projectRoot, normalized) !== absolute) throw new TypeError("sourcePath changed while it was being opened");
    const before = await handle.stat({bigint: true});
    if (!before.isFile()) throw new TypeError("sourcePath must reference a regular file inside the consumer project");
    const sha256 = await hashHandle(handle);
    const after = await handle.stat({bigint: true});
    const current = await stat(absolute, {bigint: true});
    if (before.size !== after.size || before.mtimeNs !== after.mtimeNs || before.ctimeNs !== after.ctimeNs || current.dev !== after.dev || current.ino !== after.ino || await descriptorPath(handle) !== absolute || await resolveConsumerPath(projectRoot, normalized) !== absolute) throw new Error("Asset source changed while it was being hashed");
    return {absolute, normalized, sha256};
  } finally {
    await handle.close();
  }
}

async function hashPath(path, expectedPath) {
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const before = await handle.stat({bigint: true});
    if (!before.isFile()) throw new TypeError("Persisted asset must be a regular file");
    const sha256 = await hashHandle(handle);
    const after = await handle.stat({bigint: true});
    const current = await stat(path, {bigint: true});
    if (before.size !== after.size || before.mtimeNs !== after.mtimeNs || before.ctimeNs !== after.ctimeNs || current.dev !== after.dev || current.ino !== after.ino || await descriptorPath(handle) !== expectedPath) throw new Error("Persisted asset changed while it was being verified");
    return sha256;
  } finally { await handle.close(); }
}

async function writeAll(handle, chunk) {
  let offset = 0;
  while (offset < chunk.length) {
    const {bytesWritten} = await handle.write(chunk.subarray(offset));
    if (bytesWritten <= 0) throw new Error("Asset copy made no write progress");
    offset += bytesWritten;
  }
}

export function createAssetInventory({projectId, assets = []}) {
  return assertInventory({schema_version: 1, project_id: projectId, assets: structuredClone(assets)});
}

export async function persistAsset({projectRoot, projectId, sourcePath, outputDirectory, kind, origin, approval = {status: "pending", review_id: null}, dependsOn = [], evidenceId = null}) {
  assertMetadata({projectId, kind, origin, approval, dependsOn, evidenceId});
  if (typeof outputDirectory !== "string" || outputDirectory.length === 0) throw new TypeError("outputDirectory must be an explicit project-relative path");
  if (!isPortableProjectPath(outputDirectory.split(/[\\/]+/).join("/"))) throw new TypeError("outputDirectory must be a portable project-relative path");
  const source = await verifiedSource({projectRoot, sourcePath});
  const normalizedOrigin = {type: origin.type, source: origin.source, license: origin.license ?? null, observed_at: origin.observed_at ?? null};
  const normalizedDependencies = dependsOn.map(({type, id, sha256}) => ({type, id, sha256})).sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  const assetId = stableId("asset", {projectId, kind, sha256: source.sha256, origin: normalizedOrigin, dependsOn: normalizedDependencies});
  const suffix = /^[.][a-zA-Z0-9]{1,10}$/.test(extname(source.normalized)) ? extname(source.normalized).toLowerCase() : "";
  const relativePath = `${outputDirectory.split(/[\\/]+/).join("/")}/${assetId}${suffix}`;
  const outputAbsolute = await resolveConsumerPath(projectRoot, outputDirectory);
  await mkdir(outputAbsolute, {recursive: true});
  if (await resolveConsumerPath(projectRoot, outputDirectory) !== await realpath(outputAbsolute)) throw new Error("outputDirectory changed while it was being created");
  const destination = await resolveConsumerPath(projectRoot, relativePath);
  if (!Number.isInteger(constants.O_DIRECTORY)) throw new Error("Safe asset persistence is unavailable because this platform cannot pin an output directory");
  const directory = await open(outputAbsolute, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  const temporaryName = `.${assetId}-${randomUUID()}.tmp`;
  const destinationName = `${assetId}${suffix}`;
  let temporaryAccess;
  let destinationAccess;
  let createdTemporary = false;
  let createdDestination = false;
  let succeeded = false;
  try {
    if (await descriptorPath(directory) !== outputAbsolute) throw new Error("outputDirectory changed while it was being opened");
    const accessRoot = await descriptorAccessRoot(directory);
    temporaryAccess = resolve(accessRoot, temporaryName);
    destinationAccess = resolve(accessRoot, destinationName);
    const input = await open(source.absolute, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    let output;
    try {
      output = await open(temporaryAccess, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
      createdTemporary = true;
      if (await descriptorPath(output) !== resolve(outputAbsolute, temporaryName) || await descriptorPath(directory) !== outputAbsolute) throw new Error("outputDirectory changed while the asset was being created");
      if (await descriptorPath(input) !== source.absolute || await resolveConsumerPath(projectRoot, source.normalized) !== source.absolute) throw new Error("Asset source changed before it could be copied");
      const before = await input.stat({bigint: true});
      if (!before.isFile()) throw new TypeError("sourcePath must reference a regular file inside the consumer project");
      const copiedHash = createHash("sha256");
      for await (const chunk of input.createReadStream({autoClose: false})) {
        copiedHash.update(chunk);
        await writeAll(output, chunk);
      }
      await output.sync();
      const after = await input.stat({bigint: true});
      if (before.size !== after.size || before.mtimeNs !== after.mtimeNs || before.ctimeNs !== after.ctimeNs || copiedHash.digest("hex") !== source.sha256 || await descriptorPath(input) !== source.absolute || await resolveConsumerPath(projectRoot, source.normalized) !== source.absolute) throw new Error("Asset source changed while it was being copied");
      if (await descriptorPath(output) !== resolve(outputAbsolute, temporaryName) || await descriptorPath(directory) !== outputAbsolute) throw new Error("outputDirectory changed while the asset was being written");
    } finally {
      await input.close();
      await output?.close();
    }
    try {
      if (await resolveConsumerPath(projectRoot, outputDirectory) !== outputAbsolute || await resolveConsumerPath(projectRoot, relativePath) !== destination) throw new Error("outputDirectory changed before the asset could be persisted");
      await link(temporaryAccess, destinationAccess);
      createdDestination = true;
      await unlink(temporaryAccess);
      createdTemporary = false;
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      if (await hashPath(destinationAccess, destination) !== source.sha256) throw new Error("Content-addressed asset collision");
    }
    if (await descriptorPath(directory) !== outputAbsolute || await resolveConsumerPath(projectRoot, outputDirectory) !== outputAbsolute || await resolveConsumerPath(projectRoot, relativePath) !== destination) throw new Error("outputDirectory changed while the asset was being persisted");
    if (await hashPath(destinationAccess, destination) !== source.sha256) throw new Error("Persisted asset hash does not match its source");
    succeeded = true;
  } finally {
    if (createdTemporary) try { await unlink(temporaryAccess); } catch {}
    if (!succeeded && createdDestination) try { await unlink(destinationAccess); } catch {}
    await directory.close();
  }
  const record = {
    asset_id: assetId,
    kind,
    path: relativePath,
    sha256: source.sha256,
    origin: normalizedOrigin,
    approval: {status: approval.status, review_id: approval.review_id},
    status: "valid",
    depends_on: normalizedDependencies,
    evidence_id: evidenceId
  };
  if (!validate({schema_version: 1, project_id: projectId, assets: [record]})) throw new AssetInventoryError((validate.errors ?? []).map((error) => `assets.json${error.instancePath || "/"}: ${error.message}`));
  return record;
}

export function addAsset(inventory, asset) {
  return createAssetInventory({projectId: inventory.project_id, assets: [...inventory.assets, structuredClone(asset)]});
}

export function invalidateAssetDependencies(inventory, changes) {
  assertInventory(inventory);
  if (!Array.isArray(changes) || changes.length === 0) throw new TypeError("changes must be a non-empty dependency array");
  const changed = new Set();
  for (const change of changes) {
    if (!change || !dependencyTypes.has(change.type) || typeof change.id !== "string" || change.id.length === 0) throw new TypeError("Each change requires a supported type and id");
    changed.add(`${change.type}:${change.id}`);
  }
  const invalidated = new Set();
  let found = true;
  while (found) {
    found = false;
    for (const asset of inventory.assets) {
      if (invalidated.has(asset.asset_id)) continue;
      if (asset.depends_on.some((dependency) => changed.has(`${dependency.type}:${dependency.id}`) || (dependency.type === "asset" && invalidated.has(dependency.id)))) {
        invalidated.add(asset.asset_id);
        found = true;
      }
    }
  }
  const next = structuredClone(inventory);
  for (const asset of next.assets) if (invalidated.has(asset.asset_id)) asset.status = "stale";
  return {inventory: assertInventory(next), invalidated_asset_ids: [...invalidated]};
}
