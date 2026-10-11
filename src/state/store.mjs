import Ajv2020 from "ajv/dist/2020.js";
import {link, mkdir, readFile, realpath, rename, unlink, writeFile} from "node:fs/promises";
import {dirname, isAbsolute, relative, resolve, sep} from "node:path";
import {fileURLToPath} from "node:url";
import {resolveConsumerPath} from "../core/paths.mjs";
import {randomUUID} from "node:crypto";
import {DatabaseSync} from "node:sqlite";

const moduleRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const canonicalModuleRoot = await realpath(moduleRoot);
const schema = JSON.parse(await readFile(resolve(moduleRoot, "schemas/v1/state.schema.json"), "utf8"));
const validate = new Ajv2020({allErrors: true, strict: true}).compile(schema);

export class StateValidationError extends Error {
  constructor(errors) {
    super(errors.map((error) => `${error.instancePath || "/"}: ${error.message}`).join("\n"));
    this.name = "StateValidationError";
    this.errors = errors;
  }
}

export class StateConflictError extends Error {
  constructor(message) {
    super(message);
    this.name = "StateConflictError";
  }
}

export function statePath(projectRoot) {
  return resolve(projectRoot, ".keelokit/studio/state.json");
}

function isInside(candidate, parent) {
  const path = relative(parent, candidate);
  return path === "" || (path !== ".." && !path.startsWith(`..${sep}`) && !isAbsolute(path));
}

async function assertConsumerDestination(projectRoot) {
  const canonicalRoot = await realpath(resolve(projectRoot));
  if (isInside(canonicalRoot, canonicalModuleRoot)) {
    throw new StateValidationError([{instancePath: "/project_root", message: "must be outside the plugin installation"}]);
  }
  let existingAncestor = canonicalRoot;
  for (const segment of [".keelokit", "studio"]) {
    try {
      existingAncestor = await realpath(resolve(existingAncestor, segment));
    } catch (error) {
      if (error.code === "ENOENT") break;
      throw error;
    }
    if (isInside(existingAncestor, canonicalModuleRoot)) {
      throw new StateValidationError([{instancePath: "/project_root", message: "state directory must be outside the plugin installation"}]);
    }
  }
  const destination = statePath(canonicalRoot);
  await resolveConsumerPath(canonicalRoot, ".keelokit/studio");
  await mkdir(dirname(destination), {recursive: true});
  const canonicalDirectory = await realpath(dirname(destination));
  if (isInside(canonicalDirectory, canonicalModuleRoot)) {
    throw new StateValidationError([{instancePath: "/project_root", message: "state directory must be outside the plugin installation"}]);
  }
  return resolveConsumerPath(canonicalRoot, ".keelokit/studio/state.json");
}

export function createInitialState(projectId, now = new Date().toISOString()) {
  return {
    schema_version: 1,
    state_revision: 0,
    project_id: projectId,
    engagement_phase: "discovered",
    versions: {},
    decisions: [],
    approvals: [],
    pieces: [],
    costs: {currency: null, approved_limit: null, known_total: 0},
    jobs: [],
    events: [{event_id: randomUUID(), type: "state.initialized", recorded_at: now, details: {}}],
    updated_at: now
  };
}

export function assertValidState(state) {
  if (!validate(state)) throw new StateValidationError(validate.errors ?? []);
  for (const collection of ["decisions", "approvals", "pieces", "jobs", "events"]) {
    const idKey = collection === "pieces" ? "piece_id" : collection === "jobs" ? "job_id" : collection === "events" ? "event_id" : collection === "approvals" ? "approval_id" : "decision_id";
    const values = state[collection].map((entry) => entry[idKey]);
    if (new Set(values).size !== values.length) throw new StateValidationError([{instancePath: `/${collection}`, message: `must contain unique ${idKey} values`}]);
  }
  return state;
}

export async function loadState(projectRoot) {
  const destination = await assertConsumerDestination(projectRoot);
  return assertValidState(JSON.parse(await readFile(destination, "utf8")));
}

export async function initializeState(projectRoot, state) {
  const snapshot = structuredClone(state);
  assertValidState(snapshot);
  const serialized = `${JSON.stringify(snapshot, null, 2)}\n`;
  const destination = await assertConsumerDestination(projectRoot);
  const temporary = `${destination}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporary, serialized, {flag: "wx", mode: 0o600});
  try {
    await link(temporary, destination);
  } catch (error) {
    if (error.code === "EEXIST") throw new StateConflictError(`State already exists at ${destination}`);
    throw error;
  } finally {
    await unlink(temporary).catch(() => {});
  }
  return destination;
}

export async function saveState(projectRoot, state) {
  const submitted = structuredClone(state);
  assertValidState(submitted);
  const destination = await assertConsumerDestination(projectRoot);
  let temporary;
  const database = new DatabaseSync(`${destination}.lock.sqlite`, {timeout: 0});
  try {
    database.exec("BEGIN IMMEDIATE");
  } catch (error) {
    database.close();
    throw new StateConflictError(`State is being updated at ${destination}: ${error.message}`);
  }
  try {
    const current = assertValidState(JSON.parse(await readFile(destination, "utf8")));
    if (current.state_revision !== submitted.state_revision) {
      throw new StateConflictError(`State revision changed from ${submitted.state_revision} to ${current.state_revision}; reload before saving`);
    }
    const snapshot = {...submitted, state_revision: submitted.state_revision + 1};
    assertValidState(snapshot);
    const serialized = `${JSON.stringify(snapshot, null, 2)}\n`;
    temporary = `${destination}.${process.pid}.${randomUUID()}.tmp`;
    await writeFile(temporary, serialized, {flag: "wx", mode: 0o600});
    await rename(temporary, destination);
    temporary = undefined;
    return {path: destination, state: snapshot};
  } finally {
    database.exec("ROLLBACK");
    database.close();
    if (temporary) await unlink(temporary).catch(() => {});
  }
}

export function addApproval(state, approval, now = new Date().toISOString()) {
  const next = structuredClone(state);
  next.approvals.push(approval);
  next.events.push({
    event_id: randomUUID(),
    type: approval.status === "revoked" ? "approval.revoked" : "approval.recorded",
    recorded_at: now,
    details: {approval_id: approval.approval_id, kind: approval.kind, scope: approval.scope}
  });
  next.updated_at = now;
  return assertValidState(next);
}

export function hasCurrentApproval(state, {kind, scope, subjectVersion, subjectHash}) {
  const latest = state.approvals.findLast((approval) =>
    approval.kind === kind &&
    approval.scope === scope &&
    approval.subject_version === subjectVersion &&
    approval.subject_hash === subjectHash
  );
  return latest?.status === "approved";
}
