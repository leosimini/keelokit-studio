import {contentHash} from "../core/ids.mjs";
import {measureWav} from "../qa/measure.mjs";
import {captionCues} from "./geometry.mjs";

export class AudioBindingError extends Error {}

const musicTypes = new Set(["audio/wav", "audio/mpeg", "audio/mp4"]);
const fail = (message) => { throw new AudioBindingError(message); };
const plain = (value) => value && typeof value === "object" && !Array.isArray(value);

function audioAsset(entryAsset, label, assetsById, sourceMap) {
  const asset = assetsById.get(entryAsset);
  if (!asset || asset.kind !== "audio") fail(`${label} must reference an audio asset in the inventory`);
  if (asset.status !== "valid") fail(`${label} audio asset ${asset.asset_id} is stale`);
  if (asset.approval.status === "unapproved") fail(`${label} audio asset ${asset.asset_id} is unapproved`);
  if (!Object.hasOwn(sourceMap, asset.asset_id)) fail(`${label} audio asset ${asset.asset_id} has no hash-verified render source`);
  return asset;
}

const decode = (source) => Buffer.from(source.slice(source.indexOf(",") + 1), "base64");

// Binds narration and music to the storyboard: each voiced scene must carry audio generated from its exact approved text,
// no longer than the scene, and music must have a recorded license. Nothing here changes the picture.
export function prepareAudio({storyboard, renderConfig, assetsById, sourceMap, mediaTypes, durationInFrames}) {
  const fps = storyboard.fps;
  const narrationConfig = renderConfig.narration ?? {};
  if (!plain(narrationConfig)) fail("renderConfig.narration must map scene IDs to {asset_id, voice_artifact}");
  const narration = [];
  const cueSources = new Map();
  for (const [sceneId, entry] of Object.entries(narrationConfig)) {
    const scene = storyboard.scenes.find(({scene_id}) => scene_id === sceneId);
    if (!scene || typeof scene.narration !== "string" || scene.narration.trim() === "") fail(`renderConfig.narration references scene ${sceneId}, which has no narration`);
    const asset = audioAsset(entry?.asset_id, `Narration for scene ${sceneId}`, assetsById, sourceMap);
    if (mediaTypes[asset.asset_id] !== "audio/wav") fail(`Narration audio for scene ${sceneId} must be WAV so its length can be measured`);
    const artifact = entry.voice_artifact;
    if (artifact?.status !== "succeeded") fail(`Narration for scene ${sceneId} requires a succeeded voice artifact`);
    if (artifact.scene_id !== sceneId || artifact.piece_id !== storyboard.piece_id) fail(`The voice artifact was generated for scene ${artifact.scene_id} of piece ${artifact.piece_id}, not scene ${sceneId} of piece ${storyboard.piece_id}`);
    if (artifact.text_hash !== contentHash(scene.narration)) fail(`The audio for scene ${sceneId} does not match the approved narration text; regenerate the voice from the current narration`);
    if (artifact.audio?.sha256 !== asset.sha256) fail(`The voice artifact audio hash does not match audio asset ${asset.asset_id}`);
    let measured;
    try { measured = measureWav(decode(sourceMap[asset.asset_id])).duration_seconds; } catch { fail(`Narration audio for scene ${sceneId} is not a measurable WAV file`); }
    if (!Number.isFinite(artifact.duration_seconds) || Math.abs(measured - artifact.duration_seconds) > 0.05) fail(`The voice artifact duration does not match the measured length of its audio for scene ${sceneId}`);
    const sceneSeconds = scene.end_seconds - scene.start_seconds;
    if (measured > sceneSeconds + 0.12) fail(`For scene ${sceneId} the narration lasts ${measured.toFixed(2)}s but scene ${sceneId} is ${sceneSeconds.toFixed(2)}s; lengthen the scene or shorten the narration`);
    narration.push({scene_id: sceneId, asset_id: asset.asset_id, src: sourceMap[asset.asset_id], from_frame: Math.round(scene.start_seconds * fps), duration_frames: Math.ceil(measured * fps)});
    cueSources.set(sceneId, artifact.alignment ?? null);
  }
  if (narration.length > 0) {
    const missing = storyboard.scenes.filter((scene) => typeof scene.narration === "string" && scene.narration.trim() !== "" && !Object.hasOwn(narrationConfig, scene.scene_id)).map(({scene_id}) => scene_id);
    if (missing.length > 0) fail(`Narration audio must cover every scene with narration or none; missing: ${missing.join(", ")}`);
  }

  let music = null;
  if (renderConfig.music !== undefined && renderConfig.music !== null) {
    const config = renderConfig.music;
    if (!plain(config) || Object.keys(config).some((key) => !["asset_id", "volume", "duck_volume", "fade_in_seconds", "fade_out_seconds"].includes(key))) fail("renderConfig.music supports asset_id, volume, duck_volume, fade_in_seconds and fade_out_seconds");
    const asset = audioAsset(config.asset_id, "Music", assetsById, sourceMap);
    if (!musicTypes.has(mediaTypes[asset.asset_id])) fail(`Music must be WAV, MP3 or AAC audio, not ${mediaTypes[asset.asset_id]}`);
    if (typeof asset.origin.license !== "string" || asset.origin.license.trim() === "") fail(`Music asset ${asset.asset_id} needs a license recorded in its origin; Studio does not use music of unknown rights`);
    const volume = config.volume ?? 0.18;
    if (!(volume > 0 && volume <= 1)) fail("music volume must be greater than 0 and at most 1");
    const duck = config.duck_volume ?? Math.min(0.06, volume);
    if (!(duck >= 0 && duck <= volume)) fail("music duck_volume must be between 0 and volume");
    const total = durationInFrames / fps;
    const fadeIn = config.fade_in_seconds ?? 1;
    const fadeOut = config.fade_out_seconds ?? 2;
    if (![fadeIn, fadeOut].every((value) => Number.isFinite(value) && value >= 0) || fadeIn + fadeOut > total) fail("music fades must be non-negative and fit inside the piece");
    music = {asset_id: asset.asset_id, src: sourceMap[asset.asset_id], volume, duck_volume: duck, fade_in_frames: Math.round(fadeIn * fps), fade_out_frames: Math.round(fadeOut * fps), windows: narration.map(({from_frame, duration_frames}) => ({from: from_frame, to: from_frame + duration_frames}))};
  }
  return {
    audio: {narration, music},
    assetIds: [...narration.map(({asset_id}) => asset_id), ...(music ? [music.asset_id] : [])],
    cueSources,
    summary: {audio_tracks: narration.length > 0 || music ? 1 : 0, narration_audible: narration.length > 0, narrated_scene_ids: narration.map(({scene_id}) => scene_id), music_asset_id: music?.asset_id ?? null}
  };
}

export function sceneCaptions({scene, mode, subtitles, cueSource, fps}) {
  if (mode === "narration") {
    if (typeof scene.narration !== "string" || scene.narration.trim() === "") return {subtitle: "", cues: []};
    return {subtitle: scene.narration, cues: captionCues(cueSource, scene.narration, fps) ?? []};
  }
  return {subtitle: Object.hasOwn(subtitles, scene.scene_id) ? subtitles[scene.scene_id] : "", cues: []};
}
