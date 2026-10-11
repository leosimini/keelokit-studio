import {reviewSubject} from "../agency/review.mjs";
import Ajv2020 from "ajv/dist/2020.js";
import {readFile} from "node:fs/promises";
import {resolve} from "node:path";
import {contentHash, stableId} from "../core/ids.mjs";
import {hasCurrentApproval} from "../state/store.mjs";
import {assertExportManifestIntegrity, assertQaReportIntegrity} from "../qa/export.mjs";

const schema = JSON.parse(await readFile(resolve(import.meta.dirname, "../../schemas/v1/distribution-plan.schema.json"), "utf8"));
const ajv = new Ajv2020({allErrors: true, strict: false});
const validate = ajv.compile(schema);

export class DistributionError extends Error {}

export function createDistributionPlan({state, plan, audiences, planSubjectKey = "plan", version, packages, channelCapabilities}) {
  const subject = state?.versions?.[planSubjectKey];
  if (!subject || subject.kind !== "plan" || subject.version !== plan.version || subject.hash !== reviewSubject({kind: "plan", scope: subject.scope, document: plan, audiences}).hash || !hasCurrentApproval(state, {kind: "plan", scope: subject.scope, subjectVersion: subject.version, subjectHash: subject.hash})) throw new DistributionError("Distribution requires the exact current approved plan and audiences");
  if (!Number.isInteger(version) || version < 1 || !Array.isArray(packages) || packages.length === 0 || !channelCapabilities || typeof channelCapabilities !== "object") throw new DistributionError("Version, packages and declared channel capabilities are required");
  const planned = new Map(plan.suites.flatMap(({pieces}) => pieces).map((piece) => [piece.piece_id, piece]));
  const statePieces = new Map(state.pieces.map((piece) => [piece.piece_id, piece]));
  const values = packages.map((candidate) => {
    const piece = planned.get(candidate.piece_id);
    if (!piece) throw new DistributionError(`Unknown planned piece ${candidate.piece_id}`);
    try { assertExportManifestIntegrity(candidate.export_manifest); assertQaReportIntegrity(candidate.qa_report, candidate.export_manifest); } catch (error) { throw new DistributionError(`Piece ${candidate.piece_id} requires contract-valid export and independent QA records: ${error.message}`); }
    if (statePieces.get(candidate.piece_id)?.status !== "ready" || candidate.qa_report?.piece_id !== candidate.piece_id || candidate.qa_report?.verdict !== "pass") throw new DistributionError(`Piece ${candidate.piece_id} requires independent passing QA and ready state`);
    if (candidate.export_manifest?.piece_id !== candidate.piece_id || candidate.export_manifest?.status !== "passed" || candidate.qa_report.export_manifest_id !== candidate.export_manifest.export_manifest_id) throw new DistributionError(`Piece ${candidate.piece_id} requires its own passed export manifest bound to QA`);
    if (candidate.public_title === candidate.piece_id) throw new DistributionError("Public titles must not expose internal piece IDs");
    if (!Array.isArray(candidate.variants) || !candidate.variants.length || !Array.isArray(candidate.channels) || !candidate.channels.length) throw new DistributionError("Every package requires variants and channels");
    const variants = candidate.variants.map((variant) => {
      const artifact = candidate.export_manifest.artifacts.find((item) => item.variant === variant.export_variant);
      if (candidate.export_manifest.export_manifest_id !== candidate.qa_report.export_manifest_id || !artifact) throw new DistributionError(`Variant ${variant.export_variant} is not present in the QA-bound export manifest`);
      if (variant.format !== artifact.content_type) throw new DistributionError(`Variant ${variant.export_variant} format does not match its exported artifact`);
      return {variant_id: stableId("variant", {piece_id: candidate.piece_id, export_variant: variant.export_variant, format: variant.format}), public_name: variant.public_name, format: variant.format, export_manifest_id: candidate.export_manifest.export_manifest_id, artifact_sha256: artifact.sha256};
    });
    const channels = candidate.channels.map(({channel, placement = null, series = null}) => {
      if (!piece.channels.includes(channel)) throw new DistributionError(`Channel ${channel} is outside the approved piece plan`);
      const capability = Object.hasOwn(channelCapabilities, channel) ? channelCapabilities[channel] : null;
      const status = capability?.status ?? "unverified";
      if (!["verified", "unverified", "unsupported"].includes(status)) throw new DistributionError(`Invalid capability status for ${channel}`);
      if ((placement || series) && status !== "verified") throw new DistributionError(`Placement or series concepts for ${channel} require verified channel capability`);
      return {channel, placement, series, capability_status: status, proposal_only: true};
    });
    return {package_id: stableId("package", {piece_id: candidate.piece_id, variants, channels, public_title: candidate.public_title}), piece_id: candidate.piece_id, public_title: candidate.public_title, description: candidate.description, cta: candidate.cta, variants, channels, publication_status: "not-published"};
  });
  if (new Set(values.map(({piece_id}) => piece_id)).size !== values.length) throw new DistributionError("Distribution packages must have unique piece IDs");
  const result = {schema_version: 1, project_id: plan.project_id, distribution_plan_id: stableId("distribution", {project_id: plan.project_id}), version, source_plan: {plan_id: plan.plan_id, version: plan.version, hash: subject.hash}, packages: values};
  if (!validate(result)) throw new DistributionError((validate.errors ?? []).map(({instancePath, message}) => `${instancePath}: ${message}`).join("; "));
  return result;
}
