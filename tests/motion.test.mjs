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
