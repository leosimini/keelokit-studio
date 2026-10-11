import {stableId} from "../core/ids.mjs";

const sha = /^sha256:[a-f0-9]{64}$/;
export class PerformanceObservationError extends Error {}

export function createPerformanceObservation({projectId, pieceId, reviewId, channel, metric, value, unit, windowStart, windowEnd, recordedAt, provenance, limitations = []}) {
  for (const [label, item] of [["projectId", projectId], ["pieceId", pieceId], ["reviewId", reviewId], ["channel", channel], ["metric", metric], ["unit", unit]]) if (typeof item !== "string" || !item.trim()) throw new PerformanceObservationError(`${label} is required`);
  if (!Number.isFinite(value)) throw new PerformanceObservationError("Observed value must be finite");
  for (const [label, instant] of [["windowStart", windowStart], ["windowEnd", windowEnd], ["recordedAt", recordedAt]]) if (typeof instant !== "string" || Number.isNaN(Date.parse(instant)) || new Date(instant).toISOString() !== instant) throw new PerformanceObservationError(`${label} must be an exact ISO instant`);
  if (Date.parse(windowEnd) <= Date.parse(windowStart) || Date.parse(recordedAt) < Date.parse(windowEnd)) throw new PerformanceObservationError("Observation window and recording order are invalid");
  if (!provenance || typeof provenance.source_id !== "string" || !sha.test(provenance.source_hash) || typeof provenance.locator !== "string" || !provenance.locator || !["imported", "manual"].includes(provenance.method)) throw new PerformanceObservationError("Attributed provenance is required");
  if (!Array.isArray(limitations) || limitations.some((item) => typeof item !== "string" || !item)) throw new PerformanceObservationError("limitations must be explicit strings");
  const identity = {project_id: projectId, piece_id: pieceId, review_id: reviewId, channel, metric, value, unit, window_start: windowStart, window_end: windowEnd, recorded_at: recordedAt, provenance: structuredClone(provenance), limitations: [...limitations]};
  return {observation_id: stableId("performance", identity), ...identity};
}

export function assertPerformanceObservation(record) {
  const rebuilt = createPerformanceObservation({projectId: record?.project_id, pieceId: record?.piece_id, reviewId: record?.review_id, channel: record?.channel, metric: record?.metric, value: record?.value, unit: record?.unit, windowStart: record?.window_start, windowEnd: record?.window_end, recordedAt: record?.recorded_at, provenance: record?.provenance, limitations: record?.limitations});
  if (record.observation_id !== rebuilt.observation_id) throw new PerformanceObservationError("Performance observation identity does not match its contents");
  return record;
}
