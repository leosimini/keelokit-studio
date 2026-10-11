import assert from "node:assert/strict";
import test from "node:test";
import {createMotionSpec, assertMotionSpecCurrent, MotionSpecError} from "../src/agency/motion.mjs";

const storyboard = {schema_version: 1, storyboard_id: "storyboard-one", version: 1, project_id: "product-one", piece_id: "piece-one", fps: 30, scenes: [{scene_id: "scene-one", start_seconds: 0, end_seconds: 2}]};
const scenes = [{scene_id: "scene-one", entrance: "fade", entrance_frames: 6, emphasis: "focus", exit: "fade", exit_frames: 6, focus: "verified result", purpose: "Reveal the product proof after the promise"}];

test("binds explicit per-scene motion and reduced-motion treatment to the storyboard", () => {
  const spec = createMotionSpec({storyboard, version: 1, scenes, rationale: "Motion guides attention to proof", reducedMotion: "cut"});
  assert.equal(assertMotionSpecCurrent(spec, storyboard), spec);
  assert.match(spec.content_hash, /^sha256:/);
  assert.throws(() => assertMotionSpecCurrent(spec, {...storyboard, version: 2}), /stale/);
});

test("rejects incomplete, unsupported and overlong animation cues", () => {
  assert.throws(() => createMotionSpec({storyboard, version: 1, scenes: [], rationale: "Missing"}), MotionSpecError);
  assert.throws(() => createMotionSpec({storyboard, version: 1, scenes: [{...scenes[0], entrance: "spin"}], rationale: "Unsupported"}), /Invalid motion/);
  assert.throws(() => createMotionSpec({storyboard, version: 1, scenes: [{...scenes[0], entrance_frames: 30, exit_frames: 30}], rationale: "Too long"}), /exceeds/);
});

test("rejects motion props the renderer does not implement and inconsistent focus", () => {
  const base = {scene_id: "scene-one", entrance: "fade", entrance_frames: 6, emphasis: "none", exit: "cut", exit_frames: 0, purpose: "Introduce the result"};
  const spec = (scene) => createMotionSpec({storyboard, version: 1, scenes: [scene], rationale: "Test"});
  assert.throws(() => spec({...base, easing: "ease-in"}), /does not implement: easing/);
  assert.throws(() => spec({...base, delay_frames: 3}), /does not implement/);
  assert.throws(() => spec({...base, focus: "a result"}), /focus text/);
  assert.throws(() => spec({...base, emphasis: "focus"}), /focus text/);
});

const rich = {
  storyboard: {schema_version: 1, storyboard_id: "storyboard-rich", version: 1, project_id: "product-one", piece_id: "piece-rich", fps: 30, scenes: [
    {scene_id: "scene-a", start_seconds: 0, end_seconds: 3, narration: "Open the board.", on_screen_text: "Open the board", step: null, asset_ids: ["asset-a"]},
    {scene_id: "scene-b", start_seconds: 3, end_seconds: 6, narration: "Assign the job.", on_screen_text: "Assign the job", step: "Assign the job", asset_ids: ["asset-b"]},
    {scene_id: "scene-c", start_seconds: 6, end_seconds: 8, narration: "Done.", on_screen_text: "Done", step: null, asset_ids: []}
  ]}
};
const base = (id) => ({scene_id: id, entrance: "fade", entrance_frames: 6, emphasis: "none", exit: "cut", exit_frames: 0, focus: null, purpose: "Introduce the scene"});
const full = () => [
  {...base("scene-a"), camera: {start: {x: 0.5, y: 0.5, zoom: 1}, end: {x: 0.25, y: 0.3, zoom: 2.5}, from_frame: 20, to_frame: 70, easing: "ease-in-out"}, callouts: [{region: {x: 0.1, y: 0.1, width: 0.3, height: 0.2}, label: "Open the board", start_frame: 30, end_frame: 80, style: "box"}], cursor: null, transition: {type: "none", frames: 0}},
  {...base("scene-b"), camera: null, callouts: [], cursor: {points: [{x: 0.2, y: 0.2, frame: 10}, {x: 0.6, y: 0.5, frame: 40}], click_frame: 45}, transition: {type: "crossfade", frames: 8}},
  {...base("scene-c"), camera: null, callouts: [], cursor: null, transition: {type: "none", frames: 0}}
];
const spec = (mutate) => { const scenes = full(); mutate?.(scenes); return createMotionSpec({storyboard: rich.storyboard, version: 1, scenes, rationale: "Guide the eye through the task"}); };

test("accepts camera moves, callouts, a cursor path and a crossfade, and binds them into the spec identity", () => {
  const value = spec();
  assert.equal(value.scenes[0].camera.end.zoom, 2.5);
  assert.equal(value.scenes[1].transition.type, "crossfade");
  assert.equal(assertMotionSpecCurrent(value, rich.storyboard), value);
  assert.notEqual(spec((s) => { s[0].camera.end.zoom = 3; }).content_hash, value.content_hash);
  const plain = createMotionSpec({storyboard, version: 1, scenes, rationale: "Existing specs stay valid"});
  assert.equal(plain.scenes[0].camera, null);
  assert.deepEqual(plain.scenes[0].callouts, []);
});

test("rejects cameras, callouts, cursors and transitions that cannot be rendered faithfully", () => {
  const rejects = (mutate, pattern) => assert.throws(() => spec(mutate), pattern);
  rejects((s) => { s[0].camera.end.zoom = 9; }, /zoom/);
  rejects((s) => { s[0].camera.start.zoom = 0.5; }, /zoom/);
  rejects((s) => { s[0].camera.end.x = 1.2; }, /focal point/);
  rejects((s) => { s[0].camera.to_frame = 10; }, /camera frames/);
  rejects((s) => { s[0].camera.to_frame = 90; }, /camera frames/);
  rejects((s) => { s[0].camera.easing = "bounce"; }, /easing/);
  rejects((s) => { s[2].camera = {...s[0].camera, from_frame: 5, to_frame: 50}; }, /visual asset/);
  rejects((s) => { s[0].callouts[0].region.width = 0.95; }, /region/);
  rejects((s) => { s[0].callouts[0].label = "Guaranteed 10x"; }, /label/);
  rejects((s) => { s[0].callouts[0].end_frame = 200; }, /callout frames/);
  rejects((s) => { s[0].callouts = [1, 2, 3, 4].map(() => ({...full()[0].callouts[0]})); }, /at most 3/);
  rejects((s) => { s[1].cursor.points = [s[1].cursor.points[0]]; }, /cursor/);
  rejects((s) => { s[1].cursor.points[1].frame = 5; }, /cursor/);
  rejects((s) => { s[1].cursor.click_frame = 999; }, /click_frame/);
  rejects((s) => { s[0].transition = {type: "crossfade", frames: 8}; }, /first scene/);
  rejects((s) => { s[1].transition = {type: "crossfade", frames: 0}; }, /transition/);
  rejects((s) => { s[1].transition = {type: "wipe", frames: 8}; }, /transition/);
  rejects((s) => { s[1].transition = {type: "crossfade", frames: 40}; }, /transition/);
  rejects((s) => { s[0].spin = true; }, /does not implement: spin/);
});
