import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import test from "node:test";
import {access, mkdtemp, rm, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {resolve} from "node:path";
import {chromiumExecutable} from "./support/chromium.mjs";
import {prepareRemotionRender, remotionRenderCapability, renderRemotionPreview, renderRemotionLocalizedVideos, renderRemotionSceneStills, renderRemotionVideo, RenderAdapterError} from "../src/render/remotion-adapter.mjs";
import {createMotionSpec} from "../src/agency/motion.mjs";
import {decodePng, encodePng} from "./support/png.mjs";
import {createAgencyHandoff} from "../src/agency/handoff.mjs";
import {createAssetRequirements, fulfillAssetRequirement} from "../src/assets/requirements.mjs";
import {contentHash} from "../src/core/ids.mjs";
import {createExportManifest} from "../src/qa/export.mjs";
import {createDeterministicVoiceProvider, generateVoice, synthesizeToneNarration} from "../src/adapters/voice.mjs";

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

function videoCase(language = "en-US") {
  const english = language === "en-US";
  const suffix = english ? "" : `-${language}`;
  const copy = english ? {claim: "Operators can complete the task.", narration: "Complete the verified task.", text: "Complete the task"} : {claim: "Los operadores pueden completar la tarea.", narration: "Completá la tarea verificada.", text: "Completá la tarea"};
  const localAsset = {...asset, asset_id: `asset-surface${suffix}`, path: `media/studio/assets/surface${suffix}.png`, origin: {...asset.origin, source: `media/studio/assets/surface${suffix}.png`}, depends_on: [{type: "evidence", id: `evidence-task${suffix}`, sha256: null}], evidence_id: `evidence-task${suffix}`};
  const localAssets = {...assets, assets: [localAsset]};
  const localEvidence = {...evidence, evidence: [{...evidence.evidence[0], evidence_id: `evidence-task${suffix}`, locale: language, capture_paths: [localAsset.path], allowed_claims: [copy.claim]}]};
  const treatmentHash = `sha256:${"2".repeat(64)}`;
  const versionedStoryboard = {...storyboard, storyboard_id: `storyboard-preview${suffix}`, piece_id: `piece-preview${suffix}`, version: 1, plan_id: "plan-preview", plan_version: 1, plan_hash: `sha256:${"d".repeat(64)}`, plan_scope: "plan-main", intent_type: "explainer", message: copy.claim, language, structure: ["promise"], evidence_ids: [`evidence-task${suffix}`], preconditions: [], steps: [], structure_justification: "Single-scene render adapter test", treatment_hash: treatmentHash, narrative_copy: [], evidence_target: {feature_or_journey: "Complete task", surface: "web", role: "operator", build: "fixture-1", commit: null, locale: language, flags: [], availability: "available"}, scenes: [{...storyboard.scenes[0], narration: copy.narration, on_screen_text: copy.text, asset_ids: [localAsset.asset_id], evidence_ids: [`evidence-task${suffix}`], section: "promise", step: null, claims: [{claim: copy.claim, evidence_id: `evidence-task${suffix}`}]}]};
  const motionSpec = createMotionSpec({storyboard: versionedStoryboard, version: 1, rationale: "Use restrained motion to reveal the verified task", scenes: [{scene_id: "scene-task", entrance: "fade", entrance_frames: 5, emphasis: "focus", exit: "fade", exit_frames: 1, focus: "task result", purpose: "Reveal and then clear the verified result"}]});
  let requirements = createAssetRequirements({storyboard: versionedStoryboard, evidence: localEvidence, requirements: [{scene_id: "scene-task", purpose: "Show the verified task result", evidence_id: `evidence-task${suffix}`, evidence_hash: contentHash(localEvidence.evidence[0]), build: "fixture-1", role: "operator", locale: language, state: "task complete", action: "Complete it", result: "The task is complete.", media_kind: "capture", dimensions: null, aspect_ratio: null, crop: "full verified surface", focus: "completed task", duration_seconds: null, rights: null, approval: {status: "pending", review_id: null}, acceptance_criteria: ["The completed task is legible"]}]});
  requirements = fulfillAssetRequirement(requirements, {requirementId: requirements.requirements[0].requirement_id, assetId: localAsset.asset_id, assetSha256: localAsset.sha256, storyboard: versionedStoryboard, assets: localAssets, evidence: localEvidence});
  const strategy = {strategy_id: "strategy-render", version: 1, content_hash: `sha256:${"1".repeat(64)}`, candidates: [{candidate_id: "candidate-render", channel: "help-center"}]};
  const treatment = {treatment_id: "treatment-render", version: 1, content_hash: treatmentHash, source_strategy: {candidate_id: "candidate-render"}};
  const artifact = {strategy: {kind: "content-strategy", id: strategy.strategy_id, version: 1, hash: strategy.content_hash}, treatment: {kind: "creative-treatment", id: treatment.treatment_id, version: 1, hash: treatment.content_hash}, storyboard: {kind: "storyboard", id: versionedStoryboard.storyboard_id, version: 1, hash: contentHash(versionedStoryboard)}, motion: {kind: "motion-spec", id: motionSpec.motion_spec_id, version: 1, hash: motionSpec.content_hash}, requirements: {kind: "asset-requirements", id: `asset-requirements-${versionedStoryboard.storyboard_id}`, version: 1, hash: contentHash(requirements)}};
  const handoff = (fromRole, inputs, output, runId) => createAgencyHandoff({projectId: versionedStoryboard.project_id, fromRole, toRole: "editorial-critic", producer: `${fromRole}-agent`, runId, inputs, output, status: "ready", recordedAt: "2026-10-11T12:00:00.000Z"});
  const productionFlow = {strategy, treatment, assetRequirements: requirements, creativeHandoff: createAgencyHandoff({projectId: versionedStoryboard.project_id, fromRole: "creative-director", toRole: "storyboard-director", producer: "creative-agent", runId: "creative-1", inputs: [artifact.strategy], output: artifact.treatment, status: "ready", recordedAt: "2026-10-11T12:00:00.000Z"}), motionHandoff: handoff("motion-director", [artifact.treatment, artifact.storyboard], artifact.motion, "motion-1"), assetHandoff: handoff("asset-producer", [artifact.treatment, artifact.storyboard], artifact.requirements, "assets-1")};
  return {language, storyboard: versionedStoryboard, assets: localAssets, evidence: localEvidence, assetSources: {[localAsset.asset_id]: assetSource}, motionSpec, productionFlow, brand, renderConfig};
}

test("renders a real timed MP4 from an explicit motion specification", {timeout: 120000}, async (context) => {
  const capability = await remotionRenderCapability({browserExecutable: chromiumExecutable});
  if (capability.status !== "available") return context.skip(capability.reason);
  const options = videoCase("en-US");
  const result = await renderRemotionVideo({...options, browserExecutable: chromiumExecutable});
  assert.equal(result.artifact.content_type, "video/mp4");
  assert.ok(result.artifact.bytes.length > 1000);
  assert.equal(result.manifest.configuration.motion_spec_id, options.motionSpec.motion_spec_id);
  const exported = createExportManifest({source: {render_id: result.manifest.render_id, storyboard_hash: result.manifest.storyboard_hash}, pieceId: options.storyboard.piece_id, requestedVariants: ["video"], artifacts: [{variant: "video", content_type: "video/mp4", bytes: result.artifact.bytes, probe: {decodable: true, width: 320, height: 180, duration_seconds: 1}}]});
  assert.equal(exported.status, "passed", "a real Remotion MP4 must satisfy the structural container check");
});

test("renders every language of a localized group from one bundle, each with its own evidence and copy", {timeout: 240000}, async (context) => {
  const capability = await remotionRenderCapability({browserExecutable: chromiumExecutable});
  if (capability.status !== "available") return context.skip(capability.reason);
  const english = videoCase("en-US");
  const spanish = videoCase("es-AR");
  const result = await renderRemotionLocalizedVideos({variants: [english, spanish], browserExecutable: chromiumExecutable});
  assert.deepEqual(result.variants.map(({language}) => language), ["en-US", "es-AR"]);
  assert.notEqual(result.variants[0].artifact.sha256, result.variants[1].artifact.sha256);
  assert.notEqual(result.variants[0].manifest.render_id, result.variants[1].manifest.render_id);
  for (const variant of result.variants) assert.equal(variant.artifact.content_type, "video/mp4");
  await assert.rejects(() => renderRemotionLocalizedVideos({variants: [english, {...spanish, language: "en-US"}], browserExecutable: chromiumExecutable}), /distinct languages|does not match/);
  await assert.rejects(() => renderRemotionLocalizedVideos({variants: [english, {...spanish, renderConfig: {...renderConfig, width: 640}}], browserExecutable: chromiumExecutable}), /same composition/);
  await assert.rejects(() => renderRemotionLocalizedVideos({variants: [english], browserExecutable: chromiumExecutable}), /at least two/);
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
  assert.deepEqual(result.stills.map(({scene_id, frame}) => [scene_id, frame]), [["scene-a", 14], ["scene-b", 44]]);
  assert.notEqual(result.stills[0].artifact.sha256, result.stills[1].artifact.sha256);
});

const quadrants = [[230, 40, 40], [40, 200, 60], [40, 80, 230], [240, 200, 30]];
const quadrantPng = () => encodePng(320, 180, (x, y) => quadrants[(y >= 90 ? 2 : 0) + (x >= 160 ? 1 : 0)]);

function colourCounts(png) {
  const counts = quadrants.map(() => 0);
  for (let y = 0; y < png.height; y += 1) for (let x = 0; x < png.width; x += 1) {
    const pixel = png.at(x, y);
    quadrants.forEach((colour, index) => { if (colour.every((value, channel) => Math.abs(value - pixel[channel]) < 28)) counts[index] += 1; });
  }
  return counts;
}

test("the camera crops and zooms into the asset: the last frame shows only the focused quadrant", {timeout: 180000}, async (context) => {
  const capability = await remotionRenderCapability({browserExecutable: chromiumExecutable});
  if (capability.status !== "available") return context.skip(capability.reason);
  const options = videoCase("en-US");
  const bytes = quadrantPng();
  const sha = createHash("sha256").update(bytes).digest("hex");
  options.assets = {...options.assets, assets: [{...options.assets.assets[0], sha256: sha}]};
  options.evidence = {...options.evidence, evidence: [{...options.evidence.evidence[0], hashes: [`sha256:${sha}`]}]};
  options.assetSources = {[options.assets.assets[0].asset_id]: `data:image/png;base64,${bytes.toString("base64")}`};
  options.renderConfig = {...renderConfig, width: 640, height: 360, scene_components: {"scene-task": "browser"}};
  const scene = {scene_id: "scene-task", entrance: "cut", entrance_frames: 0, emphasis: "none", exit: "cut", exit_frames: 0, focus: null, purpose: "Zoom into the first quadrant", transition: {type: "none", frames: 0}, callouts: [], cursor: null, camera: {start: {x: 0.5, y: 0.5, zoom: 1}, end: {x: 0.25, y: 0.25, zoom: 2}, from_frame: 0, to_frame: 20, easing: "linear"}};
  options.motionSpec = createMotionSpec({storyboard: options.storyboard, version: 1, scenes: [scene], rationale: "Crop test"});
  const first = decodePng((await renderRemotionPreview({...options, position: 0, browserExecutable: chromiumExecutable})).artifact.bytes);
  const last = decodePng((await renderRemotionPreview({...options, position: 1, browserExecutable: chromiumExecutable})).artifact.bytes);
  const [startCounts, endCounts] = [colourCounts(first), colourCounts(last)];
  assert.ok(startCounts.every((count) => count > 200), `all four quadrants are visible before the zoom: ${startCounts}`);
  assert.ok(endCounts[0] > 2.5 * startCounts[0], `the red quadrant fills the window after the zoom: ${startCounts} -> ${endCounts}`);
  assert.ok(endCounts.slice(1).every((count) => count < endCounts[0] * 0.005), `only anti-aliased edge pixels of the other quadrants remain: ${endCounts}`);
});

async function narratedOptions({seconds = 3, music = null, mutate = null} = {}) {
  const options = videoCase("en-US");
  options.storyboard = {...options.storyboard, duration_seconds: seconds, scenes: [{...options.storyboard.scenes[0], end_seconds: seconds}]};
  options.motionSpec = null;
  const text = options.storyboard.scenes[0].narration;
  const voice = await generateVoice({pieceId: options.storyboard.piece_id, sceneId: "scene-task", narration: {text, approval: {status: "approved", text_hash: contentHash(text)}}, config: {provider: "synthetic", model: "m", voice_id: "v", language: "en-US", pronunciations: [], options: {}}, provider: createDeterministicVoiceProvider()});
  const audioAsset = (id, bytes, extra = {}) => ({asset_id: id, kind: "audio", path: `media/studio/audio/${id}.wav`, sha256: createHash("sha256").update(bytes).digest("hex"), origin: {type: "generated", source: `voice-artifact:${id}`, license: null, observed_at: "2026-10-11"}, approval: {status: "pending", review_id: null}, status: "valid", depends_on: [], evidence_id: null, ...extra});
  const narrationAsset = audioAsset("asset-voice", voice.audio_bytes);
  const wavUrl = (bytes) => `data:audio/wav;base64,${bytes.toString("base64")}`;
  options.assets = {...options.assets, assets: [...options.assets.assets, narrationAsset]};
  options.assetSources = {...options.assetSources, "asset-voice": wavUrl(voice.audio_bytes)};
  options.renderConfig = {...options.renderConfig, narration: {"scene-task": {asset_id: "asset-voice", voice_artifact: voice.artifact}}};
  if (music) {
    const bed = synthesizeToneNarration("la la la la la la la la la la").audio_bytes;
    const musicAsset = audioAsset("asset-music", bed, {origin: {type: "provided", source: "music.wav", license: music.license ?? null, observed_at: "2026-10-11"}});
    options.assets = {...options.assets, assets: [...options.assets.assets, musicAsset]};
    options.assetSources = {...options.assetSources, "asset-music": wavUrl(bed)};
    options.renderConfig = {...options.renderConfig, music: {asset_id: "asset-music", ...music.config}};
  }
  mutate?.(options, {voice, wavUrl, audioAsset});
  return {options, voice};
}

test("binds narration audio to the exact approved text, scene, hash and measured length", async () => {
  const {options, voice} = await narratedOptions();
  const {manifest, inputProps} = prepareRemotionRender(options);
  assert.deepEqual([manifest.configuration.audio_tracks, manifest.configuration.narration_audible, manifest.configuration.narrated_scene_ids], [1, true, ["scene-task"]]);
  assert.ok(manifest.assets.some((entry) => entry.startsWith(`asset-voice:${voice.artifact.audio.sha256}:audio/wav`)));
  assert.deepEqual([inputProps.audio.narration[0].scene_id, inputProps.audio.narration[0].from_frame], ["scene-task", 0]);
  assert.equal(inputProps.audio.music, null);
  const rejects = async (mutate, pattern) => { const {options: bad} = await narratedOptions({mutate}); assert.throws(() => prepareRemotionRender(bad), pattern); };
  await rejects((o) => { o.storyboard = {...o.storyboard, scenes: [{...o.storyboard.scenes[0], narration: "A different line."}]}; }, /does not match the approved narration/);
  await rejects((o) => { o.renderConfig.narration["scene-task"].voice_artifact = {...o.renderConfig.narration["scene-task"].voice_artifact, scene_id: "other-scene"}; }, /was generated for scene other-scene/);
  await rejects((o) => { o.renderConfig.narration["scene-task"].voice_artifact = {...o.renderConfig.narration["scene-task"].voice_artifact, audio: {...voice.artifact.audio, sha256: "0".repeat(64)}}; }, /audio hash/);
  await rejects((o) => { o.renderConfig.narration["scene-task"].voice_artifact = {...o.renderConfig.narration["scene-task"].voice_artifact, status: "failed"}; }, /succeeded voice/);
  await rejects((o) => { o.assets.assets.at(-1).approval = {status: "unapproved", review_id: "r1"}; }, /unapproved/i);
  await rejects((o) => { o.assets.assets.at(-1).kind = "capture"; }, /audio asset|unsupported media type/);
  await rejects((o, h) => { o.assetSources["asset-voice"] = `data:audio/mpeg;base64,${voice.audio_bytes.toString("base64")}`; }, /WAV/);
  await rejects((o) => { o.renderConfig.narration["scene-task"].voice_artifact = {...o.renderConfig.narration["scene-task"].voice_artifact, duration_seconds: 9}; }, /measured length/);
  const short = await narratedOptions({seconds: 1});
  assert.throws(() => prepareRemotionRender(short.options), /narration lasts 1\.52s but scene scene-task is 1\.00s/);
});

test("narration must cover every scene that has narration, or none", async () => {
  const {options} = await narratedOptions({seconds: 6, mutate: (o) => {
    const first = o.storyboard.scenes[0];
    o.storyboard = {...o.storyboard, scenes: [{...first, end_seconds: 3}, {...first, scene_id: "scene-two", start_seconds: 3, end_seconds: 6, narration: "Another narrated scene."}]};
    o.renderConfig = {...o.renderConfig, scene_components: {"scene-task": "browser", "scene-two": "browser"}};
  }});
  assert.throws(() => prepareRemotionRender(options), /every scene with narration/);
});

test("music needs a recorded license, sits under the narration and fades in and out", async () => {
  const licensed = await narratedOptions({music: {license: "CC-BY-4.0 Example Artist", config: {volume: 0.3, duck_volume: 0.08, fade_in_seconds: 0.5, fade_out_seconds: 0.5}}});
  const {inputProps, manifest} = prepareRemotionRender(licensed.options);
  assert.deepEqual([inputProps.audio.music.volume, inputProps.audio.music.duck_volume, inputProps.audio.music.fade_in_frames, inputProps.audio.music.fade_out_frames], [0.3, 0.08, 15, 15]);
  assert.deepEqual(inputProps.audio.music.windows, [{from: 0, to: 46}]);
  assert.equal(manifest.configuration.music_asset_id, "asset-music");
  const unlicensed = await narratedOptions({music: {license: null, config: {volume: 0.3}}});
  assert.throws(() => prepareRemotionRender(unlicensed.options), /license/);
  const loud = await narratedOptions({music: {license: "CC0", config: {volume: 1.5}}});
  assert.throws(() => prepareRemotionRender(loud.options), /volume/);
  const inverted = await narratedOptions({music: {license: "CC0", config: {volume: 0.2, duck_volume: 0.5}}});
  assert.throws(() => prepareRemotionRender(inverted.options), /duck_volume/);
});

test("captions can follow the narration, split into phrases from the voice alignment", async () => {
  const {options} = await narratedOptions({mutate: (o) => { o.renderConfig = {...o.renderConfig, captions: "narration"}; }});
  const {inputProps} = prepareRemotionRender(options);
  const scene = inputProps.scenes[0];
  assert.equal(scene.subtitle, "Complete the verified task.");
  assert.equal(scene.subtitle_cues.map(({text}) => text).join(" "), scene.subtitle);
  assert.ok(scene.subtitle_cues.every((cue, index, cues) => cue.to_frame > cue.from_frame && (index === 0 || cue.from_frame >= cues[index - 1].to_frame)));
  const free = await narratedOptions({mutate: (o) => { o.renderConfig = {...o.renderConfig, captions: "free text"}; }});
  assert.throws(() => prepareRemotionRender(free.options), /captions/);
});

test("renders narration and music into a real MP4 with an audio track, and silent pieces without one", {timeout: 240000}, async (context) => {
  const capability = await remotionRenderCapability({browserExecutable: chromiumExecutable});
  if (capability.status !== "available") return context.skip(capability.reason);
  const render = async (options) => {
    const result = await renderRemotionVideo({...options, browserExecutable: chromiumExecutable});
    const manifest = (expectsAudio) => createExportManifest({source: {render_id: result.manifest.render_id, storyboard_hash: result.manifest.storyboard_hash}, pieceId: options.storyboard.piece_id, requestedVariants: ["video"], artifacts: [{variant: "video", content_type: "video/mp4", bytes: result.artifact.bytes, probe: {decodable: true, width: 320, height: 180, duration_seconds: options.storyboard.duration_seconds}, expects_audio: expectsAudio}]});
    return {result, manifest};
  };
  const {options: voiced} = await narratedOptions({seconds: 3, music: {license: "CC0", config: {volume: 0.3}}, mutate: (o) => { o.renderConfig = {...o.renderConfig, captions: "narration"}; }});
  const flow = videoCase("en-US");
  const motionSpec = createMotionSpec({storyboard: voiced.storyboard, version: 1, rationale: "Narrated test", scenes: [{scene_id: "scene-task", entrance: "fade", entrance_frames: 4, emphasis: "none", exit: "cut", exit_frames: 0, focus: null, purpose: "Introduce the narrated scene"}]});
  const narrated = {...voiced, motionSpec, productionFlow: {...flow.productionFlow}};
  // The handoffs bind to the storyboard hash, so rebuild them for the 3-second narrated storyboard.
  narrated.productionFlow = flowFor(narrated, flow);
  const {result, manifest} = await render(narrated);
  assert.equal(result.manifest.configuration.narration_audible, true);
  assert.equal(manifest(true).status, "passed", "the MP4 has an audio track");
  assert.equal(manifest(true).artifacts[0].audio_tracks, 1);
  const silent = await render(videoCase("en-US"));
  assert.equal(silent.manifest(false).artifacts[0].audio_tracks, 0);
  assert.equal(silent.manifest(true).status, "failed", "a piece that should be voiced cannot ship without an audio track");
});

function flowFor(options, template) {
  const requirements = createAssetRequirements({storyboard: options.storyboard, evidence: options.evidence, requirements: [{scene_id: "scene-task", purpose: "Show the verified task result", evidence_id: "evidence-task", evidence_hash: contentHash(options.evidence.evidence[0]), build: "fixture-1", role: "operator", locale: "en-US", state: "task complete", action: "Complete it", result: "The task is complete.", media_kind: "capture", dimensions: null, aspect_ratio: null, crop: "full verified surface", focus: "completed task", duration_seconds: null, rights: null, approval: {status: "pending", review_id: null}, acceptance_criteria: ["The completed task is legible"]}]});
  const fulfilled = fulfillAssetRequirement(requirements, {requirementId: requirements.requirements[0].requirement_id, assetId: "asset-surface", assetSha256: sha256, storyboard: options.storyboard, assets: {...options.assets, assets: options.assets.assets.filter(({asset_id}) => asset_id === "asset-surface")}, evidence: options.evidence});
  const artifact = {...template.productionFlow};
  const treatmentHash = options.storyboard.treatment_hash;
  const strategy = artifact.strategy; const treatment = artifact.treatment;
  const refs = {strategy: {kind: "content-strategy", id: strategy.strategy_id, version: 1, hash: strategy.content_hash}, treatment: {kind: "creative-treatment", id: treatment.treatment_id, version: 1, hash: treatmentHash}, storyboard: {kind: "storyboard", id: options.storyboard.storyboard_id, version: 1, hash: contentHash(options.storyboard)}, motion: {kind: "motion-spec", id: options.motionSpec.motion_spec_id, version: 1, hash: options.motionSpec.content_hash}, requirements: {kind: "asset-requirements", id: `asset-requirements-${options.storyboard.storyboard_id}`, version: 1, hash: contentHash(fulfilled)}};
  const handoff = (fromRole, inputs, output, runId) => createAgencyHandoff({projectId: options.storyboard.project_id, fromRole, toRole: "editorial-critic", producer: `${fromRole}-agent`, runId, inputs, output, status: "ready", recordedAt: "2026-10-11T12:00:00.000Z"});
  return {strategy, treatment, assetRequirements: fulfilled, creativeHandoff: artifact.creativeHandoff, motionHandoff: handoff("motion-director", [refs.treatment, refs.storyboard], refs.motion, "motion-1"), assetHandoff: handoff("asset-producer", [refs.treatment, refs.storyboard], refs.requirements, "assets-1")};
}

test("a reduced-motion render freezes the camera and drops transitions, and is a distinct render", () => {
  const options = videoCase("en-US");
  const moving = createMotionSpec({storyboard: options.storyboard, version: 1, rationale: "Zoom in", scenes: [{scene_id: "scene-task", entrance: "fade", entrance_frames: 4, emphasis: "pulse", exit: "fade", exit_frames: 3, focus: null, purpose: "Show the result up close", camera: {start: {x: 0.5, y: 0.5, zoom: 1}, end: {x: 0.3, y: 0.3, zoom: 2}, from_frame: 2, to_frame: 20, easing: "ease-in-out"}}]});
  const full = prepareRemotionRender({...options, motionSpec: moving});
  const calm = prepareRemotionRender({...options, motionSpec: moving, renderConfig: {...options.renderConfig, reduced_motion: true}});
  assert.equal(full.manifest.configuration.reduced_motion, false);
  assert.equal(calm.manifest.configuration.reduced_motion, true);
  assert.notEqual(full.manifest.render_id, calm.manifest.render_id);
  assert.deepEqual(calm.inputProps.scenes[0].motion.camera.start, {x: 0.3, y: 0.3, zoom: 2});
  assert.deepEqual([calm.inputProps.scenes[0].motion.entrance, calm.inputProps.scenes[0].motion.exit, calm.inputProps.scenes[0].motion.emphasis], ["cut", "cut", "none"]);
  assert.throws(() => prepareRemotionRender({...options, motionSpec: moving, renderConfig: {...options.renderConfig, reduced_motion: "yes"}}), /reduced_motion/);
});
