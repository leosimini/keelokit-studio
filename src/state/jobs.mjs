import {randomUUID} from "node:crypto";
import {contentHash, stableId} from "../core/ids.mjs";
import {assertValidState} from "./store.mjs";

export class JobError extends Error {}

export function preparePaidJob(state, {provider, operation, requestIdentity, estimatedCost, currency, maxAttempts}) {
  assertValidState(state);
  if (typeof provider !== "string" || !provider || typeof operation !== "string" || !operation || !Number.isFinite(estimatedCost) || estimatedCost < 0 || typeof currency !== "string" || !currency || !Number.isInteger(maxAttempts) || maxAttempts < 1) throw new JobError("Provider, operation, non-negative estimate, currency and positive maxAttempts are required");
  const requestHash = contentHash(requestIdentity);
  const existing = state.jobs.find((job) => job.provider === provider && job.operation === operation && job.request_hash === requestHash);
  if (existing?.status === "succeeded") return {action: "reuse", request_hash: requestHash, job: structuredClone(existing)};
  if (existing?.status === "uncertain") return {action: "query-required", request_hash: requestHash, job: structuredClone(existing)};
  if (["submitted", "running"].includes(existing?.status)) return {action: "wait", request_hash: requestHash, job: structuredClone(existing)};
  if (existing && existing.known_cost === null && (existing.reserved_cost ?? 0) > 0) return {action: "blocked", reason: "prior attempt cost must be reconciled before retry", request_hash: requestHash, job: structuredClone(existing)};
  if (existing && existing.attempts >= maxAttempts) return {action: "blocked", reason: "maximum attempts reached", request_hash: requestHash, job: structuredClone(existing)};
  if (state.costs.currency !== null && state.costs.currency !== currency) return {action: "blocked", reason: "budget currency mismatch", request_hash: requestHash};
  if (state.costs.approved_limit === null) return {action: "blocked", reason: "approved budget is missing", request_hash: requestHash};
  if (state.jobs.some((job) => ["submitted", "uncertain", "running"].includes(job.status) && job.reserved_cost === undefined)) return {action: "blocked", reason: "a pending job has an unknown budget reservation", request_hash: requestHash};
  const reserved = state.jobs.reduce((sum, job) => sum + (job.reserved_cost ?? 0), 0);
  if (state.costs.known_total + reserved + estimatedCost > state.costs.approved_limit) return {action: "blocked", reason: "approved budget would be exceeded", request_hash: requestHash};
  return {action: "submit", request_hash: requestHash, job: existing ? structuredClone(existing) : null};
}

export function recordJobResult(state, {provider, operation, requestHash, status, providerJobId = null, knownCost = null, reservedCost = null, currency = null, source, recordedAt = new Date().toISOString()}) {
  assertValidState(state);
  if (!new Set(["submitted", "uncertain", "running", "succeeded", "failed"]).has(status) || !new Set(["submission", "query"]).has(source)) throw new JobError("Supported status and result source are required");
  if (!/^sha256:[a-f0-9]{64}$/.test(requestHash) || typeof provider !== "string" || !provider || typeof operation !== "string" || !operation) throw new JobError("Exact job identity is required");
  if (knownCost !== null && (!Number.isFinite(knownCost) || knownCost < 0)) throw new JobError("knownCost must be non-negative or null");
  if (reservedCost !== null && (!Number.isFinite(reservedCost) || reservedCost < 0)) throw new JobError("reservedCost must be non-negative or null");
  if (currency !== null && currency !== state.costs.currency) throw new JobError("Job reservation currency must match engagement budget");
  const next = structuredClone(state);
  let job = next.jobs.find((candidate) => candidate.provider === provider && candidate.operation === operation && candidate.request_hash === requestHash);
  if (job?.status === "uncertain" && source !== "query") throw new JobError("Uncertain jobs must be queried before any resubmission");
  if (source === "submission" && reservedCost === null) throw new JobError("Submissions require an explicit reservedCost");
  const previousCost = job?.known_cost ?? 0;
  if (!job) {
    job = {job_id: stableId("job", {provider, operation, requestHash}), provider, provider_job_id: null, operation, request_hash: requestHash, status: "prepared", attempts: 0, known_cost: null, reserved_cost: 0, currency: state.costs.currency};
    next.jobs.push(job);
  }
  if (source === "submission") job.attempts += 1;
  job.status = status;
  job.provider_job_id = providerJobId ?? job.provider_job_id;
  if (knownCost !== null && knownCost < previousCost) throw new JobError("Cumulative known job cost must not decrease");
  const cumulativeCost = knownCost ?? (job.known_cost ?? null);
  job.known_cost = cumulativeCost;
  if (knownCost !== null && !["submitted", "uncertain", "running"].includes(status)) job.reserved_cost = 0;
  else if (source === "submission") job.reserved_cost = (job.reserved_cost ?? 0) + reservedCost;
  else job.reserved_cost = job.reserved_cost ?? 0;
  job.currency = job.currency ?? currency ?? state.costs.currency;
  const costDelta = (cumulativeCost ?? 0) - previousCost;
  if (next.costs.known_total + costDelta < 0) throw new JobError("Job cost update would make known total negative");
  next.costs.known_total += costDelta;
  next.events.push({event_id: randomUUID(), type: "job.result-recorded", recorded_at: recordedAt, details: {job_id: job.job_id, status, source, known_cost: knownCost}});
  next.updated_at = recordedAt;
  return assertValidState(next);
}
