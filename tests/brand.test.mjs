import assert from "node:assert/strict";
import test from "node:test";
import {BrandValidationError, createBrandProfile, extractBrandCandidates, renderBrandReferenceHtml} from "../src/agency/brand.mjs";

const input = () => ({
  projectId: "sample-product",
  version: 1,
  sourceIds: ["source-brand"],
  knownSourceIds: ["source-brand"],
  knownAssetIds: ["asset-logo", "asset-font"],
  knownAudienceIds: ["audience-operator"],
  logos: [{asset_id: "asset-logo", role: "primary"}],
  colors: [{token: "accent", value: "#2457ff", use: "Primary actions", source_ids: ["source-brand"], confirmation_status: "unconfirmed"}],
  typography: [{family: "Example Sans", use: "Interface and titles", asset_id: "asset-font", license: "OFL-1.1", source_ids: ["source-brand"], confirmation_status: "unconfirmed"}],
  treatments: [{audience_id: "audience-operator", locale: "en-US", tone: "direct", voice_id: null, voice_model: null, confirmation_status: "unconfirmed"}],
  pronunciations: [{term: "Keelokit", locale: "en-US", guide: "kee-lo-kit"}]
});

test("creates a proposed brand profile without treating extraction as approval", () => {
  const brand = createBrandProfile(input());
  assert.equal(brand.confirmation_status, "proposed");
  assert.match(brand.brand_id, /^brand-/);
  assert.equal(brand.treatments[0].confirmation_status, "unconfirmed");
});

test("extracts traceable candidates and surfaces absent or conflicting identity", () => {
  const extracted = extractBrandCandidates([
    {source_id: "source-a", colors: [{token: "accent", value: "#111111", use: "Actions"}], typography: []},
    {source_id: "source-b", colors: [{token: "accent", value: "#222222", use: "Actions"}], typography: []}
  ]);
  assert.deepEqual(extracted.colors, []);
  assert.ok(extracted.gaps.some((gap) => gap.field === "colors.accent" && gap.reason === "conflicting"));
  assert.ok(extracted.gaps.some((gap) => gap.field === "typography" && gap.reason === "missing"));
  assert.deepEqual(extractBrandCandidates([]).gaps, [
    {field: "colors", reason: "missing"},
    {field: "typography", reason: "missing"}
  ]);

  const conflictingUse = extractBrandCandidates([
    {source_id: "source-a", colors: [{token: "accent", value: "#111111", use: "Actions"}]},
    {source_id: "source-b", colors: [{token: "accent", value: "#111111", use: "Do not use for actions"}]}
  ]);
  assert.deepEqual(conflictingUse.colors, []);
  assert.ok(conflictingUse.gaps.some((gap) => gap.field === "colors.accent" && gap.reason === "conflicting"));
});

test("rejects unknown source, asset, and audience references", () => {
  const cases = [
    {...input(), knownSourceIds: []},
    {...input(), knownAssetIds: []},
    {...input(), knownAudienceIds: []}
  ];
  for (const candidate of cases) assert.throws(() => createBrandProfile(candidate), BrandValidationError);
});

test("rejects duplicate semantic roles and color tokens", () => {
  assert.throws(() => createBrandProfile({...input(), colors: [input().colors[0], input().colors[0]]}), /duplicate color token/);
  assert.throws(() => createBrandProfile({...input(), logos: [input().logos[0], input().logos[0]]}), /duplicate logo role/);
});

test("renders a standalone reference sheet and escapes observed text", () => {
  const candidate = input();
  candidate.colors[0].use = "Actions <script>alert(1)</script>";
  const brand = createBrandProfile(candidate);
  const html = renderBrandReferenceHtml(brand, {
    knownSourceIds: candidate.knownSourceIds,
    knownAssetIds: candidate.knownAssetIds,
    knownAudienceIds: candidate.knownAudienceIds
  });
  assert.match(html, /<!doctype html>/);
  assert.match(html, /Extraction is not approval/);
  assert.match(html, /asset-logo/);
  assert.match(html, /asset-font/);
  assert.match(html, /kee-lo-kit/);
  assert.match(html, /source-brand/);
  assert.match(html, /voice unconfirmed/);
  assert.doesNotMatch(html, /<script>alert/);
  assert.match(html, /Actions &lt;script&gt;/);
});

test("does not inject arbitrary observed color values into CSS", () => {
  const candidate = input();
  candidate.colors[0].value = "red;position:fixed";
  const html = renderBrandReferenceHtml(createBrandProfile(candidate), {
    knownSourceIds: candidate.knownSourceIds,
    knownAssetIds: candidate.knownAssetIds,
    knownAudienceIds: candidate.knownAudienceIds
  });
  assert.doesNotMatch(html, /style="background:red/);
  assert.match(html, /red;position:fixed/);
});
