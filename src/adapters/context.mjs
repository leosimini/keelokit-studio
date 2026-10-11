import {createHash} from "node:crypto";
import {readFile} from "node:fs/promises";
import {stableId} from "../core/ids.mjs";
import {readRegularFile, resolveConsumerPath} from "../core/paths.mjs";

export const sourceKinds = Object.freeze([
  "profile", "readme", "context", "prd", "completed-work", "changelog", "manual",
  "brand", "ui", "build", "environment", "journey", "backlog", "provided-material"
]);
const sourceStatuses = new Set(["confirmed", "inferred", "contradictory", "stale"]);
const availabilityEvidenceKinds = new Set(["completed-work", "changelog", "ui", "build", "journey"]);

function normalizedLocation(location) {
  if (typeof location !== "string") throw new TypeError("Source location must be a project-relative path");
  return location.split(/[\\/]+/).join("/");
}

function normalizedObservedAt(observedAt) {
  const date = new Date(observedAt);
  if (typeof observedAt !== "string" || Number.isNaN(date.valueOf())) throw new TypeError("observedAt must be an ISO date or date-time string");
  return date.toISOString();
}

function classify(requestedStatus) {
  if (!sourceStatuses.has(requestedStatus)) throw new TypeError(`Unsupported source status: ${requestedStatus}`);
  return requestedStatus;
}

export async function inspectContextSources({projectRoot, projectId, observedAt, sources}) {
  if (typeof projectId !== "string" || projectId.length === 0) throw new TypeError("projectId is required");
  if (!Array.isArray(sources) || sources.length === 0) throw new TypeError("At least one source descriptor is required");
  const timestamp = normalizedObservedAt(observedAt);
  const observations = [];
  const seenLocations = new Set();

  for (const descriptor of sources) {
    if (!descriptor || !sourceKinds.includes(descriptor.kind)) throw new TypeError(`Unsupported source kind: ${descriptor?.kind}`);
    const location = normalizedLocation(descriptor.path);
    if (seenLocations.has(location)) throw new TypeError(`Duplicate source location: ${location}`);
    seenLocations.add(location);
    const sourceId = stableId("source", {projectId, kind: descriptor.kind, location});
    const path = await resolveConsumerPath(projectRoot, location);
    let content;
    try {
      content = await readRegularFile(path);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    const exists = content !== undefined;
    const requestedStatus = descriptor.status ?? "inferred";
    observations.push({
      source_id: sourceId,
      kind: descriptor.kind,
      location,
      observed_at: timestamp,
      build: descriptor.build ?? null,
      status: exists ? classify(requestedStatus) : "missing",
      content_hash: exists ? createHash("sha256").update(content).digest("hex") : null,
      availability_evidence: exists && availabilityEvidenceKinds.has(descriptor.kind) ? "candidate" : "none"
    });
  }

  return {schema_version: 1, project_id: projectId, sources: observations};
}

