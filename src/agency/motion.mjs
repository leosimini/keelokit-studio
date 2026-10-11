import {contentHash, stableId} from "../core/ids.mjs";
import {easingNames} from "../render/geometry.mjs";

const entrances = new Set(["cut", "fade", "slide-up", "scale"]);
const emphases = new Set(["none", "pulse", "focus"]);
const sceneKeys = new Set(["scene_id", "entrance", "entrance_frames", "emphasis", "exit", "exit_frames", "focus", "purpose", "camera", "callouts", "cursor", "transition"]);
const unit = (value) => Number.isFinite(value) && value >= 0 && value <= 1;
const frame = (value, max) => Number.isInteger(value) && value >= 0 && value <= max;

// The camera frames part of a verified asset (focal point + zoom); callouts and the cursor use the same 0..1 asset coordinates, so they follow the camera.
function checkCamera(camera, label, duration) {
  if (camera === null) return null;
  const keys = ["start", "end", "from_frame", "to_frame", "easing"];
  if (!camera || typeof camera !== "object" || Object.keys(camera).some((key) => !keys.includes(key)) || keys.some((key) => !Object.hasOwn(camera, key))) throw new MotionSpecError(`Scene ${label}: camera requires exactly ${keys.join(", ")}`);
  for (const end of [camera.start, camera.end]) {
    if (!end || !unit(end.x) || !unit(end.y)) throw new MotionSpecError(`Scene ${label}: camera focal point x and y must be between 0 and 1`);
    if (!Number.isFinite(end.zoom) || end.zoom < 1 || end.zoom > 6) throw new MotionSpecError(`Scene ${label}: camera zoom must be between 1 and 6`);
  }
  if (!frame(camera.from_frame, duration - 1) || !frame(camera.to_frame, duration - 1) || camera.to_frame <= camera.from_frame) throw new MotionSpecError(`Scene ${label}: camera frames must satisfy 0 <= from_frame < to_frame < scene duration`);
  if (!easingNames.includes(camera.easing)) throw new MotionSpecError(`Scene ${label}: camera easing must be one of ${easingNames.join(", ")}`);
  return {start: {x: camera.start.x, y: camera.start.y, zoom: camera.start.zoom}, end: {x: camera.end.x, y: camera.end.y, zoom: camera.end.zoom}, from_frame: camera.from_frame, to_frame: camera.to_frame, easing: camera.easing};
}

function checkCallouts(callouts, label, duration, texts) {
  if (!Array.isArray(callouts)) throw new MotionSpecError(`Scene ${label}: callouts must be an array`);
  if (callouts.length > 3) throw new MotionSpecError(`Scene ${label}: at most 3 callouts per scene`);
  return callouts.map((callout) => {
    const region = callout?.region;
    if (!region || !unit(region.x) || !unit(region.y) || !(region.width >= 0.02) || !(region.height >= 0.02) || region.x + region.width > 1 + 1e-9 || region.y + region.height > 1 + 1e-9) throw new MotionSpecError(`Scene ${label}: callout region must stay inside the asset (x, y in 0..1, width and height at least 0.02)`);
    if (!["box", "spotlight"].includes(callout.style)) throw new MotionSpecError(`Scene ${label}: callout style must be box or spotlight`);
    if (!frame(callout.start_frame, duration) || !frame(callout.end_frame, duration) || callout.end_frame <= callout.start_frame) throw new MotionSpecError(`Scene ${label}: callout frames must satisfy 0 <= start_frame < end_frame <= scene duration`);
    if (callout.label !== null && !texts.includes(callout.label)) throw new MotionSpecError(`Scene ${label}: a callout label must equal the scene's narration, on-screen text or step; free label copy bypasses claim validation`);
    return {region: {x: region.x, y: region.y, width: region.width, height: region.height}, label: callout.label, start_frame: callout.start_frame, end_frame: callout.end_frame, style: callout.style};
  });
}

function checkCursor(cursor, label, duration) {
  if (cursor === null) return null;
  const points = cursor?.points;
  if (!Array.isArray(points) || points.length < 2 || points.length > 8 || points.some((point) => !unit(point?.x) || !unit(point?.y) || !frame(point?.frame, duration - 1)) || points.some((point, index) => index > 0 && point.frame <= points[index - 1].frame)) throw new MotionSpecError(`Scene ${label}: cursor needs 2 to 8 points inside the asset with strictly increasing frames inside the scene`);
  if (cursor.click_frame !== null && !(frame(cursor.click_frame, duration - 1) && cursor.click_frame >= points[0].frame)) throw new MotionSpecError(`Scene ${label}: cursor click_frame must be null or a frame inside the scene after the first point`);
  return {points: points.map(({x, y, frame: at}) => ({x, y, frame: at})), click_frame: cursor.click_frame};
}

function checkTransition(transition, label, index, previousDuration) {
  if (!transition || !["none", "crossfade"].includes(transition.type) || !Number.isInteger(transition.frames)) throw new MotionSpecError(`Scene ${label}: transition must be {type: none|crossfade, frames}`);
  if (transition.type === "none") {
    if (transition.frames !== 0) throw new MotionSpecError(`Scene ${label}: a transition of type none must use zero frames`);
  } else {
    if (index === 0) throw new MotionSpecError(`Scene ${label}: the first scene cannot crossfade in`);
    if (transition.frames < 1 || transition.frames > 15 || transition.frames >= previousDuration) throw new MotionSpecError(`Scene ${label}: transition frames must be between 1 and 15 and shorter than the previous scene`);
  }
  return {type: transition.type, frames: transition.frames};
}
const exits = new Set(["cut", "fade"]);

