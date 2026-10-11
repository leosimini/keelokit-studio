import {contentHash} from "../core/ids.mjs";
import {assertAgencyHandoffCurrent, AgencyHandoffError} from "./handoff.mjs";
import {assertMotionSpecCurrent} from "./motion.mjs";
import {validateAssetRequirements} from "../assets/requirements.mjs";

export class ProductionFlowError extends Error {}

function exact(kind, id, version, hash) { return {kind, id, version, hash}; }
function requireRole(handoff, from, to) {
  if (handoff?.from_role !== from || handoff?.to_role !== to || handoff?.status !== "ready") throw new ProductionFlowError(`Production requires a ready ${from} to ${to} handoff`);
}

export function assertProductionHandoffs({projectId, strategy, treatment, storyboard, motionSpec, assetRequirements, assets, evidence, creativeHandoff, motionHandoff, assetHandoff}) {
  if ([strategy, treatment, storyboard, motionSpec, assetRequirements].some((value) => !value)) throw new ProductionFlowError("Strategy, treatment, storyboard, motion and asset requirements are required");
  const artifacts = {
    strategy: exact("content-strategy", strategy.strategy_id, strategy.version, strategy.content_hash),
    treatment: exact("creative-treatment", treatment.treatment_id, treatment.version, treatment.content_hash),
    storyboard: exact("storyboard", storyboard.storyboard_id, storyboard.version, contentHash(storyboard)),
    motion: exact("motion-spec", motionSpec.motion_spec_id, motionSpec.version, motionSpec.content_hash),
    requirements: exact("asset-requirements", `asset-requirements-${storyboard.storyboard_id}`, storyboard.version, contentHash(assetRequirements))
  };
  if (storyboard.treatment_hash !== treatment.content_hash) throw new ProductionFlowError("Storyboard is not bound to the current creative treatment");
  try {
    requireRole(creativeHandoff, "creative-director", "storyboard-director");
    assertAgencyHandoffCurrent(creativeHandoff, {projectId, inputs: [artifacts.strategy], output: artifacts.treatment});
    requireRole(motionHandoff, "motion-director", "editorial-critic");
    assertAgencyHandoffCurrent(motionHandoff, {projectId, inputs: [artifacts.treatment, artifacts.storyboard], output: artifacts.motion});
    requireRole(assetHandoff, "asset-producer", "editorial-critic");
    assertAgencyHandoffCurrent(assetHandoff, {projectId, inputs: [artifacts.treatment, artifacts.storyboard], output: artifacts.requirements});
    assertMotionSpecCurrent(motionSpec, storyboard);
    validateAssetRequirements(assetRequirements, {storyboard, assets, evidence});
  } catch (error) {
    if (error instanceof AgencyHandoffError || ["MotionSpecError", "AssetRequirementsError"].includes(error?.name)) throw new ProductionFlowError(error.message);
    throw error;
  }
  const unfulfilled = assetRequirements.requirements.filter(({fulfillment}) => fulfillment === null);
  if (unfulfilled.length) throw new ProductionFlowError(`Unfulfilled asset requirements: ${unfulfilled.map(({requirement_id}) => requirement_id).join(", ")}`);
  for (const scene of storyboard.scenes) for (const assetId of scene.asset_ids) if (!assetRequirements.requirements.some((requirement) => requirement.scene_id === scene.scene_id && requirement.fulfillment?.asset_id === assetId)) throw new ProductionFlowError(`Scene ${scene.scene_id} asset ${assetId} lacks a fulfilled exact requirement`);
  const candidate = strategy.candidates.find(({candidate_id}) => candidate_id === treatment.source_strategy.candidate_id);
  if (!candidate) throw new ProductionFlowError("Treatment strategy candidate is missing");
  return {schema_version: 1, project_id: projectId, piece_id: storyboard.piece_id, reviewed_inputs: {channel: contentHash({channel: candidate.channel, formats: storyboard.formats}), motion: motionSpec.content_hash, strategy: strategy.content_hash, treatment: treatment.content_hash}, artifacts};
}
