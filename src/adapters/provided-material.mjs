import Ajv2020 from "ajv/dist/2020.js";
import {createHash} from "node:crypto";
import {constants} from "node:fs";
import {open, readFile, realpath, stat} from "node:fs/promises";
import {resolve} from "node:path";
import {createEvidenceRecord} from "../agency/evidence.mjs";
import {stableId} from "../core/ids.mjs";
import {resolveConsumerPath} from "../core/paths.mjs";

const schema = JSON.parse(await readFile(resolve(import.meta.dirname, "../../schemas/v1/provided-material.schema.json"), "utf8"));
const validate = new Ajv2020({allErrors: true, strict: true}).compile(schema);

export class ProvidedMaterialValidationError extends Error {
  constructor(errors) {
    super(errors.join("\n"));
    this.name = "ProvidedMaterialValidationError";
    this.errors = errors;
  }
}

async function hashFile(handle) {
  const hash = createHash("sha256");
  for await (const chunk of handle.createReadStream({autoClose: false})) hash.update(chunk);
  return hash.digest("hex");
}

async function descriptorPath(handle) {
  for (const candidate of [`/proc/self/fd/${handle.fd}`, `/dev/fd/${handle.fd}`]) {
    try {
      return await realpath(candidate);
    } catch (error) {
      if (error.code !== "ENOENT" && error.code !== "ENOTDIR") throw error;
    }
  }
  throw new Error("Safe contributed-material ingestion is unavailable because this platform cannot verify opened-file identity");
}

function normalizedDate(value) {
  if (value === null) return null;
  const iso = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2}))?$/;
  const match = typeof value === "string" ? iso.exec(value) : null;
  if (!match) throw new TypeError("providedAt must be an ISO date/date-time string or null");
  const [, year, month, day, hour = "00", minute = "00", second = "00"] = match;
  const daysInMonth = new Date(Date.UTC(Number(year), Number(month), 0)).getUTCDate();
  if (Number(month) < 1 || Number(month) > 12 || Number(day) < 1 || Number(day) > daysInMonth || Number(hour) > 23 || Number(minute) > 59 || Number(second) > 59 || Number.isNaN(new Date(value.length === 10 ? `${value}T00:00:00.000Z` : value).valueOf())) throw new TypeError("providedAt must be a valid ISO calendar date/date-time");
  return value;
}

function assertStringArray(name, value, {required = false} = {}) {
  if (!Array.isArray(value) || (required && value.length === 0) || value.some((item) => typeof item !== "string" || item.length === 0)) throw new TypeError(`${name} must be ${required ? "a non-empty" : "an"} array of non-empty strings`);
}

export async function ingestProvidedMaterial({projectRoot, projectId, sourcePath, kind, source = null, providedAt = null, license = null, context = {}, verificationStatus = "unverified", verificationDetails = [], limitations, reportedClaims = []}) {
  assertStringArray("verificationDetails", verificationDetails);
  assertStringArray("limitations", limitations, {required: true});
  assertStringArray("reportedClaims", reportedClaims);
  if (!context || typeof context !== "object" || Array.isArray(context)) throw new TypeError("context must be an object");
  const flags = context.flags ?? [];
  assertStringArray("context.flags", flags);
  if (typeof sourcePath !== "string") throw new TypeError("sourcePath must be a project-relative path");
  const normalizedSourcePath = sourcePath.split(/[\\/]+/).join("/");
  const absolutePath = await resolveConsumerPath(projectRoot, normalizedSourcePath);
  if (!Number.isInteger(constants.O_NOFOLLOW) || !Number.isInteger(constants.O_NONBLOCK)) throw new Error("Safe contributed-material ingestion is unavailable because this platform cannot safely open contributed files");
  let handle;
  let sha256;
  try {
    handle = await open(absolutePath, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    const openedPath = await descriptorPath(handle);
    if (openedPath !== absolutePath) throw new TypeError("sourcePath changed while it was being opened");
    if (await resolveConsumerPath(projectRoot, normalizedSourcePath) !== absolutePath) throw new TypeError("sourcePath now resolves to a different file");
    const before = await handle.stat({bigint: true});
    if (!before.isFile()) throw new TypeError("sourcePath must reference a regular file inside the consumer project");
    sha256 = await hashFile(handle);
    const after = await handle.stat({bigint: true});
    if (before.size !== after.size || before.mtimeNs !== after.mtimeNs || before.ctimeNs !== after.ctimeNs) throw new Error("Provided material changed while it was being hashed");
    if (await descriptorPath(handle) !== absolutePath) throw new TypeError("sourcePath changed while it was being ingested");
    const current = await stat(absolutePath, {bigint: true});
    if (current.dev !== after.dev || current.ino !== after.ino) throw new TypeError("sourcePath now references a different file");
    if (await resolveConsumerPath(projectRoot, normalizedSourcePath) !== absolutePath) throw new TypeError("sourcePath now resolves to a different file");
  } catch (error) {
    if (error.code === "ELOOP") throw new TypeError("sourcePath changed to a symbolic link before it could be ingested");
    throw error;
  } finally {
    try { await handle?.close(); } catch {}
  }
  const procedureHash = stableId("procedure", {adapter: "provided-material", sha256});
  const featureOrJourney = context.feature_or_journey ?? `Provided ${kind}`;
  const evidence = createEvidenceRecord({
    projectId,
    featureOrJourney,
    procedureHash,
    surface: "provided-material",
    adapter: "provided-material",
    verification: "provenance-limited",
    role: context.role ?? "unknown",
    availability: "unknown",
    flags,
    build: context.build ?? "unknown",
    commit: context.commit ?? null,
    locale: context.locale ?? "unknown",
    steps: ["Material supplied; no live product journey was executed"],
    result: "Contributed material ingested with provenance-limited verification.",
    capturePaths: [normalizedSourcePath],
    hashes: [`sha256:${sha256}`],
    allowedClaims: []
  });
  const record = {
    schema_version: 1,
    project_id: projectId,
    material_id: stableId("material", {projectId, sourcePath: normalizedSourcePath, sha256}),
    evidence_id: evidence.evidence_id,
    kind,
    source_path: normalizedSourcePath,
    sha256,
    origin: {source, provided_at: normalizedDate(providedAt), license},
    context: {
      feature_or_journey: context.feature_or_journey ?? null,
      role: context.role ?? null,
      build: context.build ?? null,
      commit: context.commit ?? null,
      locale: context.locale ?? null,
      flags: [...flags]
    },
    verification: {status: verificationStatus, details: [...verificationDetails], limitations: [...limitations]},
    reported_claims: [...reportedClaims]
  };
  if (!validate(record)) throw new ProvidedMaterialValidationError((validate.errors ?? []).map((error) => `provided-material.json${error.instancePath || "/"}: ${error.message}`));
  return {record, evidence};
}