export class MotionSpecError extends Error {}

export function createMotionSpec({storyboard, version, scenes, reducedMotion = "cut", rationale}) {
  if (!storyboard || !Number.isInteger(version) || version < 1 || typeof rationale !== "string" || !rationale.trim()) throw new MotionSpecError("Storyboard, positive version and motion rationale are required");
  if (reducedMotion !== "cut" || !Array.isArray(scenes) || scenes.length !== storyboard.scenes.length) throw new MotionSpecError("Motion must cover every scene and define cut reduced-motion behavior");
  const byId = new Map(storyboard.scenes.map((scene) => [scene.scene_id, scene]));
  const fps = storyboard.fps;
  const values = scenes.map((scene, index) => {
    const unknown = Object.keys(scene).filter((key) => !sceneKeys.has(key));
    if (unknown.length > 0) throw new MotionSpecError(`Scene ${scene.scene_id} declares motion the renderer does not implement: ${unknown.join(", ")}`);
    if ((scene.emphasis === "focus") !== (typeof scene.focus === "string" && scene.focus.trim() !== "")) throw new MotionSpecError(`Scene ${scene.scene_id}: focus text is required exactly when emphasis is focus`);
    const target = byId.get(scene.scene_id);
    if (!target || !entrances.has(scene.entrance) || !emphases.has(scene.emphasis) || !exits.has(scene.exit)) throw new MotionSpecError(`Invalid motion for scene ${scene.scene_id}`);
    for (const field of ["entrance_frames", "exit_frames"]) if (!Number.isInteger(scene[field]) || scene[field] < 0) throw new MotionSpecError(`${field} must be a non-negative integer`);
    const duration = Math.round((target.end_seconds - target.start_seconds) * fps);
    if (scene.entrance_frames + scene.exit_frames >= duration) throw new MotionSpecError(`Motion exceeds scene ${scene.scene_id} duration`);
    if (scene.entrance === "cut" && scene.entrance_frames !== 0 || scene.exit === "cut" && scene.exit_frames !== 0) throw new MotionSpecError("Cut transitions must use zero frames");
    const camera = checkCamera(scene.camera ?? null, scene.scene_id, duration);
    const callouts = checkCallouts(scene.callouts ?? [], scene.scene_id, duration, [target.narration, target.on_screen_text, target.step].filter((value) => typeof value === "string" && value));
    const cursor = checkCursor(scene.cursor ?? null, scene.scene_id, duration);
    if ((camera || callouts.length > 0 || cursor) && target.asset_ids?.length !== 1) throw new MotionSpecError(`Scene ${scene.scene_id}: camera, callouts and cursor need exactly one visual asset in the scene`);
    const previous = index === 0 ? null : storyboard.scenes[index - 1];
    const transition = checkTransition(scene.transition ?? {type: "none", frames: 0}, scene.scene_id, index, previous ? Math.round((previous.end_seconds - previous.start_seconds) * fps) : 0);
    return {scene_id: scene.scene_id, entrance: scene.entrance, entrance_frames: scene.entrance_frames, emphasis: scene.emphasis, exit: scene.exit, exit_frames: scene.exit_frames, focus: scene.focus ?? null, purpose: scene.purpose, camera, callouts, cursor, transition};
  });
  if (new Set(values.map(({scene_id}) => scene_id)).size !== values.length || values.some(({purpose}) => typeof purpose !== "string" || !purpose.trim())) throw new MotionSpecError("Every scene needs unique motion and an explicit purpose");
  const base = {schema_version: 1, project_id: storyboard.project_id, piece_id: storyboard.piece_id, version, storyboard: {storyboard_id: storyboard.storyboard_id, version: storyboard.version, hash: contentHash(storyboard)}, reduced_motion: reducedMotion, rationale, scenes: values};
  return {...base, motion_spec_id: stableId("motion", base), content_hash: contentHash(base)};
}

export function assertMotionSpecCurrent(spec, storyboard) {
  if (!spec || spec.project_id !== storyboard.project_id || spec.piece_id !== storyboard.piece_id || spec.storyboard?.storyboard_id !== storyboard.storyboard_id || spec.storyboard?.version !== storyboard.version || spec.storyboard?.hash !== contentHash(storyboard)) throw new MotionSpecError("Motion specification is stale or belongs to another storyboard");
  const rebuilt = createMotionSpec({storyboard, version: spec.version, scenes: spec.scenes, reducedMotion: spec.reduced_motion, rationale: spec.rationale});
  if (spec.motion_spec_id !== rebuilt.motion_spec_id || spec.content_hash !== rebuilt.content_hash) throw new MotionSpecError("Motion specification identity does not match its contents");
  return spec;
}

// The same scene without anything that moves: cuts instead of fades, the camera held on its final framing, the cursor at rest, no pulse and no crossfade.
export function reduceMotion(scene) {
  const last = scene.cursor?.points.at(-1);
  return {
    ...scene,
    entrance: "cut", entrance_frames: 0, exit: "cut", exit_frames: 0,
    emphasis: scene.emphasis === "pulse" ? "none" : scene.emphasis,
    camera: scene.camera ? {...scene.camera, start: {...scene.camera.end}, from_frame: 0, to_frame: 1} : null,
    cursor: last ? {points: [{x: last.x, y: last.y, frame: 0}, {x: last.x, y: last.y, frame: 1}], click_frame: null} : null,
    transition: {type: "none", frames: 0}
  };
}
