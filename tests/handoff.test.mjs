import assert from "node:assert/strict";
import test from "node:test";
import {AgencyHandoffError, assertAgencyHandoffCurrent, createAgencyHandoff} from "../src/agency/handoff.mjs";

const hash = (letter) => `sha256:${letter.repeat(64)}`;
const input = {kind: "content-strategy", id: "strategy-one", version: 1, hash: hash("a")};
const output = {kind: "creative-treatment", id: "treatment-one", version: 1, hash: hash("b")};

test("persists an exact specialist handoff and accepts its current artifacts", () => {
  const handoff = createAgencyHandoff({projectId: "product-one", fromRole: "content-strategist", toRole: "creative-director", producer: "strategist-agent", runId: "run-001", inputs: [input], output, unresolvedIssues: [], status: "ready", recordedAt: "2026-10-11T12:00:00.000Z"});
  assert.equal(assertAgencyHandoffCurrent(handoff, {projectId: "product-one", inputs: [input], output}), handoff);
  assert.match(handoff.handoff_id, /^agency-handoff-/);
});

test("rejects stale artifacts and false readiness", () => {
  assert.throws(() => createAgencyHandoff({projectId: "product-one", fromRole: "content-strategist", toRole: "creative-director", producer: "agent", runId: "run", inputs: [input], output, unresolvedIssues: ["Proof missing"], status: "ready", recordedAt: "2026-10-11T12:00:00.000Z"}), AgencyHandoffError);
  const handoff = createAgencyHandoff({projectId: "product-one", fromRole: "content-strategist", toRole: "creative-director", producer: "agent", runId: "run", inputs: [input], output, unresolvedIssues: [], status: "ready", recordedAt: "2026-10-11T12:00:00.000Z"});
  assert.throws(() => assertAgencyHandoffCurrent(handoff, {projectId: "product-one", inputs: [{...input, hash: hash("c")}], output}), /stale/);
});
