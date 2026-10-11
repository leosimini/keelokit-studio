import {execFile} from "node:child_process";
import {mkdtemp, readFile, rm, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {resolve} from "node:path";
import {promisify} from "node:util";
import {measureWav} from "../qa/measure.mjs";

const execFileAsync = promisify(execFile);
const wavSignature = (bytes) => bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WAVE";
const envName = /^[A-Z][A-Z0-9_]{1,63}$/;

function safeEndpoint(endpoint) {
  const url = new URL(endpoint);
  if (url.username || url.password) throw new TypeError("endpoint must not contain credentials");
  const loopback = ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) throw new TypeError("endpoint must use https (plain http is only allowed for a local server)");
  return url.href;
}

// Works with any service that implements POST /v1/audio/speech and can answer in WAV (hosted services and local servers).
// The key is read from the named environment variable at call time and is never stored, logged or returned.
export function createOpenAiCompatibleSpeechProvider({endpoint, apiKeyEnv = null, env = process.env, fetchImpl = globalThis.fetch, pricing = null, timeoutMs = 60000}) {
  const url = safeEndpoint(endpoint);
  if (apiKeyEnv !== null && !envName.test(apiKeyEnv)) throw new TypeError("apiKeyEnv must be an environment variable name such as SPEECH_API_KEY, never the key itself");
  return {
    async capability() {
      if (apiKeyEnv !== null && !env[apiKeyEnv]) return {status: "unavailable", reason: `Environment variable ${apiKeyEnv} is not set`};
      return {status: "available"};
    },
    async estimate({text}) {
      return pricing ? {amount: text.length * pricing.per_character, currency: pricing.currency} : {};
    },
    async submit({text, configuration}) {
      const headers = {"content-type": "application/json", ...(apiKeyEnv === null ? {} : {authorization: `Bearer ${env[apiKeyEnv]}`})};
      const body = {model: configuration.model, voice: configuration.voice_id, input: text, response_format: "wav", ...(Number.isFinite(configuration.options?.speed) ? {speed: configuration.options.speed} : {})};
      let response;
      try {
        response = await fetchImpl(url, {method: "POST", headers, body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs), redirect: "error"});
      } catch {
        return {status: "failed", limitations: ["The speech service could not be reached"]};
      }
      if (!response.ok) return {status: "failed", limitations: [`The speech service answered HTTP ${response.status}`]};
      const bytes = Buffer.from(await response.arrayBuffer());
      if (!wavSignature(bytes)) return {status: "failed", limitations: ["The speech service did not return WAV audio"]};
      return {status: "succeeded", content_type: "audio/wav", audio_bytes: bytes, duration_seconds: measureWav(bytes).duration_seconds, known_cost: pricing ? text.length * pricing.per_character : null, currency: pricing?.currency ?? null, limitations: []};
    }
  };
}

// Free, offline drafts with the macOS `say` command. The text goes through a temporary file, never through arguments.
export function createMacSayProvider({sayPath = "say", platform = process.platform, rate = null} = {}) {
  return {
    async capability() {
      if (platform !== "darwin") return {status: "unavailable", reason: "The macOS say command is only available on macOS"};
      try { await execFileAsync(sayPath, ["-v", "?"], {timeout: 5000}); return {status: "available"}; } catch { return {status: "unavailable", reason: "The say command could not be run"}; }
    },
    async estimate() { return {amount: 0, currency: "USD"}; },
    async submit({text, configuration}) {
      if (!/^[A-Za-z0-9][A-Za-z0-9 ._()-]{0,63}$/.test(configuration.voice_id)) return {status: "failed", limitations: ["The voice name is not a valid macOS voice"]};
      const directory = await mkdtemp(resolve(tmpdir(), "keelokit-say-"));
      try {
        await writeFile(resolve(directory, "text.txt"), text, "utf8");
        await execFileAsync(sayPath, ["-v", configuration.voice_id, ...(rate === null ? [] : ["-r", String(rate)]), "-f", resolve(directory, "text.txt"), "-o", resolve(directory, "out.wav"), "--data-format=LEI16@24000"], {timeout: 120000});
        const bytes = await readFile(resolve(directory, "out.wav"));
        if (!wavSignature(bytes)) return {status: "failed", limitations: ["say did not produce WAV audio"]};
        return {status: "succeeded", content_type: "audio/wav", audio_bytes: bytes, duration_seconds: measureWav(bytes).duration_seconds, known_cost: 0, currency: "USD", limitations: ["System voice for drafts; check pronunciation and pacing"]};
      } catch {
        return {status: "failed", limitations: ["say could not synthesize this narration"]};
      } finally { await rm(directory, {recursive: true, force: true}); }
    }
  };
}
