import assert from "node:assert/strict";
import Ajv2020 from "ajv/dist/2020.js";
import {mkdtemp, mkdir, readFile, rm, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {resolve} from "node:path";
import test from "node:test";
import {inspectContextSources} from "../src/adapters/context.mjs";
import {inspectManual, readManualExcerpt} from "../src/adapters/manual.mjs";

async function fixture() {
  const root = await mkdtemp(resolve(tmpdir(), "keelokit-studio-discovery-"));
  await mkdir(resolve(root, "docs"));
  await writeFile(resolve(root, "README.md"), "Product overview\n");
  await writeFile(resolve(root, "docs/backlog.md"), "Future feature\n");
  await writeFile(resolve(root, "docs/manual.md"), "# Manual\n\nStep one.\nStep two.\n");
  await writeFile(resolve(root, "docs/journey.txt"), "verified run\n");
  return root;
}

async function validator(schemaName) {
  const schema = JSON.parse(await readFile(resolve(import.meta.dirname, `../schemas/v1/${schemaName}`), "utf8"));
  return new Ajv2020({strict: true}).compile(schema);
}

test("context adapter records provenance and never treats README or backlog as availability evidence", async () => {
  const root = await fixture();
  try {
    const report = await inspectContextSources({
      projectRoot: root,
      projectId: "product-a",
      observedAt: "2026-10-11T12:00:00Z",
      sources: [
        {kind: "readme", path: "README.md", status: "confirmed"},
        {kind: "backlog", path: "docs/backlog.md", status: "confirmed"},
        {kind: "journey", path: "docs/journey.txt", status: "confirmed", build: "build-42"},
        {kind: "brand", path: "docs/missing-brand.md", status: "confirmed"}
      ]
    });
    assert.deepEqual(report.sources.map(({status}) => status), ["confirmed", "confirmed", "confirmed", "missing"]);
    assert.deepEqual(report.sources.map(({availability_evidence}) => availability_evidence), ["none", "none", "candidate", "none"]);
    assert.match(report.sources[0].content_hash, /^[a-f0-9]{64}$/);
    assert.equal(report.sources[2].build, "build-42");
    assert.equal(report.sources[3].content_hash, null);
    assert.ok(report.sources.every((source) => !("content" in source)));
    const validate = await validator("source-observations.schema.json");
    assert.equal(validate(report), true, JSON.stringify(validate.errors));
    const invalidReport = structuredClone(report);
    invalidReport.sources[1].availability_evidence = "candidate";
    assert.equal(validate(invalidReport), false);
    const validateProject = await validator("project-context.schema.json");
    const projectContext = {schema_version: 1, project_id: "product-a", product_type: "software", surfaces: ["web"], sources: report.sources, capabilities: [], gaps: []};
    assert.equal(validateProject(projectContext), true, JSON.stringify(validateProject.errors));
    projectContext.sources[1].availability_evidence = "candidate";
    assert.equal(validateProject(projectContext), false);
  } finally {
    await rm(root, {recursive: true, force: true});
  }
});

test("context adapter preserves contradictory and stale classifications", async () => {
  const root = await fixture();
  try {
    const report = await inspectContextSources({
      projectRoot: root,
      projectId: "product-a",
      observedAt: "2026-10-11",
      sources: [
        {kind: "context", path: "README.md", status: "contradictory"},
        {kind: "changelog", path: "docs/backlog.md", status: "stale"}
      ]
    });
    assert.deepEqual(report.sources.map(({status}) => status), ["contradictory", "stale"]);
    assert.notEqual(report.sources[0].source_id, report.sources[1].source_id);
  } finally {
    await rm(root, {recursive: true, force: true});
  }
});

test("manual adapter inspects provenance and reads only a bounded excerpt on demand", async () => {
  const root = await fixture();
  try {
    const report = await inspectManual({projectRoot: root, projectId: "product-a", path: "docs/manual.md", observedAt: "2026-10-11", build: "build-42", status: "confirmed"});
    const observation = report.sources[0];
    assert.equal(observation.kind, "manual");
    assert.equal(observation.status, "confirmed");
    assert.equal(observation.build, "build-42");
    const validate = await validator("source-observations.schema.json");
    assert.equal(validate(report), true, JSON.stringify(validate.errors));
    const excerpt = await readManualExcerpt({projectRoot: root, path: "docs/manual.md", maxCharacters: 10});
    assert.deepEqual(excerpt, {location: "docs/manual.md", excerpt: "# Manual\n\n", truncated: true});
  } finally {
    await rm(root, {recursive: true, force: true});
  }
});

test("context adapter rejects duplicate locations and unsupported classifications", async () => {
  const root = await fixture();
  try {
    const base = {projectRoot: root, projectId: "product-a", observedAt: "2026-10-11"};
    await assert.rejects(() => inspectContextSources({...base, sources: [{kind: "context", path: "README.md"}, {kind: "readme", path: "README.md"}]}), /Duplicate source location/);
    await assert.rejects(() => inspectContextSources({...base, sources: [{kind: "context", path: "README.md", status: "trusted"}]}), /Unsupported source status/);
  } finally {
    await rm(root, {recursive: true, force: true});
  }
});

