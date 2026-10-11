import assert from "node:assert/strict";
import test from "node:test";
import {createExportManifest, createIndependentQaReport} from "../src/qa/export.mjs";

const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
const vtt = Buffer.from("WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nDone\n");

test("accounts for configured clean and caption exports with mechanical evidence", () => {
  const manifest = createExportManifest({pieceId: "piece-one", requestedVariants: ["clean-master", "captions-vtt"], artifacts: [{variant: "clean-master", content_type: "image/png", bytes: png}, {variant: "captions-vtt", content_type: "text/vtt", bytes: vtt}]});
  assert.equal(manifest.status, "passed");
  assert.deepEqual(manifest.artifacts.map(({variant}) => variant), ["clean-master", "captions-vtt"]);
  assert.equal(manifest.artifacts[0].width, 1);
});

test("fails missing, empty, partial, corrupt and unrequested artifacts", () => {
  const missing = createExportManifest({pieceId: "piece-one", requestedVariants: ["clean-master"], artifacts: []});
  const corrupt = createExportManifest({pieceId: "piece-one", requestedVariants: ["clean-master"], artifacts: [{variant: "clean-master", content_type: "image/png", bytes: Buffer.from("partial")}]});
  const truncated = createExportManifest({pieceId: "piece-one", requestedVariants: ["clean-master"], artifacts: [{variant: "clean-master", content_type: "image/png", bytes: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB", "base64")}]});
  const partialRaster = Buffer.from(png);
  partialRaster.writeUInt32BE(2, 16);
  const partialRasterManifest = createExportManifest({pieceId: "piece-one", requestedVariants: ["clean-master"], artifacts: [{variant: "clean-master", content_type: "image/png", bytes: partialRaster}]});
  const extra = createExportManifest({pieceId: "piece-one", requestedVariants: ["clean-master"], artifacts: [{variant: "clean-master", content_type: "image/png", bytes: png}, {variant: "extra", content_type: "image/png", bytes: png}]});
  assert.equal(missing.status, "failed");
  assert.equal(corrupt.status, "failed");
  assert.equal(truncated.status, "failed");
  assert.equal(partialRasterManifest.status, "failed");
  assert.equal(extra.status, "failed");
  const empty = createExportManifest({pieceId: "piece-one", requestedVariants: ["clean-master"], artifacts: [{variant: "clean-master", content_type: "image/png", bytes: Buffer.alloc(0)}]});
  assert.equal(empty.status, "failed");
});

test("keeps independent QA separate from successful rendering and export", () => {
  const manifest = createExportManifest({pieceId: "piece-one", requestedVariants: ["clean-master"], artifacts: [{variant: "clean-master", content_type: "image/png", bytes: png}]});
  const limited = createIndependentQaReport({manifest, reviewer: "independent-reviewer", reviewedAt: "2026-10-11T15:00:00.000Z", observations: [{kind: "visual", status: "not-run", note: "Only export completion was observed"}], reviewBlockers: ["Evidence claims remain unreviewed"], completeMediaInspected: false});
  assert.equal(limited.verdict, "limited");
  assert.ok(limited.blockers.includes("Evidence claims remain unreviewed"));
  assert.ok(limited.blockers.includes("Complete media was not inspected"));
});

test("records a pass only after complete independent observation without blockers", () => {
  const manifest = createExportManifest({pieceId: "piece-one", requestedVariants: ["clean-master"], artifacts: [{variant: "clean-master", content_type: "image/png", bytes: png}]});
  const report = createIndependentQaReport({manifest, reviewer: "independent-reviewer", reviewedAt: "2026-10-11T15:00:00.000Z", observations: [{kind: "visual", status: "passed", note: "Complete one-frame artifact inspected"}], evidenceReviewed: ["evidence-one"], completeMediaInspected: true});
  assert.equal(report.verdict, "pass");
});

test("cannot pass QA without a completed observation", () => {
  const manifest = createExportManifest({pieceId: "piece-one", requestedVariants: ["clean-master"], artifacts: [{variant: "clean-master", content_type: "image/png", bytes: png}]});
  assert.throws(() => createIndependentQaReport({manifest, reviewer: "reviewer", reviewedAt: "2026-10-11T15:00:00.000Z", observations: [], completeMediaInspected: true}), /observations/);
  const notRun = createIndependentQaReport({manifest, reviewer: "reviewer", reviewedAt: "2026-10-11T15:00:00.000Z", observations: [{kind: "visual", status: "not-run", note: "Not inspected"}], completeMediaInspected: true});
  assert.equal(notRun.verdict, "limited");
});

function box(type, payload = Buffer.alloc(0)) {
  const header = Buffer.alloc(8);
  header.writeUInt32BE(8 + payload.length, 0);
  header.write(type, 4, "latin1");
  return Buffer.concat([header, payload]);
}

test("does not trust a self-declared probe for bytes that are not the declared container", () => {
  const probe = {decodable: true, width: 1920, height: 1080, duration_seconds: 10};
  const fake = createExportManifest({pieceId: "piece-one", requestedVariants: ["video"], artifacts: [{variant: "video", content_type: "video/mp4", bytes: Buffer.from("NOT A VIDEO"), probe}]});
  assert.equal(fake.status, "failed");
  const withoutMoov = createExportManifest({pieceId: "piece-one", requestedVariants: ["video"], artifacts: [{variant: "video", content_type: "video/mp4", bytes: Buffer.concat([box("ftyp", Buffer.from("isom0000")), box("mdat", Buffer.alloc(16))]), probe}]});
  assert.equal(withoutMoov.status, "failed");
  const structural = createExportManifest({pieceId: "piece-one", requestedVariants: ["video"], artifacts: [{variant: "video", content_type: "video/mp4", bytes: Buffer.concat([box("ftyp", Buffer.from("isom0000")), box("mdat", Buffer.alloc(16)), box("moov", Buffer.alloc(8))]), probe}]});
  assert.equal(structural.status, "passed");
});
