import Ajv2020 from "ajv/dist/2020.js";
import {createHash} from "node:crypto";
import {readFile} from "node:fs/promises";
import {resolve} from "node:path";
import {contentHash, stableId} from "../core/ids.mjs";
import {measureWav} from "../qa/measure.mjs";

const schema = JSON.parse(await readFile(resolve(import.meta.dirname, "../../schemas/v1/voice-artifact.schema.json"), "utf8"));
const validate = new Ajv2020({allErrors: true, strict: true}).compile(schema);

export class VoiceAdapterError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "VoiceAdapterError";
    this.code = code;
  }
}

function plainObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) {
    throw new VoiceAdapterError("invalid_input", `${label} must be a plain JSON object`);
  }
  return structuredClone(value);
}

const secretKey = /key|token|secret|auth|password|credential|bearer/i;

function assertNoSecretOptions(value, path = "config.options") {
  if (!value || typeof value !== "object") return;
  for (const [name, child] of Object.entries(value)) {
    if (secretKey.test(name)) throw new VoiceAdapterError("secret_in_config", `${path}.${name} looks like a credential; pass the environment-variable name or secret-manager reference to the provider instead`);
    assertNoSecretOptions(child, `${path}.${name}`);
  }
}

function approvedNarration(narration) {
  if (!narration || typeof narration.text !== "string" || narration.text.trim().length === 0) throw new VoiceAdapterError("invalid_input", "narration text is required");
  if (!narration.approval || narration.approval.status !== "approved" || narration.approval.text_hash !== contentHash(narration.text)) {
    throw new VoiceAdapterError("approval_required", "voice generation requires approval bound to the exact narration text");
  }
  return narration.text;
}

function requestIdentity({pieceId, sceneId, text, config}) {
  assertNoSecretOptions(config.options ?? {});
  const normalized = {
    provider: config.provider,
    model: config.model,
    voice_id: config.voice_id,
    language: config.language,
    pronunciations: config.pronunciations ?? [],
    options: plainObject(config.options ?? {}, "config.options")
  };
  for (const field of ["provider", "model", "voice_id", "language"]) if (typeof normalized[field] !== "string" || normalized[field].length === 0) throw new VoiceAdapterError("invalid_input", `config.${field} is required`);
  if (!Array.isArray(normalized.pronunciations)) throw new VoiceAdapterError("invalid_input", "config.pronunciations must be an array");
  return {
    normalized,
    textHash: contentHash(text),
    configurationHash: contentHash(normalized),
    requestHash: contentHash({piece_id: pieceId, scene_id: sceneId, text, configuration: normalized})
  };
}

// Narration must be WAV so its length is measured here, never trusted from the provider.
function measuredAudio(response) {
  if (response.audio_bytes == null) return null;
  if (response.content_type !== "audio/wav") throw new VoiceAdapterError("unsupported_audio", `narration audio must be audio/wav, not ${response.content_type}`);
  try { return measureWav(response.audio_bytes).duration_seconds; } catch { throw new VoiceAdapterError("unsupported_audio", "the provider returned audio that is not a measurable WAV file"); }
}

function artifact({pieceId, sceneId, identity, response}) {
  const measuredDuration = measuredAudio(response);
  const audio = response.audio_bytes == null ? null : {
    content_type: response.content_type,
    sha256: createHash("sha256").update(response.audio_bytes).digest("hex"),
    bytes: response.audio_bytes.length
  };
  const value = {
    schema_version: 1,
    voice_artifact_id: stableId("voice", identity.requestHash),
    piece_id: pieceId,
    scene_id: sceneId,
    text_hash: identity.textHash,
    configuration_hash: identity.configurationHash,
    request_hash: identity.requestHash,
    provider: identity.normalized.provider,
    model: identity.normalized.model,
    voice_id: identity.normalized.voice_id,
    options: identity.normalized.options,
    status: response.status,
    provider_job_id: response.provider_job_id ?? null,
    known_cost: response.known_cost ?? null,
    currency: response.currency ?? null,
    duration_seconds: measuredDuration ?? response.duration_seconds ?? null,
    alignment: response.alignment ?? null,
    audio,
    limitations: response.limitations ?? []
  };
  if (!validate(value)) throw new VoiceAdapterError("invalid_provider_response", (validate.errors ?? []).map(({instancePath, message}) => `${instancePath || "/"}: ${message}`).join("; "));
  if (value.status === "succeeded" && value.audio === null) throw new VoiceAdapterError("invalid_provider_response", "successful voice jobs require audio bytes");
  return value;
}

export async function voiceCapability(provider) {
  if (!provider || typeof provider.capability !== "function" || typeof provider.submit !== "function") return {status: "unavailable", reason: "No voice provider is configured"};
  const result = await provider.capability();
  return result?.status === "available" ? {status: "available", reason: null} : {status: "unavailable", reason: result?.reason ?? "Voice provider is unavailable"};
}

