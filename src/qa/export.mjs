import Ajv2020 from "ajv/dist/2020.js";
import {createHash} from "node:crypto";
import {readFile} from "node:fs/promises";
import {resolve} from "node:path";
import {inflateSync} from "node:zlib";
import {stableId} from "../core/ids.mjs";
import {measureWav} from "./measure.mjs";

const root = resolve(import.meta.dirname, "../../schemas/v1");
const ajv = new Ajv2020({allErrors: true, strict: false});
const validateExport = ajv.compile(JSON.parse(await readFile(resolve(root, "export-manifest.schema.json"), "utf8")));
const validateQa = ajv.compile(JSON.parse(await readFile(resolve(root, "qa-report.schema.json"), "utf8")));

export class ExportQaError extends Error {}

function pngDimensions(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 45 || bytes.toString("hex", 0, 8) !== "89504e470d0a1a0a") throw new ExportQaError("PNG is missing or undecodable");
  let offset = 8;
  let width;
  let height;
  let bitDepth;
  let colorType;
  let interlace;
  const idat = [];
  let ended = false;
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.toString("ascii", offset + 4, offset + 8);
    const end = offset + 12 + length;
    if (end > bytes.length) throw new ExportQaError("PNG contains a partial chunk");
    if (type === "IHDR") {
      if (offset !== 8 || length !== 13) throw new ExportQaError("PNG has an invalid IHDR chunk");
      width = bytes.readUInt32BE(offset + 8);
      height = bytes.readUInt32BE(offset + 12);
      bitDepth = bytes[offset + 16];
      colorType = bytes[offset + 17];
      if (bytes[offset + 18] !== 0 || bytes[offset + 19] !== 0 || ![0, 1].includes(bytes[offset + 20])) throw new ExportQaError("PNG uses unsupported compression, filter, or interlace metadata");
      interlace = bytes[offset + 20];
    } else if (type === "IDAT") idat.push(bytes.subarray(offset + 8, offset + 8 + length));
    else if (type === "IEND") {
      if (length !== 0 || end !== bytes.length) throw new ExportQaError("PNG has an invalid or non-terminal IEND chunk");
      ended = true;
    }
    offset = end;
    if (ended) break;
  }
  if (!width || !height || !ended || idat.length === 0) throw new ExportQaError("PNG is incomplete or undecodable");
  const channels = new Map([[0, 1], [2, 3], [3, 1], [4, 2], [6, 4]]).get(colorType);
  const allowedDepths = {0: [1, 2, 4, 8, 16], 2: [8, 16], 3: [1, 2, 4, 8], 4: [8, 16], 6: [8, 16]}[colorType];
  if (!channels || !allowedDepths.includes(bitDepth)) throw new ExportQaError("PNG has an invalid color type or bit depth");
  const passBytes = (startX, startY, stepX, stepY) => {
    const passWidth = width <= startX ? 0 : Math.ceil((width - startX) / stepX);
    const passHeight = height <= startY ? 0 : Math.ceil((height - startY) / stepY);
    return passWidth === 0 || passHeight === 0 ? 0 : (Math.ceil(passWidth * channels * bitDepth / 8) + 1) * passHeight;
  };
  const expectedBytes = interlace === 0
    ? passBytes(0, 0, 1, 1)
    : [[0, 0, 8, 8], [4, 0, 8, 8], [0, 4, 4, 8], [2, 0, 4, 4], [0, 2, 2, 4], [1, 0, 2, 2], [0, 1, 1, 2]].reduce((sum, pass) => sum + passBytes(...pass), 0);
  try { if (inflateSync(Buffer.concat(idat)).length !== expectedBytes) throw new Error("partial raster"); } catch { throw new ExportQaError("PNG image data is incomplete or undecodable"); }
  return {width, height};
}

function subtitles(bytes, contentType) {
  const text = bytes.toString("utf8");
  if (contentType === "text/vtt" && !/^WEBVTT(?:\r?\n)/.test(text)) throw new ExportQaError("VTT is undecodable");
  if (contentType === "application/x-subrip" && !/\d+\r?\n\d\d:\d\d:\d\d,\d{3} --> \d\d:\d\d:\d\d,\d{3}/.test(text)) throw new ExportQaError("SRT is undecodable");
  return {characters: text.length};
}

// Counts the video and audio tracks declared in the moov box, by handler type.
function mp4Tracks(bytes) {
  const counts = {video: 0, audio: 0};
  const walk = (start, end, path) => {
    for (let offset = start; offset + 8 <= end;) {
      const size = bytes.readUInt32BE(offset);
      if (size < 8 || offset + size > end) return;
      const type = bytes.toString("latin1", offset + 4, offset + 8);
      if (["moov", "trak", "mdia"].includes(type)) walk(offset + 8, offset + size, [...path, type]);
      if (type === "hdlr" && path.at(-1) === "mdia") {
        const handler = bytes.toString("latin1", offset + 16, offset + 20);
        if (handler === "vide") counts.video += 1;
        if (handler === "soun") counts.audio += 1;
      }
      offset += size;
    }
  };
  walk(0, bytes.length, []);
  return counts;
}

