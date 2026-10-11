import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import test from "node:test";
import {prepareRemotionRender, remotionRenderCapability, renderRemotionPreview, renderRemotionVideo, RenderAdapterError} from "../src/render/remotion-adapter.mjs";
import {createMotionSpec} from "../src/agency/motion.mjs";

const image = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
const sha256 = createHash("sha256").update(image).digest("hex");
const assetSource = `data:image/png;base64,${image.toString("base64")}`;

const storyboard = {schema_version: 1, project_id: "generic-product", piece_id: "piece-preview", audience_id: "operators", intention: "Explain a verified task", cta: "Try the task", formats: ["custom-landscape"], fps: 30, duration_seconds: 1, scenes: [{scene_id: "scene-task", start_seconds: 0, end_seconds: 1, narration: "Complete the verified task.", on_screen_text: "Complete the task", asset_ids: ["asset-surface"], evidence_ids: ["evidence-task"]}]};
const brand = {schema_version: 1, project_id: "generic-product", brand_id: "brand-generic", version: 3, confirmation_status: "proposed", source_ids: ["source-brand"], logos: [], colors: [], typography: [], video: {minimum_text_px: null, safe_area_horizontal: null, safe_area_vertical: null}, motion: {guidance: null, reduced_motion: null}, treatments: [], pronunciations: [], gaps: [{field: "approval", reason: "unverified"}]};
const asset = {asset_id: "asset-surface", kind: "capture", path: "media/studio/assets/surface.png", sha256, origin: {type: "captured", source: "media/studio/assets/surface.png", license: null, observed_at: "2026-10-11"}, approval: {status: "pending", review_id: null}, status: "valid", depends_on: [{type: "evidence", id: "evidence-task", sha256: null}], evidence_id: "evidence-task"};
const assets = {schema_version: 1, project_id: "generic-product", assets: [asset]};
const evidence = {schema_version: 1, project_id: "generic-product", evidence: [{evidence_id: "evidence-task", feature_or_journey: "Complete task", procedure_hash: "procedure:task", surface: "web", adapter: "playwright-web", verification: "live-capture", role: "operator", availability: "available", flags: [], build: "fixture-1", commit: null, locale: "en-US", steps: ["Open the task", "Complete it"], result: "The task is complete.", capture_paths: [asset.path], hashes: [`sha256:${sha256}`], allowed_claims: ["Operators can complete the task."]}]};
const renderConfig = {width: 320, height: 180, scene_components: {"scene-task": "browser"}, theme: {background: "#101828", foreground: "#ffffff", accent: "#2368d9", surface: "#202b3c", subtitle_background: "#000000", font_family: "Arial, sans-serif", font_source: {type: "system", asset_id: null}, title_px: 30, body_px: 18, subtitle_px: 15, safe_padding: 16}};

function input(overrides = {}) {
  return {storyboard, brand, assets, evidence, assetSources: {"asset-surface": assetSource}, renderConfig, ...overrides};
}

test("binds a portable Remotion manifest to exact brand, evidence, assets, and configuration", () => {
  const first = prepareRemotionRender(input());
  const second = prepareRemotionRender(input());
  assert.equal(first.manifest.render_id, second.manifest.render_id);
  assert.deepEqual(first.manifest.assets, [`asset-surface:${sha256}:image/png`]);
  assert.equal(first.manifest.brand.confirmation_status, "proposed");
  assert.equal(first.manifest.qa_status, "not-reviewed");
  assert.equal(first.inputProps.scenes[0].component, "browser");
  const changedProvenance = prepareRemotionRender(input({assets: {...assets, assets: [{...asset, origin: {...asset.origin, source: "previous/capture.png"}}]}}));
  assert.notEqual(first.manifest.render_id, changedProvenance.manifest.render_id);
});

test("rejects missing evidence, mismatched assets, and implicit component or layout choices", () => {
  assert.throws(() => prepareRemotionRender(input({evidence: {...evidence, evidence: []}})), /unknown evidence/);
  assert.throws(() => prepareRemotionRender(input({assetSources: {"asset-surface": "data:image/png;base64,V1JPTkc="}})), /does not match/);
  assert.throws(() => prepareRemotionRender(input({renderConfig: {...renderConfig, scene_components: {}}})), /scene_components/);
  assert.throws(() => prepareRemotionRender(input({renderConfig: {...renderConfig, width: 321}})), /even width and height/);
  assert.throws(() => prepareRemotionRender(input({assetSources: {...input().assetSources, unknown: assetSource}})), /not present/);
  assert.throws(() => prepareRemotionRender(input({renderConfig: {...renderConfig, subtitles: {"scene-task": {text: "Invalid"}}}})), /subtitles/);
  assert.throws(() => prepareRemotionRender(input({renderConfig: {...renderConfig, highlights: {unknown: {x: 10, y: 10}}}})), /unknown scene/);
  assert.throws(() => prepareRemotionRender(input({renderConfig: {...renderConfig, theme: {...renderConfig.theme, font_src: "https://example.invalid/font.woff2"}}})), /unsupported fields/);
  assert.throws(() => prepareRemotionRender(input({assetSources: {"asset-surface": `data:text/plain;base64,${image.toString("base64")}`}})), /unsupported media type/);
  assert.throws(() => prepareRemotionRender(input({evidence: {...evidence, evidence: [{...evidence.evidence[0], hashes: [`sha256:${"0".repeat(64)}`]}]}})), /bytes are not bound/);
  assert.throws(() => prepareRemotionRender(input({evidence: {...evidence, evidence: [{...evidence.evidence[0], capture_paths: []}]}})), /path is not bound/);
  assert.throws(() => prepareRemotionRender(input({assets: {...assets, assets: [{...asset, evidence_id: null, depends_on: []}]}})), /requires direct evidence linkage/);
  assert.throws(() => prepareRemotionRender(input({assets: {...assets, assets: [{...asset, depends_on: [{type: "evidence", id: "missing", sha256: null}]}]}})), /unknown evidence dependency/);
});

