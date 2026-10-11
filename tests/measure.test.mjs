import assert from "node:assert/strict";
import test from "node:test";
import {measureMedia, measureWav, MeasurementError} from "../src/qa/measure.mjs";

function wav(seconds, sampleRate = 8000) {
  const dataSize = seconds * sampleRate * 2;
  const value = Buffer.alloc(44 + dataSize);
  value.write("RIFF", 0); value.writeUInt32LE(36 + dataSize, 4); value.write("WAVE", 8);
  value.write("fmt ", 12); value.writeUInt32LE(16, 16); value.writeUInt16LE(1, 20); value.writeUInt16LE(1, 22); value.writeUInt32LE(sampleRate, 24); value.writeUInt32LE(sampleRate * 2, 28); value.writeUInt16LE(2, 32); value.writeUInt16LE(16, 34);
  value.write("data", 36); value.writeUInt32LE(dataSize, 40);
  return value;
}

const constraints = {caption_tolerance_seconds: 0.1, safe_margin_px: 20, minimum_text_px: 16};
const artifact = {artifact_id: "render-one", duration_seconds: 2};

test("measures real WAVE bytes and aligned captions", () => {
  assert.equal(measureWav(wav(1)).duration_seconds, 1);
  const report = measureMedia({pieceId: "piece-one", artifact, audio: wav(1), alignment: [{start_seconds: 0, end_seconds: 1, text: "Done"}], captions: [{caption_id: "caption-one", start_seconds: 0, end_seconds: 1, text: "Done", timing_source: "voice-alignment"}], layouts: [{element_id: "title", x: 30, y: 30, width: 100, height: 30, viewport_width: 320, viewport_height: 180, font_px: 18}], constraints});
  assert.equal(report.audio.status, "measured");
  assert.deepEqual(report.issues, []);
  assert.equal(report.capabilities.frame_coverage, "sampled");
});

test("reports long audio, caption drift, clipping, unsafe bounds and small text", () => {
  const report = measureMedia({pieceId: "piece-one", artifact, audio: wav(3), alignment: [{start_seconds: 0, end_seconds: 1, text: "Different"}], captions: [{caption_id: "caption-one", start_seconds: 1.5, end_seconds: 2.5, text: "Late", timing_source: "configured"}], layouts: [{element_id: "body", x: -1, y: 5, width: 400, height: 40, viewport_width: 320, viewport_height: 180, font_px: 10}], constraints});
  assert.deepEqual(new Set(report.issues.map(({code}) => code)), new Set(["audio-truncated", "caption-audio-misalignment", "layout-clipped", "layout-unsafe-placement", "layout-text-small"]));
});

test("declares missing measurement capability and never infers duration from words", () => {
  const report = measureMedia({pieceId: "piece-one", artifact, audio: Buffer.from("not-wave"), captions: [], layouts: [], constraints});
  assert.equal(report.capabilities.audio_measurement, "unavailable");
  assert.equal(report.issues[0].code, "audio-unmeasured");
  assert.throws(() => measureWav(Buffer.from("short")), MeasurementError);
});

test("rejects invalid timing and requires project constraints", () => {
  assert.throws(() => measureMedia({pieceId: "piece-one", artifact, constraints: null}), /constraints/);
  assert.throws(() => measureMedia({pieceId: "piece-one", artifact, captions: [{caption_id: "bad", start_seconds: 2, end_seconds: 1, text: "Bad", timing_source: "configured"}], constraints}), /Invalid caption/);
});

test("a video with no sampled frames or missing narration audio is a blocker, not a clean report", () => {
  const constraints = {caption_tolerance_seconds: 0.2, safe_margin_px: 16, minimum_text_px: 14};
  const report = measureMedia({pieceId: "piece-one", artifact: {artifact_id: "video-one", duration_seconds: 5, kind: "video", has_narration: true}, constraints});
  assert.deepEqual(report.issues.map(({code}) => code).sort(), ["frame-coverage-missing", "narration-silent"]);
});
