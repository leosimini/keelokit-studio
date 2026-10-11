import assert from "node:assert/strict";
import test from "node:test";
import {contentHash} from "../src/core/ids.mjs";
import {createDeterministicVoiceProvider, generateVoice, queryUncertainVoice, voiceCapability, VoiceAdapterError} from "../src/adapters/voice.mjs";
import {measureWav} from "../src/qa/measure.mjs";
import {createHash} from "node:crypto";

const text = "Complete the verified task.";
const narration = {text, approval: {status: "approved", text_hash: contentHash(text)}};
const config = {provider: "synthetic", model: "fixture-v1", voice_id: "configured-voice", language: "en-US", pronunciations: [], options: {pace: 1}};
const base = {pieceId: "piece-one", sceneId: "scene-one", narration, config};

test("generates traceable optional audio and reuses the exact cached request", async () => {
  const cache = new Map();
  const provider = createDeterministicVoiceProvider();
  const first = await generateVoice({...base, provider, cache, budget: {currency: "USD", remaining: 1}});
  const second = await generateVoice({...base, provider, cache});
  assert.equal(first.artifact.status, "succeeded");
  assert.equal(first.artifact.text_hash, contentHash(text));
  assert.ok(Math.abs(first.artifact.duration_seconds - 1.52) < 0.001);
  assert.equal(second.cache_hit, true);
  assert.deepEqual(second.artifact, first.artifact);
});

test("changed text changes identity without affecting unrelated work", async () => {
  const provider = createDeterministicVoiceProvider();
  const first = await generateVoice({...base, provider});
  const changed = "Complete the verified task carefully.";
  const second = await generateVoice({...base, provider, narration: {text: changed, approval: {status: "approved", text_hash: contentHash(changed)}}});
  assert.notEqual(first.artifact.request_hash, second.artifact.request_hash);
  assert.equal(first.artifact.piece_id, second.artifact.piece_id);
});

test("requires exact narration approval and enforces configured budget", async () => {
  const provider = createDeterministicVoiceProvider();
  await assert.rejects(() => generateVoice({...base, provider, narration: {text, approval: {status: "approved", text_hash: contentHash("other")}}}), (error) => error instanceof VoiceAdapterError && error.code === "approval_required");
  await assert.rejects(() => generateVoice({...base, provider, budget: {currency: "USD", remaining: 0}}), (error) => error.code === "budget_exceeded");
});

test("declares unavailable and failed providers without fabricating audio", async () => {
  assert.deepEqual(await voiceCapability(null), {status: "unavailable", reason: "No voice provider is configured"});
  const unavailable = await generateVoice({...base, provider: createDeterministicVoiceProvider({mode: "unavailable"})});
  const failed = await generateVoice({...base, provider: createDeterministicVoiceProvider({mode: "throw"})});
  assert.equal(unavailable.artifact.status, "unavailable");
  assert.equal(failed.artifact.status, "failed");
  assert.equal(unavailable.artifact.audio, null);
  assert.equal(failed.artifact.audio, null);
});

test("queries uncertain provider jobs before any resubmission", async () => {
  const provider = createDeterministicVoiceProvider({mode: "uncertain"});
  const cache = new Map();
  const uncertain = await generateVoice({...base, provider, cache});
  assert.equal(uncertain.artifact.status, "uncertain");
  const repeated = await generateVoice({...base, provider, cache});
  assert.equal(repeated.cache_hit, true);
  assert.equal(repeated.artifact.provider_job_id, uncertain.artifact.provider_job_id);
  const resolved = await queryUncertainVoice({record: uncertain.artifact, provider, cache});
  assert.equal(resolved.artifact.status, "succeeded");
  assert.equal(resolved.artifact.provider_job_id, uncertain.artifact.provider_job_id);
  assert.ok(Buffer.isBuffer(resolved.audio_bytes));
  await assert.rejects(() => queryUncertainVoice({record: uncertain.artifact, provider: {}}), /do not resubmit automatically/);
});