function assertMp4Structure(bytes) {
  const types = [];
  for (let offset = 0; offset + 8 <= bytes.length;) {
    const size = bytes.readUInt32BE(offset);
    if (size < 8 || offset + size > bytes.length) throw new ExportQaError("MP4 box structure is truncated or corrupt");
    types.push(bytes.toString("latin1", offset + 4, offset + 8));
    offset += size;
  }
  if (types[0] !== "ftyp" || !types.includes("moov")) throw new ExportQaError("MP4 requires an ftyp header and a moov box");
}

function inspectArtifact(artifact) {
  if (!artifact || typeof artifact.variant !== "string" || !artifact.variant || !Buffer.isBuffer(artifact.bytes) || artifact.bytes.length === 0 || typeof artifact.content_type !== "string") throw new ExportQaError("Export artifact requires variant, content type and non-empty bytes");
  let media = {};
  if (artifact.content_type === "image/png") media = pngDimensions(artifact.bytes);
  else if (artifact.content_type === "audio/wav") media = measureWav(artifact.bytes);
  else if (["text/vtt", "application/x-subrip"].includes(artifact.content_type)) media = subtitles(artifact.bytes, artifact.content_type);
  else if (artifact.probe?.decodable === true) {
    if (artifact.content_type !== "video/mp4") throw new ExportQaError(`No structural container check exists for ${artifact.content_type}`);
    assertMp4Structure(artifact.bytes);
    const tracks = mp4Tracks(artifact.bytes);
    if (tracks.video === 0) throw new ExportQaError("MP4 has no video track");
    if (artifact.expects_audio === true && tracks.audio === 0) throw new ExportQaError("The piece has narration or music but the MP4 has no audio track");
    media = {width: artifact.probe.width ?? null, height: artifact.probe.height ?? null, duration_seconds: artifact.probe.duration_seconds ?? null, video_tracks: tracks.video, audio_tracks: tracks.audio};
  }
  else throw new ExportQaError(`No decodability measurement is available for ${artifact.content_type}`);
  return {variant: artifact.variant, content_type: artifact.content_type, sha256: createHash("sha256").update(artifact.bytes).digest("hex"), bytes: artifact.bytes.length, ...media};
}

export function createExportManifest({pieceId, source, requestedVariants, artifacts}) {
  if (typeof source?.render_id !== "string" || !source.render_id || !/^sha256:[a-f0-9]{64}$/.test(source?.storyboard_hash ?? "")) throw new ExportQaError("An export must name the render_id and storyboard_hash it was produced from");
  if (typeof pieceId !== "string" || !pieceId || !Array.isArray(requestedVariants) || requestedVariants.length === 0 || new Set(requestedVariants).size !== requestedVariants.length) throw new ExportQaError("Piece and unique requested variants are required");
  if (!Array.isArray(artifacts)) throw new ExportQaError("artifacts must be an array");
  const checks = [];
  const inspected = [];
  const byVariant = new Map();
  for (const artifact of artifacts) {
    if (byVariant.has(artifact.variant)) throw new ExportQaError(`Duplicate export variant ${artifact.variant}`);
    byVariant.set(artifact.variant, artifact);
  }
  for (const variant of requestedVariants) {
    const artifact = byVariant.get(variant);
    if (!artifact) { checks.push({check: "requested-variant", subject: variant, status: "failed", detail: "Requested artifact is missing"}); continue; }
    try {
      const result = inspectArtifact(artifact);
      inspected.push(result);
      checks.push({check: "presence-format-decodability", subject: variant, status: "passed", detail: `${result.content_type}; ${result.bytes} bytes`});
    } catch (error) {
      checks.push({check: "presence-format-decodability", subject: variant, status: "failed", detail: error.message});
    }
  }
  for (const variant of byVariant.keys()) if (!requestedVariants.includes(variant)) checks.push({check: "requested-scope", subject: variant, status: "failed", detail: "Unrequested artifact must not silently enter the package"});
  const identity = {piece_id: pieceId, source: {render_id: source.render_id, storyboard_hash: source.storyboard_hash}, requested_variants: requestedVariants, artifacts: inspected};
  const value = {schema_version: 1, export_manifest_id: stableId("export", identity), piece_id: pieceId, source: identity.source, requested_variants: [...requestedVariants], artifacts: inspected, mechanical_checks: checks, status: checks.every(({status}) => status === "passed") ? "passed" : "failed"};
  if (!validateExport(value)) throw new ExportQaError((validateExport.errors ?? []).map(({instancePath, message}) => `${instancePath}: ${message}`).join("; "));
  return value;
}

