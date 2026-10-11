import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import test from "node:test";
import {access, mkdtemp, rm, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {resolve} from "node:path";
import {chromiumExecutable} from "./support/chromium.mjs";
import {prepareRemotionRender, remotionRenderCapability, renderRemotionPreview, renderRemotionSceneStills, renderRemotionVideo, RenderAdapterError} from "../src/render/remotion-adapter.mjs";
import {createMotionSpec} from "../src/agency/motion.mjs";
import {createAgencyHandoff} from "../src/agency/handoff.mjs";
import {createAssetRequirements, fulfillAssetRequirement} from "../src/assets/requirements.mjs";
import {contentHash} from "../src/core/ids.mjs";
import {createExportManifest} from "../src/qa/export.mjs";

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
  const capability = await remotionRenderCapability({browserExecutable: chromiumExecutable});
  if (capability.status !== "available") return context.skip(capability.reason);
  const result = await renderRemotionPreview({...input(), browserExecutable: chromiumExecutable});
  assert.equal(result.artifact.content_type, "image/png");
  assert.ok(result.artifact.bytes.length > 1000);
  assert.match(result.artifact.sha256, /^[a-f0-9]{64}$/);
  assert.equal(result.manifest.qa_status, "not-reviewed");
});

test("renders a real timed MP4 from an explicit motion specification", {timeout: 120000}, async (context) => {
  const capability = await remotionRenderCapability({browserExecutable: chromiumExecutable});
  if (capability.status !== "available") return context.skip(capability.reason);
  const treatmentHash = `sha256:${"2".repeat(64)}`;
  const versionedStoryboard = {...storyboard, storyboard_id: "storyboard-preview", version: 1, plan_id: "plan-preview", plan_version: 1, plan_hash: `sha256:${"d".repeat(64)}`, plan_scope: "plan-main", intent_type: "explainer", message: "Operators can complete the task.", language: "en-US", structure: ["promise"], evidence_ids: ["evidence-task"], preconditions: [], steps: [], structure_justification: "Single-scene render adapter test", treatment_hash: treatmentHash, narrative_copy: [], evidence_target: {feature_or_journey: "Complete task", surface: "web", role: "operator", build: "fixture-1", commit: null, locale: "en-US", flags: [], availability: "available"}, scenes: [{...storyboard.scenes[0], section: "promise", step: null, claims: [{claim: "Operators can complete the task.", evidence_id: "evidence-task"}]}]};
  const motionSpec = createMotionSpec({storyboard: versionedStoryboard, version: 1, rationale: "Use restrained motion to reveal the verified task", scenes: [{scene_id: "scene-task", entrance: "fade", entrance_frames: 5, emphasis: "focus", exit: "fade", exit_frames: 1, focus: "task result", purpose: "Reveal and then clear the verified result"}]});
  let requirements = createAssetRequirements({storyboard: versionedStoryboard, evidence, requirements: [{scene_id: "scene-task", purpose: "Show the verified task result", evidence_id: "evidence-task", evidence_hash: contentHash(evidence.evidence[0]), build: "fixture-1", role: "operator", locale: "en-US", state: "task complete", action: "Complete it", result: "The task is complete.", media_kind: "capture", dimensions: null, aspect_ratio: null, crop: "full verified surface", focus: "completed task", duration_seconds: null, rights: null, approval: {status: "pending", review_id: null}, acceptance_criteria: ["The completed task is legible"]}]});
  requirements = fulfillAssetRequirement(requirements, {requirementId: requirements.requirements[0].requirement_id, assetId: asset.asset_id, assetSha256: asset.sha256, storyboard: versionedStoryboard, assets, evidence});
  const strategy = {strategy_id: "strategy-render", version: 1, content_hash: `sha256:${"1".repeat(64)}`, candidates: [{candidate_id: "candidate-render", channel: "help-center"}]};
  const treatment = {treatment_id: "treatment-render", version: 1, content_hash: treatmentHash, source_strategy: {candidate_id: "candidate-render"}};
  const artifact = {strategy: {kind: "content-strategy", id: strategy.strategy_id, version: 1, hash: strategy.content_hash}, treatment: {kind: "creative-treatment", id: treatment.treatment_id, version: 1, hash: treatment.content_hash}, storyboard: {kind: "storyboard", id: versionedStoryboard.storyboard_id, version: 1, hash: contentHash(versionedStoryboard)}, motion: {kind: "motion-spec", id: motionSpec.motion_spec_id, version: 1, hash: motionSpec.content_hash}, requirements: {kind: "asset-requirements", id: `asset-requirements-${versionedStoryboard.storyboard_id}`, version: 1, hash: contentHash(requirements)}};
  const handoff = (fromRole, inputs, output, runId) => createAgencyHandoff({projectId: versionedStoryboard.project_id, fromRole, toRole: "editorial-critic", producer: `${fromRole}-agent`, runId, inputs, output, status: "ready", recordedAt: "2026-10-11T12:00:00.000Z"});
  const productionFlow = {strategy, treatment, assetRequirements: requirements, creativeHandoff: createAgencyHandoff({projectId: versionedStoryboard.project_id, fromRole: "creative-director", toRole: "storyboard-director", producer: "creative-agent", runId: "creative-1", inputs: [artifact.strategy], output: artifact.treatment, status: "ready", recordedAt: "2026-10-11T12:00:00.000Z"}), motionHandoff: handoff("motion-director", [artifact.treatment, artifact.storyboard], artifact.motion, "motion-1"), assetHandoff: handoff("asset-producer", [artifact.treatment, artifact.storyboard], artifact.requirements, "assets-1")};
  const result = await renderRemotionVideo({...input({storyboard: versionedStoryboard}), motionSpec, productionFlow, browserExecutable: chromiumExecutable});
  assert.equal(result.artifact.content_type, "video/mp4");
  assert.ok(result.artifact.bytes.length > 1000);
  assert.equal(result.manifest.configuration.motion_spec_id, motionSpec.motion_spec_id);
  const exported = createExportManifest({source: {render_id: result.manifest.render_id, storyboard_hash: result.manifest.storyboard_hash}, pieceId: versionedStoryboard.piece_id, requestedVariants: ["video"], artifacts: [{variant: "video", content_type: "video/mp4", bytes: result.artifact.bytes, probe: {decodable: true, width: 320, height: 180, duration_seconds: 1}}]});
  assert.equal(exported.status, "passed", "a real Remotion MP4 must satisfy the structural container check");
});

