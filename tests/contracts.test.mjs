import assert from "node:assert/strict";
import {cp, mkdtemp, readFile, rm, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {resolve} from "node:path";
import test from "node:test";
import {validateContracts} from "../src/contracts/validate.mjs";

const fixture = (name) => resolve(`fixtures/contracts/${name}`);

async function withMutation(file, mutate, run) {
  const directory = await mkdtemp(resolve(tmpdir(), "keelokit-studio-contracts-"));
  try {
    await cp(fixture("field-service"), directory, {recursive: true});
    const path = resolve(directory, file);
    const document = JSON.parse(await readFile(path, "utf8"));
    mutate(document);
    await writeFile(path, `${JSON.stringify(document)}\n`);
    await run(directory);
  } finally {
    await rm(directory, {recursive: true, force: true});
  }
}

test("accepts products from distinct industries and variable audience counts", async () => {
  for (const name of ["field-service", "learning-platform"]) {
    const result = await validateContracts(fixture(name));
    assert.deepEqual(result, {valid: true, errors: []});
  }
});

test("rejects a piece without audience, intention, or CTA", async () => {
  for (const field of ["audience_id", "intention", "cta"]) {
    await withMutation("content-plan.json", (plan) => delete plan.suites[0].pieces[0][field], async (directory) => {
      const result = await validateContracts(directory);
      assert.equal(result.valid, false);
      assert.ok(result.errors.some((error) => error.includes(`must have required property '${field}'`)));
    });
  }
});

test("rejects nonexistent cross references", async () => {
  await withMutation("storyboards/piece-assign.json", (storyboard) => {
    storyboard.scenes[0].evidence_ids = ["ev-missing"];
    storyboard.scenes[0].asset_ids = ["asset-missing"];
  }, async (directory) => {
    const result = await validateContracts(directory);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((error) => error.includes("unknown evidence ev-missing")));
    assert.ok(result.errors.some((error) => error.includes("unknown asset asset-missing")));
  });
});

test("rejects nonexistent suite and piece dependencies", async () => {
  await withMutation("content-plan.json", (plan) => {
    plan.suites[0].dependencies = ["suite-missing"];
    plan.suites[0].pieces[0].dependencies = ["piece-missing"];
  }, async (directory) => {
    const result = await validateContracts(directory);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((error) => error.includes("unknown suite dependency suite-missing")));
    assert.ok(result.errors.some((error) => error.includes("unknown piece dependency piece-missing")));
  });
});

test("rejects empty evidence references and duplicate source IDs", async () => {
  await withMutation("assets.json", (assets) => {
    assets.assets[0].evidence_id = "";
  }, async (directory) => {
    const result = await validateContracts(directory);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((error) => error.includes("must NOT have fewer than 1 characters")));
  });

  await withMutation("project-context.json", (context) => {
    context.sources.push({...context.sources[0], location: "docs/other.md"});
  }, async (directory) => {
    const result = await validateContracts(directory);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((error) => error.includes("duplicate source_id src-readme")));
  });
});

test("rejects storyboard metadata that contradicts its planned piece", async () => {
  await withMutation("audiences.json", (audiences) => {
    audiences.audiences.push({...audiences.audiences[0], audience_id: "managers", public_name: "Managers"});
  }, async (directory) => {
    const storyboardPath = resolve(directory, "storyboards/piece-assign.json");
    const storyboard = JSON.parse(await readFile(storyboardPath, "utf8"));
    storyboard.audience_id = "managers";
    storyboard.intention = "A conflicting intention";
    storyboard.cta = "A conflicting CTA";
    await writeFile(storyboardPath, `${JSON.stringify(storyboard)}\n`);
    const result = await validateContracts(directory);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((error) => error.includes("audience_id must match piece")));
    assert.ok(result.errors.some((error) => error.includes("intention must match piece")));
    assert.ok(result.errors.some((error) => error.includes("cta must match piece")));
  });
});

test("rejects assets without origin", async () => {
  await withMutation("assets.json", (assets) => delete assets.assets[0].origin, async (directory) => {
    const result = await validateContracts(directory);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((error) => error.includes("must have required property 'origin'")));
  });
});

test("rejects asset approval, path, and dependency graph bypasses", async () => {
  await withMutation("assets.json", (assets) => {
    assets.assets[0].approval = {status: "approved", review_id: null};
  }, async (directory) => {
    const result = await validateContracts(directory);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((error) => error.includes("requires a review_id")));
  });

  await withMutation("assets.json", (assets) => {
    const duplicatePath = structuredClone(assets.assets[0]);
    duplicatePath.asset_id = "capture-assign-copy";
    duplicatePath.evidence_id = null;
    duplicatePath.depends_on = [];
    assets.assets.push(duplicatePath);
  }, async (directory) => {
    const result = await validateContracts(directory);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((error) => error.includes("paths must be unique")));
  });

  await withMutation("assets.json", (assets) => {
    const asset = assets.assets[0];
    asset.depends_on = [{type: "asset", id: asset.asset_id, sha256: asset.sha256}];
  }, async (directory) => {
    const result = await validateContracts(directory);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((error) => error.includes("cannot depend on itself")));
  });
});

test("rejects brand references that are not present in source, asset, or audience contracts", async () => {
  await withMutation("brand.json", (brand) => {
    brand.source_ids = ["source-missing"];
    brand.logos = [{asset_id: "asset-missing", role: "primary"}];
    brand.treatments = [{audience_id: "audience-missing", locale: "en-US", tone: null, voice_id: null, voice_model: null, confirmation_status: "unconfirmed"}];
  }, async (directory) => {
    const result = await validateContracts(directory);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((error) => error.includes("unknown source source-missing")));
    assert.ok(result.errors.some((error) => error.includes("unknown asset asset-missing")));
    assert.ok(result.errors.some((error) => error.includes("unknown audience audience-missing")));
  });
});

