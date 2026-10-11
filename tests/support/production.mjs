import {createAgencyHandoff} from "../../src/agency/handoff.mjs";
import {createAssetRequirements, fulfillAssetRequirement} from "../../src/assets/requirements.mjs";
import {contentHash} from "../../src/core/ids.mjs";

// Builds the strategy/treatment stubs, fulfilled asset requirements and the three specialist handoffs that renderRemotionVideo requires,
// for a storyboard whose scenes each show at most one captured asset.
export function buildProductionFlow({storyboard, motionSpec, assets, evidence}) {
  const strategy = {strategy_id: "strategy-render", version: 1, content_hash: `sha256:${"1".repeat(64)}`, candidates: [{candidate_id: "candidate-render", channel: "help-center"}]};
  const treatment = {treatment_id: "treatment-render", version: 1, content_hash: storyboard.treatment_hash, source_strategy: {candidate_id: "candidate-render"}};
  const byId = new Map(evidence.evidence.map((record) => [record.evidence_id, record]));
  const assetById = new Map(assets.assets.map((asset) => [asset.asset_id, asset]));
  const requirements = storyboard.scenes.filter((scene) => scene.asset_ids.length > 0).map((scene) => {
    const record = byId.get(scene.evidence_ids[0]);
    return {scene_id: scene.scene_id, purpose: "Show the verified result", evidence_id: record.evidence_id, evidence_hash: contentHash(record), build: record.build, role: record.role, locale: record.locale, state: "ready", action: record.steps[0], result: record.result, media_kind: "capture", dimensions: null, aspect_ratio: null, crop: "full verified surface", focus: "the result", duration_seconds: null, rights: null, approval: {status: "pending", review_id: null}, acceptance_criteria: ["The result is legible"]};
  });
  let document = createAssetRequirements({storyboard, evidence, requirements});
  for (const requirement of document.requirements) {
    const assetId = storyboard.scenes.find(({scene_id}) => scene_id === requirement.scene_id).asset_ids[0];
    document = fulfillAssetRequirement(document, {requirementId: requirement.requirement_id, assetId, assetSha256: assetById.get(assetId).sha256, storyboard, assets, evidence});
  }
  const refs = {
    strategy: {kind: "content-strategy", id: strategy.strategy_id, version: 1, hash: strategy.content_hash},
    treatment: {kind: "creative-treatment", id: treatment.treatment_id, version: 1, hash: treatment.content_hash},
    storyboard: {kind: "storyboard", id: storyboard.storyboard_id, version: 1, hash: contentHash(storyboard)},
    motion: {kind: "motion-spec", id: motionSpec.motion_spec_id, version: 1, hash: motionSpec.content_hash},
    requirements: {kind: "asset-requirements", id: `asset-requirements-${storyboard.storyboard_id}`, version: 1, hash: contentHash(document)}
  };
  const handoff = (fromRole, toRole, inputs, output, runId) => createAgencyHandoff({projectId: storyboard.project_id, fromRole, toRole, producer: `${fromRole}-agent`, runId, inputs, output, status: "ready", recordedAt: "2026-10-11T12:00:00.000Z"});
  return {
    strategy, treatment, assetRequirements: document,
    creativeHandoff: handoff("creative-director", "storyboard-director", [refs.strategy], refs.treatment, "creative-1"),
    motionHandoff: handoff("motion-director", "editorial-critic", [refs.treatment, refs.storyboard], refs.motion, "motion-1"),
    assetHandoff: handoff("asset-producer", "editorial-critic", [refs.treatment, refs.storyboard], refs.requirements, "assets-1")
  };
}