export async function generateVoice({pieceId, sceneId, narration, config, provider, cache = new Map(), budget = {currency: null, remaining: null}}) {
  if (typeof pieceId !== "string" || !pieceId || typeof sceneId !== "string" || !sceneId) throw new VoiceAdapterError("invalid_input", "pieceId and sceneId are required");
  const text = approvedNarration(narration);
  const identity = requestIdentity({pieceId, sceneId, text, config: plainObject(config, "config")});
  if (cache.has(identity.requestHash)) { const cached = cache.get(identity.requestHash); return {artifact: structuredClone(cached.artifact), audio_bytes: cached.audio_bytes, cache_hit: true}; }
  const capability = await voiceCapability(provider);
  if (capability.status !== "available") {
    const result = artifact({pieceId, sceneId, identity, response: {status: "unavailable", limitations: [capability.reason]}});
    return {artifact: result, audio_bytes: null, cache_hit: false};
  }
  if (budget.remaining !== null) {
    const estimate = typeof provider.estimate === "function" ? await provider.estimate({text, configuration: identity.normalized}) : null;
    const known = Number.isFinite(estimate?.amount) && estimate.amount >= 0 && (!budget.currency || estimate.currency === budget.currency);
    if (!known || estimate.amount > budget.remaining) throw new VoiceAdapterError("budget_exceeded", "voice request cost is unknown or outside the configured remaining budget");
  }
  let response;
  try {
    response = await provider.submit({text, configuration: identity.normalized, request_hash: identity.requestHash});
  } catch (error) {
    response = {status: "failed", limitations: [`Provider submission failed (${typeof error?.code === "string" ? error.code : error?.name ?? "Error"}); provider error text is not persisted`]};
  }
  const result = artifact({pieceId, sceneId, identity, response});
  const audio_bytes = response.audio_bytes ?? null;
  if (["succeeded", "uncertain"].includes(result.status)) cache.set(identity.requestHash, {artifact: structuredClone(result), audio_bytes});
  return {artifact: result, audio_bytes, cache_hit: false};
}

export async function queryUncertainVoice({record, provider, cache = new Map()}) {
  if (record?.status !== "uncertain" || !record.provider_job_id) throw new VoiceAdapterError("invalid_input", "an uncertain record with provider_job_id is required");
  if (!provider || typeof provider.query !== "function") throw new VoiceAdapterError("query_unavailable", "provider cannot query uncertain jobs; do not resubmit automatically");
  const response = await provider.query(record.provider_job_id);
  const identity = {requestHash: record.request_hash, textHash: record.text_hash, configurationHash: record.configuration_hash, normalized: {provider: record.provider, model: record.model, voice_id: record.voice_id, options: record.options}};
  const result = artifact({pieceId: record.piece_id, sceneId: record.scene_id, identity, response: {...response, provider_job_id: response.provider_job_id ?? record.provider_job_id}});
  if (["succeeded", "failed"].includes(result.status)) cache.set(result.request_hash, {artifact: structuredClone(result), audio_bytes: response.audio_bytes ?? null});
  return {artifact: result, audio_bytes: response.audio_bytes ?? null};
}

// A short, valid WAV: one soft tone burst per word. It stands in for a voice in tests and drafts and is never presented as speech.
export function synthesizeToneNarration(text, {sampleRate = 24000, secondsPerWord = 0.38} = {}) {
  const words = text.split(/\s+/).filter(Boolean);
  const wordSamples = Math.round(sampleRate * secondsPerWord);
  const pcm = Buffer.alloc(words.length * wordSamples * 2);
  words.forEach((word, index) => {
    const frequency = 180 + ((word.length * 37 + index * 23) % 160);
    for (let sample = 0; sample < wordSamples; sample += 1) {
      const envelope = Math.min(1, sample / 400, (wordSamples - sample) / 1200);
      pcm.writeInt16LE(Math.round(Math.sin((2 * Math.PI * frequency * sample) / sampleRate) * 6000 * envelope * (sample < wordSamples * 0.8 ? 1 : 0)), (index * wordSamples + sample) * 2);
    }
  });
  const header = Buffer.alloc(44);
  header.write("RIFF", 0); header.writeUInt32LE(36 + pcm.length, 4); header.write("WAVEfmt ", 8); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24); header.writeUInt32LE(sampleRate * 2, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34); header.write("data", 36); header.writeUInt32LE(pcm.length, 40);
  return {audio_bytes: Buffer.concat([header, pcm]), alignment: words.map((word, index) => ({start_seconds: index * secondsPerWord, end_seconds: (index + 1) * secondsPerWord, text: word})), duration_seconds: words.length * secondsPerWord};
}

export function createDeterministicVoiceProvider({mode = "success"} = {}) {
  const jobs = new Map();
  const success = (request, jobId) => {
    const tone = synthesizeToneNarration(request.text);
    return {status: "succeeded", provider_job_id: jobId, known_cost: 0.01, currency: "USD", duration_seconds: tone.duration_seconds, alignment: tone.alignment, content_type: "audio/wav", audio_bytes: tone.audio_bytes, limitations: ["Synthetic tones, not speech: for tests and drafts only"]};
  };
  return {
    async capability() { return mode === "unavailable" ? {status: "unavailable", reason: "Synthetic provider disabled"} : {status: "available"}; },
    async estimate() { return {amount: 0.01, currency: "USD"}; },
    async submit(request) {
      if (mode === "throw") throw new Error("synthetic failure");
      if (mode === "uncertain") {
        const provider_job_id = stableId("voice-job", request.request_hash);
        jobs.set(provider_job_id, request);
        return {status: "uncertain", provider_job_id, known_cost: null, currency: "USD", limitations: ["Provider outcome is uncertain; query before resubmission"]};
      }
      return success(request, stableId("voice-job", request.request_hash));
    },
    async query(jobId) {
      const request = jobs.get(jobId);
      if (!request) return {status: "failed", limitations: ["Synthetic job was not found"]};
      return {...success(request, jobId), alignment: null};
    }
  };
}