test("rejects silently dropping extra scene assets", () => {
  const duplicated = {...storyboard, scenes: [{...storyboard.scenes[0], asset_ids: [asset.asset_id, asset.asset_id]}]};
  assert.throws(() => prepareRemotionRender(input({storyboard: duplicated})), /duplicate asset/);
  const second = {...asset, asset_id: "asset-second", path: "media/studio/assets/second.png", origin: {...asset.origin, source: "media/studio/assets/second.png"}};
  const multi = {...storyboard, scenes: [{...storyboard.scenes[0], asset_ids: [asset.asset_id, second.asset_id]}]};
  assert.throws(() => prepareRemotionRender(input({storyboard: multi, assets: {...assets, assets: [asset, second]}, assetSources: {...input().assetSources, "asset-second": assetSource}})), /multiple visual assets/);
});

test("quantizes adjacent scene boundaries without overlap", () => {
  const scenes = [["one", 0, 0.05], ["two", 0.05, 0.1], ["three", 0.1, 0.15]].map(([scene_id, start_seconds, end_seconds]) => ({...storyboard.scenes[0], scene_id, start_seconds, end_seconds}));
  const candidate = {...storyboard, duration_seconds: 0.15, scenes};
  const configured = {...renderConfig, scene_components: {one: "browser", two: "browser", three: "browser"}};
  const prepared = prepareRemotionRender(input({storyboard: candidate, renderConfig: configured}));
  assert.deepEqual(prepared.inputProps.scenes.map(({from_frame, duration_frames}) => [from_frame, duration_frames]), [[0, 2], [2, 1], [3, 2]]);
  assert.equal(prepared.inputProps.duration_in_frames, 5);
});

test("does not treat inherited object properties as supplied asset sources", () => {
  const inheritedId = "toString";
  const inheritedAsset = {...asset, asset_id: inheritedId, path: "media/studio/assets/inherited.png"};
  const inheritedStoryboard = {...storyboard, scenes: [{...storyboard.scenes[0], asset_ids: [inheritedId]}]};
  assert.throws(() => prepareRemotionRender(input({storyboard: inheritedStoryboard, assets: {...assets, assets: [inheritedAsset]}, assetSources: {}})), /no hash-verified render source/);
  const inheritedScene = {...storyboard, scenes: [{...storyboard.scenes[0], scene_id: "toString"}]};
  const prepared = prepareRemotionRender(input({storyboard: inheritedScene, renderConfig: {...renderConfig, scene_components: {toString: "browser"}}}));
  assert.equal(prepared.inputProps.scenes[0].subtitle, "");
  assert.equal(prepared.inputProps.scenes[0].highlight, null);
});

test("reports a blocked renderer instead of downloading an implicit browser", async () => {
  const capability = await remotionRenderCapability({browserExecutable: null});
  assert.equal(capability.status, "blocked");
  assert.equal((await remotionRenderCapability({browserExecutable: "/usr/bin/echo"})).status, "blocked");
  await assert.rejects(() => renderRemotionPreview({...input(), browserExecutable: null}), (error) => error instanceof RenderAdapterError && error.code === "render_capability_unavailable");
});

test("renders a real in-memory PNG preview without claiming QA", {timeout: 120000}, async (context) => {
  const capability = await remotionRenderCapability({browserExecutable: "/usr/bin/chromium"});
  if (capability.status !== "available") return context.skip(capability.reason);
  const result = await renderRemotionPreview({...input(), browserExecutable: "/usr/bin/chromium"});
  assert.equal(result.artifact.content_type, "image/png");
  assert.ok(result.artifact.bytes.length > 1000);
  assert.match(result.artifact.sha256, /^[a-f0-9]{64}$/);
  assert.equal(result.manifest.qa_status, "not-reviewed");
});

test("renders a real timed MP4 from an explicit motion specification", {timeout: 120000}, async (context) => {
  const capability = await remotionRenderCapability({browserExecutable: "/usr/bin/chromium"});
  if (capability.status !== "available") return context.skip(capability.reason);
  const versionedStoryboard = {...storyboard, storyboard_id: "storyboard-preview", version: 1, plan_id: "plan-preview", plan_version: 1, plan_hash: `sha256:${"d".repeat(64)}`, plan_scope: "plan-main", intent_type: "explainer", message: "Operators can complete the task.", language: "en-US", structure: ["promise"], evidence_ids: ["evidence-task"], preconditions: [], steps: [], structure_justification: "Single-scene render adapter test", evidence_target: {feature_or_journey: "Complete task", surface: "web", role: "operator", build: "fixture-1", commit: null, locale: "en-US", flags: [], availability: "available"}, scenes: [{...storyboard.scenes[0], section: "promise", step: null, claims: [{claim: "Operators can complete the task.", evidence_id: "evidence-task"}]}]};
  const motionSpec = createMotionSpec({storyboard: versionedStoryboard, version: 1, rationale: "Use restrained motion to reveal the verified task", scenes: [{scene_id: "scene-task", entrance: "fade", entrance_frames: 5, emphasis: "focus", exit: "fade", exit_frames: 5, focus: "task result", purpose: "Reveal and then clear the verified result"}]});
  const result = await renderRemotionVideo({...input({storyboard: versionedStoryboard}), motionSpec, browserExecutable: "/usr/bin/chromium"});
  assert.equal(result.artifact.content_type, "video/mp4");
  assert.ok(result.artifact.bytes.length > 1000);
  assert.equal(result.manifest.configuration.motion_spec_id, motionSpec.motion_spec_id);
});
