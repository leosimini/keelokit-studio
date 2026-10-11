import Ajv2020 from "ajv/dist/2020.js";
import {createHash} from "node:crypto";
import {readFile} from "node:fs/promises";
import {resolve} from "node:path";
import {contentHash, stableId} from "../core/ids.mjs";

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

function approvedNarration(narration) {
  if (!narration || typeof narration.text !== "string" || narration.text.trim().length === 0) throw new VoiceAdapterError("invalid_input", "narration text is required");
  if (!narration.approval || narration.approval.status !== "approved" || narration.approval.text_hash !== contentHash(narration.text)) {
    throw new VoiceAdapterError("approval_required", "voice generation requires approval bound to the exact narration text");
  }
  return narration.text;
}

function requestIdentity({pieceId, sceneId, text, config}) {
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

function artifact({pieceId, sceneId, identity, response}) {
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
    duration_seconds: response.duration_seconds ?? null,
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
  if (cache.has(identity.requestHash)) return {artifact: structuredClone(cache.get(identity.requestHash)), cache_hit: true};
  const capability = await voiceCapability(provider);
  if (capability.status !== "available") {
    const result = artifact({pieceId, sceneId, identity, response: {status: "unavailable", limitations: [capability.reason]}});
    return {artifact: result, cache_hit: false};
  }
  if (budget.remaining !== null && typeof provider.estimate === "function") {
    const estimate = await provider.estimate({text, configuration: identity.normalized});
    if (estimate?.amount > budget.remaining || (budget.currency && estimate?.currency !== budget.currency)) throw new VoiceAdapterError("budget_exceeded", "voice request is outside the configured remaining budget");
  }
  let response;
  try {
    response = await provider.submit({text, configuration: identity.normalized, request_hash: identity.requestHash});
  } catch (error) {
    response = {status: "failed", limitations: [`Provider submission failed: ${error.message}`]};
  }
  const result = artifact({pieceId, sceneId, identity, response});
  if (["succeeded", "failed", "uncertain"].includes(result.status)) cache.set(identity.requestHash, structuredClone(result));
  return {artifact: result, cache_hit: false};
}

export async function queryUncertainVoice({record, provider, cache = new Map()}) {
  if (record?.status !== "uncertain" || !record.provider_job_id) throw new VoiceAdapterError("invalid_input", "an uncertain record with provider_job_id is required");
  if (!provider || typeof provider.query !== "function") throw new VoiceAdapterError("query_unavailable", "provider cannot query uncertain jobs; do not resubmit automatically");
  const response = await provider.query(record.provider_job_id);
  const identity = {requestHash: record.request_hash, textHash: record.text_hash, configurationHash: record.configuration_hash, normalized: {provider: record.provider, model: record.model, voice_id: record.voice_id, options: record.options}};
  const result = artifact({pieceId: record.piece_id, sceneId: record.scene_id, identity, response: {...response, provider_job_id: response.provider_job_id ?? record.provider_job_id}});
  if (["succeeded", "failed"].includes(result.status)) cache.set(result.request_hash, structuredClone(result));
  return result;
}

export function createDeterministicVoiceProvider({mode = "success"} = {}) {
  const jobs = new Map();
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
      return {status: "succeeded", provider_job_id: stableId("voice-job", request.request_hash), known_cost: 0.01, currency: "USD", duration_seconds: 1, alignment: [{start_seconds: 0, end_seconds: 1, text: request.text}], content_type: "audio/wav", audio_bytes: Buffer.from(`synthetic:${request.request_hash}`), limitations: ["Synthetic audio does not validate provider quality"]};
    },
    async query(jobId) {
      const request = jobs.get(jobId);
      if (!request) return {status: "failed", limitations: ["Synthetic job was not found"]};
      return {status: "succeeded", provider_job_id: jobId, known_cost: 0.01, currency: "USD", duration_seconds: 1, alignment: null, content_type: "audio/wav", audio_bytes: Buffer.from(`synthetic:${request.request_hash}`), limitations: ["Timing alignment was not supplied"]};
    }
  };
}
