import assert from "node:assert/strict";
import test from "node:test";
import {createInitialState} from "../src/state/store.mjs";
import {preparePaidJob, recordJobResult} from "../src/state/jobs.mjs";

function budgeted(limit = 1) {
  const state = createInitialState("project-one");
  state.costs = {currency: "USD", approved_limit: limit, known_total: 0};
  return state;
}
const requestIdentity = {text: "Approved narration", model: "configured-model"};
const options = {provider: "configured-provider", operation: "voice", requestIdentity, estimatedCost: 0.25, currency: "USD", maxAttempts: 2};

test("guards spend and reuses a successful persisted job", () => {
  let state = budgeted();
  const prepared = preparePaidJob(state, options);
  assert.equal(prepared.action, "submit");
  state = recordJobResult(state, {provider: options.provider, operation: options.operation, requestHash: prepared.request_hash, status: "succeeded", providerJobId: "provider-one", knownCost: 0.2, reservedCost: 0.25, currency: "USD", source: "submission"});
  assert.equal(state.costs.known_total, 0.2);
  assert.equal(preparePaidJob(state, options).action, "reuse");
  assert.equal(preparePaidJob(budgeted(0.1), options).action, "blocked");
});

test("requires query before resubmitting an uncertain paid job", () => {
  let state = budgeted();
  const prepared = preparePaidJob(state, options);
  state = recordJobResult(state, {provider: options.provider, operation: options.operation, requestHash: prepared.request_hash, status: "uncertain", providerJobId: "provider-uncertain", reservedCost: 0.25, currency: "USD", source: "submission"});
  assert.equal(preparePaidJob(state, options).action, "query-required");
  assert.throws(() => recordJobResult(state, {provider: options.provider, operation: options.operation, requestHash: prepared.request_hash, status: "submitted", source: "submission"}), /queried/);
  state = recordJobResult(state, {provider: options.provider, operation: options.operation, requestHash: prepared.request_hash, status: "failed", providerJobId: "provider-uncertain", knownCost: 0.05, source: "query"});
  assert.equal(preparePaidJob(state, options).action, "submit");
});

test("enforces attempt and currency limits without touching unrelated jobs", () => {
  let state = budgeted();
  const prepared = preparePaidJob(state, {...options, maxAttempts: 1});
  state = recordJobResult(state, {provider: options.provider, operation: options.operation, requestHash: prepared.request_hash, status: "failed", reservedCost: 0, currency: "USD", source: "submission"});
  assert.equal(preparePaidJob(state, {...options, maxAttempts: 1}).action, "blocked");
  assert.equal(preparePaidJob(state, {...options, operation: "capture"}).action, "submit");
  assert.equal(preparePaidJob(state, {...options, currency: "EUR"}).action, "blocked");
});

test("waits for active jobs and reserves pending spend", () => {
  let state = budgeted(0.4);
  const prepared = preparePaidJob(state, options);
  state = recordJobResult(state, {provider: options.provider, operation: options.operation, requestHash: prepared.request_hash, status: "running", providerJobId: "active", reservedCost: 0.25, currency: "USD", source: "submission"});
  assert.equal(preparePaidJob(state, options).action, "wait");
  assert.equal(preparePaidJob(state, {...options, operation: "other"}).action, "blocked");
});

test("keeps reservation and provider handle until an unknown terminal cost is reconciled", () => {
  let state = budgeted(1);
  const first = preparePaidJob(state, {...options, estimatedCost: 0.75});
  state = recordJobResult(state, {provider: options.provider, operation: options.operation, requestHash: first.request_hash, status: "uncertain", providerJobId: "recoverable", reservedCost: 0.75, currency: "USD", source: "submission"});
  state = recordJobResult(state, {provider: options.provider, operation: options.operation, requestHash: first.request_hash, status: "succeeded", knownCost: null, source: "query"});
  assert.equal(state.jobs[0].provider_job_id, "recoverable");
  assert.equal(state.jobs[0].reserved_cost, 0.75);
  assert.equal(preparePaidJob(state, {...options, operation: "other", requestIdentity: {other: true}, estimatedCost: 0.75}).action, "blocked");
  state = recordJobResult(state, {provider: options.provider, operation: options.operation, requestHash: first.request_hash, status: "succeeded", knownCost: 0.5, source: "query"});
  assert.equal(state.jobs[0].reserved_cost, 0);
});

test("does not release partial pending exposure or retry an unreconciled attempt", () => {
  let state = budgeted(1);
  const prepared = preparePaidJob(state, {...options, estimatedCost: 0.75});
  state = recordJobResult(state, {provider: options.provider, operation: options.operation, requestHash: prepared.request_hash, status: "running", providerJobId: "active", knownCost: 0.1, reservedCost: 0.75, currency: "USD", source: "submission"});
  assert.equal(state.jobs[0].reserved_cost, 0.75);
  assert.equal(preparePaidJob(state, {...options, operation: "other", requestIdentity: {other: true}, estimatedCost: 0.75}).action, "blocked");
  state = recordJobResult(state, {provider: options.provider, operation: options.operation, requestHash: prepared.request_hash, status: "failed", knownCost: null, source: "query"});
  assert.equal(preparePaidJob(state, {...options, estimatedCost: 0.75}).action, "blocked");
});
