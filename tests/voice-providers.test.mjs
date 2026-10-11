import assert from "node:assert/strict";
import {createServer} from "node:http";
import {resolve} from "node:path";
import test from "node:test";
import {contentHash} from "../src/core/ids.mjs";
import {generateVoice, synthesizeToneNarration} from "../src/adapters/voice.mjs";
import {createMacSayProvider, createOpenAiCompatibleSpeechProvider} from "../src/adapters/voice-providers.mjs";

const text = "Assign the job from the board.";
const narration = {text, approval: {status: "approved", text_hash: contentHash(text)}};
const config = {provider: "speech", model: "tts-1", voice_id: "alloy", language: "en-US", pronunciations: [], options: {speed: 1}};
const base = {pieceId: "piece-one", sceneId: "scene-one", narration, config};

async function withServer(handler, run) {
  const requests = [];
  const server = createServer(async (request, response) => {
    const chunks = []; for await (const chunk of request) chunks.push(chunk);
    requests.push({url: request.url, headers: request.headers, body: Buffer.concat(chunks).toString("utf8")});
    handler(request, response, requests.at(-1));
  });
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  try { await run({endpoint: `http://127.0.0.1:${server.address().port}/v1/audio/speech`, requests}); } finally { await new Promise((done) => server.close(done)); }
}

test("the OpenAI-compatible provider sends the narration, reads the key from the named variable and returns measured WAV", async () => {
  const wav = synthesizeToneNarration(text).audio_bytes;
  await withServer((request, response) => { response.writeHead(200, {"content-type": "audio/wav"}); response.end(wav); }, async ({endpoint, requests}) => {
    const provider = createOpenAiCompatibleSpeechProvider({endpoint, apiKeyEnv: "STUDIO_TEST_TTS_KEY", env: {STUDIO_TEST_TTS_KEY: "sk-test-123"}, pricing: {currency: "USD", per_character: 0.00001}});
    const result = await generateVoice({...base, provider, budget: {currency: "USD", remaining: 1}});
    assert.equal(result.artifact.status, "succeeded");
    assert.deepEqual(result.audio_bytes, wav);
    assert.equal(requests[0].headers.authorization, "Bearer sk-test-123");
    assert.deepEqual(JSON.parse(requests[0].body), {model: "tts-1", voice: "alloy", input: text, response_format: "wav", speed: 1});
    assert.equal(result.artifact.known_cost, text.length * 0.00001);
    assert.doesNotMatch(JSON.stringify(result.artifact), /sk-test-123/);
  });
});

test("the OpenAI-compatible provider is unavailable without its key, fails without leaking the response, and refuses unsafe endpoints", async () => {
  const missing = createOpenAiCompatibleSpeechProvider({endpoint: "https://api.example.test/v1/audio/speech", apiKeyEnv: "STUDIO_TEST_TTS_KEY", env: {}});
  assert.deepEqual(await missing.capability(), {status: "unavailable", reason: "Environment variable STUDIO_TEST_TTS_KEY is not set"});
  assert.equal((await generateVoice({...base, provider: missing})).artifact.status, "unavailable");
  await withServer((request, response) => { response.writeHead(401, {"content-type": "application/json"}); response.end('{"error":"bad key sk-live-999"}'); }, async ({endpoint}) => {
    const provider = createOpenAiCompatibleSpeechProvider({endpoint, apiKeyEnv: "STUDIO_TEST_TTS_KEY", env: {STUDIO_TEST_TTS_KEY: "sk-test-123"}});
    const result = await generateVoice({...base, provider});
    assert.equal(result.artifact.status, "failed");
    assert.doesNotMatch(JSON.stringify(result.artifact), /sk-live-999|sk-test-123/);
    assert.match(result.artifact.limitations.join(" "), /HTTP 401/);
  });
  await withServer((request, response) => { response.writeHead(200, {"content-type": "text/html"}); response.end("<html>login</html>"); }, async ({endpoint}) => {
    const result = await generateVoice({...base, provider: createOpenAiCompatibleSpeechProvider({endpoint, apiKeyEnv: null})});
    assert.equal(result.artifact.status, "failed");
  });
  assert.throws(() => createOpenAiCompatibleSpeechProvider({endpoint: "http://api.example.test/v1/audio/speech", apiKeyEnv: "K"}), /https/);
  assert.throws(() => createOpenAiCompatibleSpeechProvider({endpoint: "https://user:pw@api.example.test/x", apiKeyEnv: "K"}), /credentials/);
  assert.throws(() => createOpenAiCompatibleSpeechProvider({endpoint: "https://api.example.test/x", apiKeyEnv: "sk-live-abc123def456ghi789"}), /environment variable name/);
});

test("the macOS provider drives `say` with the text in a file, never in arguments, and returns measured WAV", async () => {
  const say = resolve("tests/support/fake-say.mjs");
  const provider = createMacSayProvider({sayPath: say, platform: "darwin"});
  assert.equal((await provider.capability()).status, "available");
  const result = await generateVoice({...base, config: {...config, provider: "macos-say", model: "say", voice_id: "Monica", options: {}}, provider});
  assert.equal(result.artifact.status, "succeeded");
  assert.ok(result.artifact.duration_seconds > 1);
  assert.equal((await createMacSayProvider({sayPath: say, platform: "linux"}).capability()).status, "unavailable");
  assert.equal((await createMacSayProvider({sayPath: "/does/not/exist", platform: "darwin"}).capability()).status, "unavailable");
  const unsafe = await generateVoice({...base, config: {...config, provider: "macos-say", model: "say", voice_id: "Monica; rm -rf /", options: {}}, provider});
  assert.equal(unsafe.artifact.status, "failed");
  assert.match(unsafe.artifact.limitations.join(" "), /voice/i);
});