test("requires a contiguous timeline, rejects unapproved assets and assets the chosen component would ignore", () => {
  const two = (first, second, duration) => ({...storyboard, duration_seconds: duration, scenes: [{...storyboard.scenes[0], scene_id: "scene-a", ...first}, {...storyboard.scenes[0], scene_id: "scene-b", asset_ids: [], ...second}]});
  const config = {...renderConfig, scene_components: {"scene-a": "browser", "scene-b": "title"}};
  assert.ok(prepareRemotionRender(input({storyboard: two({start_seconds: 0, end_seconds: 1}, {start_seconds: 1, end_seconds: 2}, 2), renderConfig: config})));
  assert.throws(() => prepareRemotionRender(input({storyboard: two({start_seconds: 0, end_seconds: 1}, {start_seconds: 2, end_seconds: 3}, 3), renderConfig: config})), /contiguous/);
  assert.throws(() => prepareRemotionRender(input({storyboard: two({start_seconds: 0, end_seconds: 1}, {start_seconds: 1, end_seconds: 2}, 3), renderConfig: config})), /contiguous/);
  assert.throws(() => prepareRemotionRender(input({assets: {...assets, assets: [{...asset, approval: {status: "unapproved", review_id: "review-one"}}]}})), /unapproved/i);
  assert.throws(() => prepareRemotionRender(input({renderConfig: {...renderConfig, scene_components: {"scene-task": "title"}}})), /would not display/);
});

test("capability is blocked when the browser answers --version but cannot launch for Remotion", async () => {
  const directory = await mkdtemp(resolve(tmpdir(), "keelokit-fake-browser-"));
  try {
    const fake = resolve(directory, "chromium");
    await writeFile(fake, "#!/bin/sh\n[ \"$1\" = \"--version\" ] && { echo 'Chromium 1.0.0'; exit 0; }\nexit 1\n", {mode: 0o755});
    const capability = await remotionRenderCapability({browserExecutable: fake});
    assert.equal(capability.status, "blocked");
    assert.match(capability.reason, /launch/);
  } finally {
    await rm(directory, {recursive: true, force: true});
  }
});

test("rendering never writes a bundler cache into the plugin installation", {timeout: 120000}, async (context) => {
  const capability = await remotionRenderCapability({browserExecutable: chromiumExecutable});
  if (capability.status !== "available") return context.skip(capability.reason);
  await renderRemotionPreview({...input(), browserExecutable: chromiumExecutable});
  await assert.rejects(() => access(resolve(import.meta.dirname, "../node_modules/.cache/webpack")));
});

test("subtitles must come from scene text and the manifest states that no audio is rendered", () => {
  assert.throws(() => prepareRemotionRender(input({renderConfig: {...renderConfig, subtitles: {"scene-task": "Guaranteed 10x ROI"}}})), /bypasses claim validation/);
  const {manifest} = prepareRemotionRender(input({renderConfig: {...renderConfig, subtitles: {"scene-task": storyboard.scenes[0].narration}}}));
  assert.equal(manifest.configuration.audio_tracks, 0);
  assert.equal(manifest.configuration.narration_audible, false);
  assert.deepEqual(manifest.configuration.subtitled_scene_ids, ["scene-task"]);
});

test("renders a still at the midpoint of every scene, not only frame 0", {timeout: 180000}, async (context) => {
  const capability = await remotionRenderCapability({browserExecutable: chromiumExecutable});
  if (capability.status !== "available") return context.skip(capability.reason);
  const two = {...storyboard, duration_seconds: 2, scenes: [{...storyboard.scenes[0], scene_id: "scene-a", start_seconds: 0, end_seconds: 1}, {...storyboard.scenes[0], scene_id: "scene-b", start_seconds: 1, end_seconds: 2, asset_ids: [], on_screen_text: "Second scene copy"}]};
  const config = {...renderConfig, scene_components: {"scene-a": "browser", "scene-b": "title"}};
  const result = await renderRemotionSceneStills({...input({storyboard: two, renderConfig: config}), browserExecutable: chromiumExecutable});
  assert.deepEqual(result.stills.map(({scene_id, frame}) => [scene_id, frame]), [["scene-a", 15], ["scene-b", 45]]);
  assert.notEqual(result.stills[0].artifact.sha256, result.stills[1].artifact.sha256);
});
