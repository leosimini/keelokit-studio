import Ajv2020 from "ajv/dist/2020.js";
import {readFile} from "node:fs/promises";
import {resolve} from "node:path";
import {stableId} from "../core/ids.mjs";

const schema = JSON.parse(await readFile(resolve(import.meta.dirname, "../../schemas/v1/measurement-report.schema.json"), "utf8"));
const validate = new Ajv2020({allErrors: true, strict: false}).compile(schema);

export class MeasurementError extends Error {}

export function measureWav(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 44 || buffer.toString("ascii", 0, 4) !== "RIFF" || buffer.toString("ascii", 8, 12) !== "WAVE") throw new MeasurementError("Audio is not a supported RIFF/WAVE file");
  let offset = 12;
  let byteRate;
  let dataBytes;
  while (offset + 8 <= buffer.length) {
    const type = buffer.toString("ascii", offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    const end = offset + 8 + size;
    if (end > buffer.length) throw new MeasurementError("WAVE file contains a partial chunk");
    if (type === "fmt " && size >= 16) byteRate = buffer.readUInt32LE(offset + 8 + 8);
    if (type === "data") dataBytes = size;
    offset = end + (size % 2);
  }
  if (!byteRate || dataBytes === undefined) throw new MeasurementError("WAVE file is missing measurable format or data chunks");
  return {duration_seconds: dataBytes / byteRate, bytes: buffer.length, format: "audio/wav"};
}

function issue(code, severity, subject, message) { return {code, severity, subject, message}; }

function checkCaptions(captions, alignment, duration, tolerance) {
  const issues = [];
  const measured = captions.map((caption, index) => {
    if (!caption || typeof caption.text !== "string" || !Number.isFinite(caption.start_seconds) || !Number.isFinite(caption.end_seconds) || caption.start_seconds < 0 || caption.end_seconds <= caption.start_seconds) throw new MeasurementError(`Invalid caption at index ${index}`);
    if (caption.end_seconds > duration + tolerance) issues.push(issue("caption-outside-media", "blocker", caption.caption_id, "Caption ends after the measured media duration"));
    const aligned = alignment?.find((word) => Math.abs(word.start_seconds - caption.start_seconds) <= tolerance && Math.abs(word.end_seconds - caption.end_seconds) <= tolerance);
    if (alignment && !aligned) issues.push(issue("caption-audio-misalignment", "warning", caption.caption_id, "Caption timing does not match supplied audio alignment within configured tolerance"));
    return {...caption, timing_source: caption.timing_source};
  });
  return {measured, issues};
}

function checkLayouts(layouts, constraints) {
  const issues = [];
  const measured = layouts.map((layout, index) => {
    for (const field of ["x", "y", "width", "height", "viewport_width", "viewport_height", "font_px"]) if (!Number.isFinite(layout[field])) throw new MeasurementError(`Invalid layout ${field} at index ${index}`);
    const subject = layout.element_id;
    if (layout.x < 0 || layout.y < 0 || layout.x + layout.width > layout.viewport_width || layout.y + layout.height > layout.viewport_height) issues.push(issue("layout-clipped", "blocker", subject, "Element bounds extend outside the measured viewport"));
    const margin = constraints.safe_margin_px;
    if (layout.x < margin || layout.y < margin || layout.x + layout.width > layout.viewport_width - margin || layout.y + layout.height > layout.viewport_height - margin) issues.push(issue("layout-unsafe-placement", "warning", subject, "Element intersects the configured safe margin"));
    if (layout.font_px < constraints.minimum_text_px) issues.push(issue("layout-text-small", "warning", subject, "Text is smaller than the configured project threshold"));
    return structuredClone(layout);
  });
  return {measured, issues};
}

export function measureMedia({pieceId, artifact, audio = null, alignment = null, captions = [], layouts = [], constraints}) {
  if (!pieceId || !artifact?.artifact_id || !Number.isFinite(artifact.duration_seconds) || artifact.duration_seconds <= 0) throw new MeasurementError("Measured artifact identity and duration are required");
  if (!constraints || !Number.isFinite(constraints.caption_tolerance_seconds) || constraints.caption_tolerance_seconds < 0 || !Number.isFinite(constraints.safe_margin_px) || constraints.safe_margin_px < 0 || !Number.isFinite(constraints.minimum_text_px) || constraints.minimum_text_px <= 0) throw new MeasurementError("Explicit non-negative caption/layout constraints are required");
  const issues = [];
  let audioMeasurement = {status: "not-present", duration_seconds: null, format: null, bytes: null};
  const capabilities = {audio_measurement: audio === null ? "not-required" : "available", frame_coverage: layouts.length ? "sampled" : "not-run"};
  if (audio !== null) {
    try {
      const measured = measureWav(audio);
      audioMeasurement = {status: "measured", ...measured};
      if (measured.duration_seconds > artifact.duration_seconds + constraints.caption_tolerance_seconds) issues.push(issue("audio-truncated", "blocker", artifact.artifact_id, "Measured audio is longer than the rendered artifact; narration must not be silently truncated"));
    } catch (error) {
      capabilities.audio_measurement = "unavailable";
      audioMeasurement = {status: "unmeasured", duration_seconds: null, format: null, bytes: audio?.length ?? null};
      issues.push(issue("audio-unmeasured", "blocker", artifact.artifact_id, error.message));
    }
  }
  const captionResult = checkCaptions(captions, alignment, audioMeasurement.duration_seconds ?? artifact.duration_seconds, constraints.caption_tolerance_seconds);
  const layoutResult = checkLayouts(layouts, constraints);
  issues.push(...captionResult.issues, ...layoutResult.issues);
  if (artifact.kind === "video" && layouts.length === 0) issues.push(issue("frame-coverage-missing", "blocker", artifact.artifact_id, "No sampled frames were measured; a video that was never inspected frame by frame cannot be reported as clean"));
  if (artifact.kind === "video" && audio === null && artifact.has_narration === true) issues.push(issue("narration-silent", "blocker", artifact.artifact_id, "The storyboard has narration but the video carries no measured audio"));
  const body = {
    schema_version: 1,
    piece_id: pieceId,
    artifact_id: artifact.artifact_id,
    duration_seconds: artifact.duration_seconds,
    audio: audioMeasurement,
    captions: captionResult.measured,
    layouts: layoutResult.measured,
    issues,
    capabilities,
    limits: ["Mechanical measurements do not establish accessibility or perceptual quality", "Sampled layout bounds do not prove that unsampled frames are defect-free"]
  };
  const report = {...body, measurement_id: stableId("measurement", body)};
  if (!validate(report)) throw new MeasurementError((validate.errors ?? []).map(({instancePath, message}) => `${instancePath}: ${message}`).join("; "));
  return report;
}
