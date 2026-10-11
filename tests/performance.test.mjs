import assert from "node:assert/strict";
import test from "node:test";
import {assertPerformanceObservation, createPerformanceObservation, PerformanceObservationError} from "../src/agency/performance.mjs";

const input = {projectId: "product-one", pieceId: "piece-one", reviewId: "review-one", channel: "youtube", metric: "intro-retention", value: 0.61, unit: "ratio", windowStart: "2026-09-01T00:00:00.000Z", windowEnd: "2026-10-01T00:00:00.000Z", recordedAt: "2026-10-02T00:00:00.000Z", provenance: {source_id: "youtube-export", source_hash: `sha256:${"a".repeat(64)}`, locator: "video row / intro retention", method: "imported"}, limitations: ["Platform-defined metric"]};

test("creates attributed observed outcomes without turning them into predictions", () => {
  const observation = createPerformanceObservation(input);
  assert.equal(assertPerformanceObservation(observation), observation);
  assert.match(observation.observation_id, /^performance-/);
  assert.equal(observation.value, 0.61);
});

test("rejects invalid windows, missing provenance and forged values", () => {
  assert.throws(() => createPerformanceObservation({...input, windowEnd: input.windowStart}), PerformanceObservationError);
  assert.throws(() => createPerformanceObservation({...input, provenance: null}), /provenance/);
  const forged = createPerformanceObservation(input); forged.value = 0.99;
  assert.throws(() => assertPerformanceObservation(forged), /identity/);
});