export function createIndependentQaReport({manifest, reviewer, reviewedAt, observations, evidenceReviewed = [], reviewBlockers = [], completeMediaInspected}) {
  if (!manifest || typeof reviewer !== "string" || !reviewer || !Array.isArray(observations) || observations.length === 0 || observations.some((item) => !item || !["visual", "auditory"].includes(item.kind) || !["passed", "failed", "not-run"].includes(item.status) || typeof item.note !== "string" || !item.note)) throw new ExportQaError("Independent reviewer and typed visual/auditory observations with explicit status are required");
  if (typeof completeMediaInspected !== "boolean") throw new ExportQaError("completeMediaInspected must be explicit");
  if (typeof reviewedAt !== "string" || Number.isNaN(Date.parse(reviewedAt)) || new Date(reviewedAt).toISOString() !== reviewedAt) throw new ExportQaError("reviewedAt must be an exact ISO 8601 instant");
  const blockers = [...reviewBlockers];
  if (manifest.status !== "passed") blockers.push("Mechanical export checks failed");
  if (!completeMediaInspected) blockers.push("Complete media was not inspected");
  if (observations.some(({status}) => status === "not-run")) blockers.push("A required visual or auditory observation was not run");
  const limits = ["QA applies only to the recorded artifacts and inspection", "Mechanical checks do not certify factual accuracy, rights, accessibility or subjective quality"];
  const hasFailedObservation = observations.some(({status}) => status === "failed");
  const verdict = hasFailedObservation ? "fail" : blockers.length || !completeMediaInspected ? "limited" : "pass";
  const identity = {manifest_id: manifest.export_manifest_id, reviewer, reviewed_at: reviewedAt, complete_media_inspected: completeMediaInspected, observations, evidence_reviewed: evidenceReviewed, blockers, limits, verdict};
  const report = {schema_version: 1, qa_report_id: stableId("qa", identity), piece_id: manifest.piece_id, export_manifest_id: manifest.export_manifest_id, reviewer, reviewed_at: reviewedAt, complete_media_inspected: completeMediaInspected, mechanical_checks: manifest.mechanical_checks, observations: structuredClone(observations), evidence_reviewed: [...new Set(evidenceReviewed)], blockers: [...new Set(blockers)], limits, verdict};
  if (!validateQa(report)) throw new ExportQaError((validateQa.errors ?? []).map(({instancePath, message}) => `${instancePath}: ${message}`).join("; "));
  return report;
}

export function assertExportManifestIntegrity(manifest) {
  if (!validateExport(manifest)) throw new ExportQaError("Export manifest does not satisfy its contract");
  const expected = stableId("export", {piece_id: manifest.piece_id, source: manifest.source, requested_variants: manifest.requested_variants, artifacts: manifest.artifacts});
  const artifactVariants = manifest.artifacts.map(({variant}) => variant);
  const complete = artifactVariants.length === manifest.requested_variants.length && new Set(artifactVariants).size === artifactVariants.length && manifest.requested_variants.every((variant) => artifactVariants.includes(variant));
  const passed = complete && manifest.mechanical_checks.length === manifest.requested_variants.length && manifest.mechanical_checks.every(({status, subject}) => status === "passed" && manifest.requested_variants.includes(subject));
  if (manifest.export_manifest_id !== expected || manifest.status !== (passed ? "passed" : "failed")) throw new ExportQaError("Export manifest identity or status does not match its contents");
  return manifest;
}

export function assertQaReportIntegrity(report, manifest) {
  assertExportManifestIntegrity(manifest);
  if (!validateQa(report) || report.piece_id !== manifest.piece_id || report.export_manifest_id !== manifest.export_manifest_id) throw new ExportQaError("QA report does not satisfy its bound contract");
  const identity = {manifest_id: report.export_manifest_id, reviewer: report.reviewer, reviewed_at: report.reviewed_at, complete_media_inspected: report.complete_media_inspected, observations: report.observations, evidence_reviewed: report.evidence_reviewed, blockers: report.blockers, limits: report.limits, verdict: report.verdict};
  if (report.qa_report_id !== stableId("qa", identity)) throw new ExportQaError("QA report identity does not match its contents");
  const expected = report.observations.some(({status}) => status === "failed") ? "fail" : (!report.complete_media_inspected || report.blockers.length || report.observations.some(({status}) => status === "not-run") || manifest.status !== "passed") ? "limited" : "pass";
  if (report.verdict !== expected || (report.verdict === "pass" && (!report.mechanical_checks.every(({status}) => status === "passed") || JSON.stringify(report.mechanical_checks) !== JSON.stringify(manifest.mechanical_checks)))) throw new ExportQaError("QA verdict is inconsistent with inspection or mechanical checks");
  return report;
}
