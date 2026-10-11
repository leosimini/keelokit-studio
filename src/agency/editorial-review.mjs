import {stableId} from "../core/ids.mjs";

export const editorialDimensions = Object.freeze([
  "hook", "relevance", "progression", "clarity", "pacing",
  "proof_assets", "cta", "channel_format", "evidence", "distinctiveness"
]);

const severities = new Set(["blocking", "major", "minor"]);
const verdicts = new Set(["pass", "changes_requested", "not_reviewable"]);
const hash = /^sha256:[a-f0-9]{64}$/;

export class EditorialReviewError extends Error {}

function nonEmpty(value, label) {
  if (typeof value !== "string" || !value.trim()) throw new EditorialReviewError(`${label} is required`);
  return value;
}

function validateScores(scores) {
  if (!scores || typeof scores !== "object" || Array.isArray(scores) || Object.keys(scores).sort().join() !== [...editorialDimensions].sort().join()) throw new EditorialReviewError("Scores must contain every editorial dimension exactly once");
  for (const dimension of editorialDimensions) if (!Number.isInteger(scores[dimension]) || scores[dimension] < 1 || scores[dimension] > 5) throw new EditorialReviewError(`Score ${dimension} must be an integer from 1 to 5`);
}

function validateFindings(findings) {
  if (!Array.isArray(findings)) throw new EditorialReviewError("findings must be an array");
  for (const finding of findings) {
    if (!finding || !severities.has(finding.severity) || !editorialDimensions.includes(finding.dimension)) throw new EditorialReviewError("Every finding requires a supported severity and dimension");
    for (const field of ["location", "problem", "consequence", "revision"]) nonEmpty(finding[field], `finding.${field}`);
  }
}

function identity(report) {
  const {review_id: ignored, ...value} = report;
  return value;
}

export function createEditorialReview({projectId, pieceId, storyboardId, storyboardVersion, storyboardHash, previewArtifactId, previewHash, reviewer, reviewedAt, scores, findings = [], attempts = [], reviewBlockers = [], limits = []}) {
  for (const [label, value] of [["projectId", projectId], ["pieceId", pieceId], ["storyboardId", storyboardId], ["previewArtifactId", previewArtifactId], ["reviewer", reviewer]]) nonEmpty(value, label);
  if (!Number.isInteger(storyboardVersion) || storyboardVersion < 1) throw new EditorialReviewError("storyboardVersion must be a positive integer");
  if (!hash.test(storyboardHash) || !hash.test(previewHash)) throw new EditorialReviewError("Storyboard and preview hashes must be canonical SHA-256 values");
  if (typeof reviewedAt !== "string" || Number.isNaN(Date.parse(reviewedAt)) || new Date(reviewedAt).toISOString() !== reviewedAt) throw new EditorialReviewError("reviewedAt must be an exact ISO 8601 instant");
  validateScores(scores);
  validateFindings(findings);
  for (const [label, values] of [["attempts", attempts], ["reviewBlockers", reviewBlockers], ["limits", limits]]) if (!Array.isArray(values) || values.some((value) => typeof value !== "string" || !value.trim())) throw new EditorialReviewError(`${label} must contain non-empty strings`);
  const verdict = reviewBlockers.length ? "not_reviewable" : findings.some(({severity}) => severity !== "minor") || editorialDimensions.some((dimension) => scores[dimension] < 3) ? "changes_requested" : "pass";
  const report = {schema_version: 1, project_id: projectId, piece_id: pieceId, storyboard: {storyboard_id: storyboardId, version: storyboardVersion, hash: storyboardHash}, preview: {artifact_id: previewArtifactId, hash: previewHash}, reviewer, reviewed_at: reviewedAt, scores: structuredClone(scores), findings: structuredClone(findings), attempts: [...attempts], review_blockers: [...reviewBlockers], limits: [...limits], verdict};
  return {...report, review_id: stableId("editorial-review", report)};
}

export function assertEditorialReviewCurrent(report, candidate) {
  if (!report || !verdicts.has(report.verdict)) throw new EditorialReviewError("A valid editorial report is required");
  const rebuilt = createEditorialReview({projectId: report.project_id, pieceId: report.piece_id, storyboardId: report.storyboard?.storyboard_id, storyboardVersion: report.storyboard?.version, storyboardHash: report.storyboard?.hash, previewArtifactId: report.preview?.artifact_id, previewHash: report.preview?.hash, reviewer: report.reviewer, reviewedAt: report.reviewed_at, scores: report.scores, findings: report.findings, attempts: report.attempts, reviewBlockers: report.review_blockers, limits: report.limits});
  if (report.review_id !== rebuilt.review_id || JSON.stringify(identity(report)) !== JSON.stringify(identity(rebuilt))) throw new EditorialReviewError("Editorial report identity does not match its contents");
  const expected = {piece_id: candidate.piece_id, storyboard_id: candidate.storyboard_id, storyboard_version: candidate.storyboard_version, storyboard_hash: candidate.storyboard_hash, preview_artifact_id: candidate.preview_artifact_id, preview_hash: candidate.preview_hash};
  const actual = {piece_id: report.piece_id, storyboard_id: report.storyboard.storyboard_id, storyboard_version: report.storyboard.version, storyboard_hash: report.storyboard.hash, preview_artifact_id: report.preview.artifact_id, preview_hash: report.preview.hash};
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new EditorialReviewError("Editorial report is stale or belongs to another piece revision");
  if (report.verdict !== "pass") throw new EditorialReviewError(`Editorial review blocks style approval: ${report.verdict}`);
  return report;
}
