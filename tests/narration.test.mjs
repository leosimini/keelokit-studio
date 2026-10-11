import assert from "node:assert/strict";
import {mkdtemp, readFile, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {resolve} from "node:path";
import test from "node:test";
import {contentHash} from "../src/core/ids.mjs";
import {createDeterministicVoiceProvider, generateVoice} from "../src/adapters/voice.mjs";
import {persistNarration, NarrationError} from "../src/assets/narration.mjs";

const text = "Complete the verified task.";
const voice = () => generateVoice({pieceId: "piece-one", sceneId: "scene-one", narration: {text, approval: {status: "approved", text_hash: contentHash(text)}}, config: {provider: "synthetic", model: "m", voice_id: "v", language: "en-US", pronunciations: [], options: {}}, provider: createDeterministicVoiceProvider()});

test("saves narration audio and its voice artifact in the project and returns a valid audio asset", async () => {
  const projectRoot = await mkdtemp(resolve(tmpdir(), "keelokit-narration-"));
  try {
    const result = await voice();
    const saved = await persistNarration({projectRoot, projectId: "project-one", voice: result});
    assert.equal(saved.asset.kind, "audio");
    assert.match(saved.audio_path, /^media\/studio\/audio\/voice-.*\.wav$/);
    assert.deepEqual(await readFile(resolve(projectRoot, saved.audio_path)), result.audio_bytes);
    assert.equal(JSON.parse(await readFile(resolve(projectRoot, saved.artifact_path), "utf8")).text_hash, contentHash(text));
    assert.equal((await persistNarration({projectRoot, projectId: "project-one", voice: result})).asset.asset_id, saved.asset.asset_id, "saving the same narration twice is idempotent");
    await assert.rejects(() => persistNarration({projectRoot, projectId: "project-one", voice: {...result, audio_bytes: Buffer.from("tampered")}}), NarrationError);
    await assert.rejects(() => persistNarration({projectRoot, projectId: "project-one", voice: {artifact: {...result.artifact, status: "failed"}, audio_bytes: null}}), NarrationError);
  } finally {
    await rm(projectRoot, {recursive: true, force: true});
  }
});