test("never persists secrets from provider options or provider error text", async () => {
  const base = {pieceId: "piece-one", sceneId: "scene-one", narration, provider: createDeterministicVoiceProvider()};
  await assert.rejects(() => generateVoice({...base, config: {...config, options: {headers: {Authorization: "Bearer sk-OPT-456"}}}}), (error) => error.code === "secret_in_config" && !/sk-OPT/.test(error.message));
  await assert.rejects(() => generateVoice({...base, config: {...config, options: {api_key: "sk-OPT-456"}}}), /secret_in_config|credential/);
  const leaking = {capability: async () => ({status: "available"}), submit: async () => { throw new Error("401 for https://api.tts.test/v1?key=sk-LIVE-123"); }};
  const {artifact} = await generateVoice({...base, config, provider: leaking});
  assert.equal(artifact.status, "failed");
  assert.doesNotMatch(JSON.stringify(artifact), /sk-LIVE-123/);
});

test("fails closed when a budget is set but the cost cannot be established", async () => {
  const base = {pieceId: "piece-one", sceneId: "scene-one", narration, config};
  const submit = async () => { throw new Error("must not be called"); };
  for (const provider of [{capability: async () => ({status: "available"}), submit}, {capability: async () => ({status: "available"}), estimate: async () => ({}), submit}, {capability: async () => ({status: "available"}), estimate: async () => ({amount: Number.NaN, currency: "USD"}), submit}]) {
    await assert.rejects(() => generateVoice({...base, provider, budget: {currency: "USD", remaining: 0.001}}), (error) => error.code === "budget_exceeded");
  }
});

test("does not replay a failed provider result from cache", async () => {
  let calls = 0;
  const flaky = {capability: async () => ({status: "available"}), submit: async (request) => { calls += 1; if (calls === 1) throw new Error("transient"); return createDeterministicVoiceProvider().submit(request); }};
  const cache = new Map();
  const base = {pieceId: "piece-one", sceneId: "scene-one", narration, config, provider: flaky, cache};
  assert.equal((await generateVoice(base)).artifact.status, "failed");
  const second = await generateVoice(base);
  assert.equal(second.cache_hit, false);
  assert.equal(second.artifact.status, "succeeded");
});

test("returns the measured audio itself, not only its hash, and rejects audio it cannot place in a video", async () => {
  const provider = createDeterministicVoiceProvider();
  const cache = new Map();
  const first = await generateVoice({...base, provider, cache});
  assert.ok(Buffer.isBuffer(first.audio_bytes));
  assert.equal(createHash("sha256").update(first.audio_bytes).digest("hex"), first.artifact.audio.sha256);
  assert.equal(first.artifact.audio.content_type, "audio/wav");
  assert.ok(Math.abs(measureWav(first.audio_bytes).duration_seconds - first.artifact.duration_seconds) < 0.001, "the artifact carries the measured duration");
  assert.deepEqual(first.artifact.alignment.map(({text}) => text).join(" "), text);
  const again = await generateVoice({...base, provider, cache});
  assert.equal(again.cache_hit, true);
  assert.deepEqual(again.audio_bytes, first.audio_bytes);
  const lying = {capability: async () => ({status: "available"}), submit: async () => ({status: "succeeded", content_type: "audio/wav", audio_bytes: first.audio_bytes, duration_seconds: 99, known_cost: 0, currency: "USD", limitations: []})};
  assert.ok(Math.abs((await generateVoice({...base, provider: lying, config: {...config, voice_id: "other"}})).artifact.duration_seconds - first.artifact.duration_seconds) < 0.001, "a provider-reported duration never overrides the measured one");
  const mp3 = {capability: async () => ({status: "available"}), submit: async () => ({status: "succeeded", content_type: "audio/mpeg", audio_bytes: Buffer.from("ID3"), duration_seconds: 2, known_cost: 0, currency: "USD", limitations: []})};
  await assert.rejects(() => generateVoice({...base, provider: mp3, config: {...config, voice_id: "mp3"}}), (error) => error.code === "unsupported_audio");
  const broken = {capability: async () => ({status: "available"}), submit: async () => ({status: "succeeded", content_type: "audio/wav", audio_bytes: Buffer.from("<html>not audio</html>"), duration_seconds: 5, known_cost: 0, currency: "USD", limitations: []})};
  await assert.rejects(() => generateVoice({...base, provider: broken, config: {...config, voice_id: "broken"}}), (error) => error.code === "unsupported_audio");
});
