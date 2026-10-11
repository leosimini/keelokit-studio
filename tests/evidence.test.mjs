import assert from "node:assert/strict";
import test from "node:test";
import {EvidenceValidationError, createEvidenceRecord, evaluateEvidenceRequest, validateEvidenceDocument} from "../src/agency/evidence.mjs";

function record(overrides = {}) {
  return createEvidenceRecord({
    projectId: "sample-product",
    featureOrJourney: "Assign task",
    procedureHash: "procedure-example",
    surface: "web",
    adapter: "playwright-web",
    verification: "live-capture",
    role: "operator",
    availability: "available",
    flags: ["assign-enabled"],
    build: "build-7",
    locale: "en-US",
    steps: ["Open task", "Assign owner"],
    result: "The owner is shown on the task.",
    capturePaths: ["media/studio/captures/assign.png"],
    hashes: ["sha256:example"],
    allowedClaims: ["Operators can assign an owner."],
    ...overrides
  });
}

function documentWith(evidence) {
  return {schema_version: 1, project_id: "sample-product", evidence};
}

const target = {
  feature_or_journey: "Assign task",
  surface: "web",
  role: "operator",
  build: "build-7",
  locale: "en-US",
  availability: "available",
  flags: ["assign-enabled"]
};

test("creates stable evidence bound to role, build, locale, journey, and flags", () => {
  const first = record();
  const second = record({flags: ["assign-enabled"]});
  assert.equal(first.evidence_id, second.evidence_id);
  assert.match(first.evidence_id, /^evidence-/);
});

test("authorizes only selected and explicitly allowed claims", () => {
  const evidence = record();
  const result = evaluateEvidenceRequest({
    document: documentWith([evidence]),
    evidenceIds: [evidence.evidence_id],
    claims: [{claim: "Operators can assign an owner.", evidence_id: evidence.evidence_id}],
    target
  });
  assert.equal(result.status, "ready");
  assert.equal(result.evidence.length, 1);
  result.evidence[0].role = "mutated";
  assert.equal(evidence.role, "operator");

  const unsupported = evaluateEvidenceRequest({
    document: documentWith([evidence]),
    evidenceIds: [evidence.evidence_id],
    claims: [{claim: "Assignments always save time.", evidence_id: evidence.evidence_id}],
    target
  });
  assert.equal(unsupported.status, "blocked");
  assert.ok(unsupported.blockers.some(({code}) => code === "claim_not_allowed"));
});

test("evidence for one role, build, locale, or flag does not prove another", () => {
  const evidence = record();
  for (const changed of [
    {role: "viewer"},
    {surface: "native"},
    {build: "build-8"},
    {commit: "different-commit"},
    {locale: "es-AR"},
    {flags: ["other-enabled"]},
    {flags: ["assign-enabled", "bulk-enabled"]},
    {feature_or_journey: "Delete task"}
  ]) {
    const result = evaluateEvidenceRequest({document: documentWith([evidence]), evidenceIds: [evidence.evidence_id], target: {...target, ...changed}});
    assert.equal(result.status, "blocked");
  }
});

test("disabled, failed, and unknown features cannot carry production claims", () => {
  for (const availability of ["disabled", "failed", "unknown"]) {
    assert.throws(() => record({availability}), EvidenceValidationError);
    const unavailable = record({availability, allowedClaims: []});
    const result = evaluateEvidenceRequest({document: documentWith([unavailable]), evidenceIds: [unavailable.evidence_id], target});
    assert.equal(result.status, "blocked");
    assert.ok(result.blockers.some(({code}) => code === "feature_unavailable"));
  }
});

test("unknown or unselected evidence blocks rather than finding a substitute", () => {
  const evidence = record();
  const unknown = evaluateEvidenceRequest({document: documentWith([evidence]), evidenceIds: ["evidence-missing"], target});
  assert.equal(unknown.status, "blocked");
  assert.ok(unknown.blockers.some(({code}) => code === "unknown_evidence"));

  const unselected = evaluateEvidenceRequest({
    document: documentWith([evidence]),
    evidenceIds: ["evidence-missing"],
    claims: [{claim: evidence.allowed_claims[0], evidence_id: evidence.evidence_id}],
    target
  });
  assert.ok(unselected.blockers.some(({code}) => code === "evidence_not_selected"));
});

test("rejects duplicate evidence IDs and records without reproducibility hashes", () => {
  const evidence = record();
  assert.throws(() => validateEvidenceDocument(documentWith([evidence, evidence])), /duplicate evidence_id/);
  assert.throws(() => record({hashes: []}), EvidenceValidationError);
  for (const field of ["flags", "steps", "capturePaths", "hashes", "allowedClaims"]) assert.throws(() => record({[field]: "abc"}), new RegExp(`${field} must be an array`));
});

test("rejects adapter, surface, and verification combinations that overstate capability", () => {
  assert.throws(() => record({surface: "native"}), /equal to constant|playwright-web cannot verify native/);
  assert.throws(() => record({adapter: "unknown-adapter"}), /allowed values|unknown evidence adapter/);
  assert.throws(() => record({verification: "configured-unavailable"}), EvidenceValidationError);
});

test("keeps CLI, API, and contributed-material evidence portable without implying UI", () => {
  for (const [surface, verification] of [["cli", "reproducible-request"], ["api", "reproducible-request"], ["provided-material", "provenance-limited"]]) {
    const evidence = record({surface, adapter: surface, verification});
    assert.equal(evidence.surface, surface);
    assert.equal(evidence.verification, verification);
  }
});

test("requires an explicit available target and complete current flag set", () => {
  const evidence = record({flags: ["assign-enabled", "bulk-enabled"]});
  const disabled = evaluateEvidenceRequest({document: documentWith([evidence]), evidenceIds: [evidence.evidence_id], target: {...target, availability: "disabled", flags: evidence.flags}});
  assert.equal(disabled.status, "blocked");
  assert.ok(disabled.blockers.some(({code}) => code === "target_unavailable"));
  const result = evaluateEvidenceRequest({document: documentWith([evidence]), evidenceIds: [evidence.evidence_id], target});
  assert.equal(result.status, "blocked");
  assert.ok(result.blockers.some(({code}) => code === "flag_mismatch"));
});

test("native evidence: Android can assert results, iOS simulator captures are screenshot-only and carry no claims", () => {
  const base = {projectId: "p", featureOrJourney: "Open app", procedureHash: "procedure:x", surface: "native", role: "member", availability: "available", build: "b1", locale: "en-US", steps: ["Launched"], result: "Home visible", hashes: [`sha256:${"a".repeat(64)}`]};
  assert.ok(createEvidenceRecord({...base, adapter: "adb-android", verification: "live-capture", allowedClaims: ["Members see the home screen."]}));
  assert.ok(createEvidenceRecord({...base, adapter: "simctl-ios", verification: "screenshot-only"}));
  assert.throws(() => createEvidenceRecord({...base, adapter: "simctl-ios", verification: "screenshot-only", allowedClaims: ["Members see the home screen."]}));
  assert.throws(() => createEvidenceRecord({...base, adapter: "simctl-ios", verification: "live-capture"}));
  assert.throws(() => createEvidenceRecord({...base, adapter: "adb-android", verification: "screenshot-only"}));
  assert.throws(() => createEvidenceRecord({...base, surface: "web", adapter: "playwright-web", verification: "screenshot-only"}));
  assert.throws(() => createEvidenceRecord({...base, adapter: "adb-android", surface: "web", verification: "live-capture"}));
});
