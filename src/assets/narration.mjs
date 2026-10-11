import {createHash} from "node:crypto";
import {storeProjectBytes} from "../core/captures.mjs";
import {stableId} from "../core/ids.mjs";
import {createAssetInventory} from "./inventory.mjs";

export class NarrationError extends Error {}

// Saves a successful voice result in the project and returns the audio asset that the renderer binds to the narration it was generated from.
export async function persistNarration({projectRoot, projectId, voice, outputDirectory = "media/studio/audio", observedAt = new Date().toISOString().slice(0, 10)}) {
  const {artifact, audio_bytes: audio} = voice ?? {};
  if (artifact?.status !== "succeeded" || !Buffer.isBuffer(audio)) throw new NarrationError("Only a succeeded voice result with its audio bytes can become a narration asset");
  const sha256 = createHash("sha256").update(audio).digest("hex");
  if (artifact.audio?.sha256 !== sha256) throw new NarrationError("The audio bytes do not match the voice artifact they were generated for");
  const stored = await storeProjectBytes({projectRoot, path: `${outputDirectory}/${artifact.voice_artifact_id}-${sha256.slice(0, 16)}.wav`, content: audio});
  const record = await storeProjectBytes({projectRoot, path: `${outputDirectory}/${artifact.voice_artifact_id}.json`, content: Buffer.from(`${JSON.stringify(artifact, null, 2)}\n`)});
  const asset = {
    asset_id: stableId("asset", {projectId, kind: "audio", sha256, voice_artifact: artifact.voice_artifact_id}),
    kind: "audio",
    path: stored.path,
    sha256,
    origin: {type: "generated", source: `voice-artifact:${artifact.voice_artifact_id}`, license: null, observed_at: observedAt},
    approval: {status: "pending", review_id: null},
    status: "valid",
    depends_on: [],
    evidence_id: null
  };
  createAssetInventory({projectId, assets: [asset]});
  return {asset, artifact, audio_path: stored.path, artifact_path: record.path};
}
