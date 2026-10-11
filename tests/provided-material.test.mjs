import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {mkdtemp, mkdir, rm, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {resolve} from "node:path";
import test from "node:test";
import {ingestProvidedMaterial, ProvidedMaterialValidationError} from "../src/adapters/provided-material.mjs";

async function fixture() {
  const root = await mkdtemp(resolve(tmpdir(), "keelokit-studio-provided-"));
  await mkdir(resolve(root, "input"));
  await writeFile(resolve(root, "input/screenshot.png"), "synthetic image bytes");
  return root;
}

function input(projectRoot, overrides = {}) {
  return {
    projectRoot,
    projectId: "provided-fixture",
    sourcePath: "input/screenshot.png",
    kind: "screenshot",
    source: "Product team upload",
    providedAt: "2026-10-11T10:00:00-03:00",
    license: null,
    context: {feature_or_journey: "Review task", role: "operator", build: "build-4", commit: null, locale: "es-AR", flags: ["review-enabled"]},
    verificationStatus: "partially-verified",
    verificationDetails: ["File hash and supplied context recorded"],
    limitations: ["The journey was not executed by Studio"],
    reportedClaims: ["Operators can approve a task"],
    ...overrides
  };
}

test("ingests contributed material with provenance while withholding production claims", async () => {
  const root = await fixture();
  try {
    const {record, evidence} = await ingestProvidedMaterial(input(root));
    assert.match(record.sha256, /^[a-f0-9]{64}$/);
    assert.equal(record.origin.provided_at, "2026-10-11T10:00:00-03:00");
    assert.deepEqual(record.reported_claims, ["Operators can approve a task"]);
    assert.equal(evidence.surface, "provided-material");
    assert.equal(evidence.verification, "provenance-limited");
    assert.equal(evidence.availability, "unknown");
    assert.deepEqual(evidence.allowed_claims, []);
  } finally {
    await rm(root, {recursive: true, force: true});
  }
});

test("preserves absent context as absent instead of inventing it", async () => {
  const root = await fixture();
  try {
    const candidate = input(root, {providedAt: null, context: {}, verificationStatus: "unverified", verificationDetails: [], reportedClaims: []});
    delete candidate.source;
    const {record, evidence} = await ingestProvidedMaterial(candidate);
    assert.equal(record.context.role, null);
    assert.equal(record.context.build, null);
    assert.equal(record.context.locale, null);
    assert.equal(record.origin.provided_at, null);
    assert.equal(record.origin.source, null);
    assert.equal(evidence.role, "unknown");
    assert.equal(evidence.build, "unknown");
    assert.equal(evidence.locale, "unknown");
  } finally {
    await rm(root, {recursive: true, force: true});
  }
});

test("content changes create new material and evidence identities", async () => {
  const root = await fixture();
  try {
    const first = await ingestProvidedMaterial(input(root));
    await writeFile(resolve(root, "input/screenshot.png"), "changed synthetic image bytes");
    const second = await ingestProvidedMaterial(input(root));
    assert.notEqual(first.record.sha256, second.record.sha256);
    assert.notEqual(first.record.material_id, second.record.material_id);
    assert.notEqual(first.evidence.evidence_id, second.evidence.evidence_id);
  } finally {
    await rm(root, {recursive: true, force: true});
  }
});

test("requires explicit limitations and valid verification/provenance input", async () => {
  const root = await fixture();
  try {
    await assert.rejects(() => ingestProvidedMaterial(input(root, {limitations: []})), /limitations must be a non-empty array/);
    await assert.rejects(() => ingestProvidedMaterial(input(root, {verificationStatus: "verified"})), ProvidedMaterialValidationError);
    await assert.rejects(() => ingestProvidedMaterial(input(root, {verificationDetails: []})), ProvidedMaterialValidationError);
    await assert.rejects(() => ingestProvidedMaterial(input(root, {providedAt: "not-a-date"})), /providedAt/);
    for (const providedAt of ["2026-02-30", "1", "01/02/2026"]) await assert.rejects(() => ingestProvidedMaterial(input(root, {providedAt})), /providedAt/);
    await assert.rejects(() => ingestProvidedMaterial(input(root, {context: []})), /context must be an object/);
  } finally {
    await rm(root, {recursive: true, force: true});
  }
});

test("rejects traversal and non-file material sources", async () => {
  const root = await fixture();
  try {
    await assert.rejects(() => ingestProvidedMaterial(input(root, {sourcePath: "../outside.png"})), /parent segments/);
    await assert.rejects(() => ingestProvidedMaterial(input(root, {sourcePath: "input"})), /regular file/);
  } finally {
    await rm(root, {recursive: true, force: true});
  }
});

test("rejects a FIFO source without waiting for a writer", {skip: process.platform === "win32"}, async () => {
  const root = await fixture();
  try {
    execFileSync("mkfifo", [resolve(root, "input/stream")]);
    await assert.rejects(
      Promise.race([
        ingestProvidedMaterial(input(root, {sourcePath: "input/stream"})),
        new Promise((_, reject) => setTimeout(() => reject(new Error("FIFO ingestion blocked")), 250))
      ]),
      /regular file/
    );
  } finally {
    await rm(root, {recursive: true, force: true});
  }
});
