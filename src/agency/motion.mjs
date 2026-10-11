import {contentHash, stableId} from "../core/ids.mjs";

const entrances = new Set(["cut", "fade", "slide-up", "scale"]);
const emphases = new Set(["none", "pulse", "focus"]);
const exits = new Set(["cut", "fade"]);

export class MotionSpecError extends Error {}

export function createMotionSpec({storyboard, version, scenes, reducedMotion = "cut", rationale}) {
  if (!storyboard || !Number.isInteger(version) || version < 1 || typeof rationale !== "string" || !rationale.trim()) throw new MotionSpecError("Storyboard, positive version and motion rationale are required");
  if (reducedMotion !== "cut" || !Array.isArray(scenes) || scenes.length !== storyboard.scenes.length) throw new MotionSpecError("Motion must cover every scene and define cut reduced-motion behavior");
  const byId = new Map(storyboard.scenes.map((scene) => [scene.scene_id, scene]));
  const fps = storyboard.fps;
  const values = scenes.map((scene) => {
    const target = byId.get(scene.scene_id);
    if (!target || !entrances.has(scene.entrance) || !emphases.has(scene.emphasis) || !exits.has(scene.exit)) throw new MotionSpecError(`Invalid motion for scene ${scene.scene_id}`);
    for (const field of ["entrance_frames", "exit_frames"]) if (!Number.isInteger(scene[field]) || scene[field] < 0) throw new MotionSpecError(`${field} must be a non-negative integer`);
    const duration = Math.round((target.end_seconds - target.start_seconds) * fps);
    if (scene.entrance_frames + scene.exit_frames >= duration) throw new MotionSpecError(`Motion exceeds scene ${scene.scene_id} duration`);
    if (scene.entrance === "cut" && scene.entrance_frames !== 0 || scene.exit === "cut" && scene.exit_frames !== 0) throw new MotionSpecError("Cut transitions must use zero frames");
    return {scene_id: scene.scene_id, entrance: scene.entrance, entrance_frames: scene.entrance_frames, emphasis: scene.emphasis, exit: scene.exit, exit_frames: scene.exit_frames, focus: scene.focus ?? null, purpose: scene.purpose};
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
