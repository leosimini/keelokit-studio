import Ajv2020 from "ajv/dist/2020.js";
import {randomUUID} from "node:crypto";
import {mkdir, readFile, rename, writeFile, unlink} from "node:fs/promises";
import {dirname, resolve} from "node:path";
import {DatabaseSync} from "node:sqlite";
import {readFile as readSchema} from "node:fs/promises";
import {resolveConsumerPath} from "../core/paths.mjs";
import {stableId} from "../core/ids.mjs";

const schema = JSON.parse(await readSchema(resolve(import.meta.dirname, "../../schemas/v1/dashboard-state.schema.json"), "utf8"));
const validate = new Ajv2020({allErrors: true, strict: true}).compile(schema);

export class DashboardError extends Error {}

function assertDashboard(value) {
  if (value && value.recommendations === undefined) value = {...value, recommendations: []};
  if (!validate(value)) throw new DashboardError((validate.errors ?? []).map(({instancePath, message}) => `${instancePath || "/"}: ${message}`).join("; "));
  const suiteIds = value.suites.map(({suite_id}) => suite_id);
  const pieceIds = value.pieces.map(({piece_id}) => piece_id);
  if (new Set(suiteIds).size !== suiteIds.length || new Set(pieceIds).size !== pieceIds.length) throw new DashboardError("Suite and piece IDs must be unique");
  const suites = new Map(value.suites.map((suite) => [suite.suite_id, suite]));
  for (const piece of value.pieces) {
    if (!suites.get(piece.suite_id)?.piece_ids.includes(piece.piece_id)) throw new DashboardError(`Piece ${piece.piece_id} is not owned by suite ${piece.suite_id}`);
    const keys = piece.publications.map(({review_id, channel}) => `${review_id}:${channel}`);
    if (new Set(keys).size !== keys.length) throw new DashboardError(`Piece ${piece.piece_id} has duplicate publication review/channel entries`);
    for (const publication of piece.publications) {
      if (!publication.published && (publication.url !== null || publication.published_at !== null)) throw new DashboardError("Unpublished entries cannot retain URL or date");
      if (publication.url !== null) {
        let parsed; try { parsed = new URL(publication.url); } catch { throw new DashboardError("Publication URL must be a valid HTTP(S) URL"); }
        if (!["http:", "https:"].includes(parsed.protocol) || !parsed.hostname) throw new DashboardError("Publication URL must be a valid HTTP(S) URL");
      }
      for (const [label, instant] of [["updated_at", publication.updated_at], ["published_at", publication.published_at]]) if (instant !== null && (Number.isNaN(Date.parse(instant)) || new Date(instant).toISOString() !== instant)) throw new DashboardError(`Publication ${label} must be an exact ISO 8601 instant`);
    }
    for (const artifact of [...piece.previews, ...piece.exports]) {
      const segments = artifact.path.split("/");
      if (!artifact.path || artifact.path.startsWith("/") || artifact.path.includes("\\") || artifact.path.includes("\0") || artifact.path.includes(":") || segments.some((segment) => !segment || segment === "." || segment === "..")) throw new DashboardError("Artifact paths must be portable project-relative paths");
    }
  }
  return value;
}

async function pathFor(projectRoot) {
  const directory = await resolveConsumerPath(projectRoot, ".keelokit/studio");
  await mkdir(directory, {recursive: true});
  return resolve(directory, "dashboard.json");
}

export function createDashboard({projectId, suites, pieces, recommendations = [], now = new Date().toISOString()}) {
  return assertDashboard({schema_version: 1, revision: 0, project_id: projectId, suites: structuredClone(suites), pieces: pieces.map((piece) => ({piece_id: piece.piece_id, suite_id: piece.suite_id, title: piece.title, status: piece.status ?? "draft", blockers: [...(piece.blockers ?? [])], previews: [...(piece.previews ?? [])], exports: [...(piece.exports ?? [])], history: [...(piece.history ?? [])], publications: [...(piece.publications ?? [])]})), recommendations: structuredClone(recommendations), updated_at: now});
}

export async function initializeDashboard(projectRoot, dashboard) {
  assertDashboard(dashboard);
  const destination = await pathFor(projectRoot);
  await writeFile(destination, `${JSON.stringify(dashboard, null, 2)}\n`, {flag: "wx", mode: 0o600});
  return destination;
}

export async function loadDashboard(projectRoot) { return assertDashboard(JSON.parse(await readFile(await pathFor(projectRoot), "utf8"))); }

export async function saveDashboard(projectRoot, dashboard) {
  assertDashboard(dashboard);
  const destination = await pathFor(projectRoot);
  const database = new DatabaseSync(`${destination}.lock.sqlite`, {timeout: 0});
  let temporary;
  try {
    database.exec("BEGIN IMMEDIATE");
    const current = await loadDashboard(projectRoot);
    if (current.revision !== dashboard.revision) throw new DashboardError("Dashboard revision changed; reload before saving");
    const next = {...structuredClone(dashboard), revision: dashboard.revision + 1};
    assertDashboard(next);
    temporary = `${destination}.${process.pid}.${randomUUID()}.tmp`;
    await writeFile(temporary, `${JSON.stringify(next, null, 2)}\n`, {flag: "wx", mode: 0o600});
    await rename(temporary, destination);
    temporary = null;
    return next;
  } finally {
    database.exec("ROLLBACK"); database.close();
    if (temporary) await unlink(temporary).catch(() => {});
  }
}

export function setPublication(dashboard, {pieceId, reviewId, channel, published, url = null, publishedAt = null, updatedAt = new Date().toISOString()}) {
  assertDashboard(dashboard);
  if (typeof published !== "boolean" || typeof reviewId !== "string" || !reviewId || typeof channel !== "string" || !channel) throw new DashboardError("Publication update requires review, channel and explicit boolean");
  if (!published) { url = null; publishedAt = null; }
  const next = structuredClone(dashboard);
  const piece = next.pieces.find(({piece_id}) => piece_id === pieceId);
  if (!piece) throw new DashboardError(`Unknown piece ${pieceId}`);
  const index = piece.publications.findIndex((item) => item.review_id === reviewId && item.channel === channel);
  if (index === -1) throw new DashboardError("Publication review/channel must already be configured for the piece");
  const entry = {review_id: reviewId, channel, published, url, published_at: publishedAt, updated_at: updatedAt};
  piece.publications[index] = entry;
  piece.history.push({revision_id: stableId("revision", {pieceId, reviewId, channel, published, url, publishedAt, updatedAt}), kind: "publication", status: published ? "published" : "unpublished", recorded_at: updatedAt, details: {review_id: reviewId, channel, url, published_at: publishedAt}});
  next.updated_at = updatedAt;
  return assertDashboard(next);
}
