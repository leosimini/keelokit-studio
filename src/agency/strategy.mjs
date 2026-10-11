import {contentHash, stableId} from "../core/ids.mjs";
import {reviewSubject} from "./review.mjs";
import {selectRecipes} from "./recipes.mjs";
import {assertPerformanceObservation} from "./performance.mjs";

const confidenceValue = {low: 0, medium: 1, high: 2};
const sha = /^sha256:[a-f0-9]{64}$/;

export class StrategyError extends Error {}

function text(value, label) { if (typeof value !== "string" || !value.trim()) throw new StrategyError(`${label} is required`); return value; }
function strings(value, label) { if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || !item.trim())) throw new StrategyError(`${label} must be an explicit string array`); return value; }
function score(value, label) { if (!Number.isInteger(value) || value < 0 || value > 3) throw new StrategyError(`${label} must be an integer from 0 to 3`); return value; }

function assertNoCycles(candidates) {
  const known = new Set(candidates.map(({candidate_id}) => candidate_id));
  const visiting = new Set(), visited = new Set();
  const byId = new Map(candidates.map((candidate) => [candidate.candidate_id, candidate]));
  function visit(id) {
    if (visiting.has(id)) throw new StrategyError("Publication candidate dependency cycle");
    if (visited.has(id)) return;
    visiting.add(id);
    for (const dependency of byId.get(id).depends_on) { if (!known.has(dependency) || dependency === id) throw new StrategyError(`Invalid publication dependency ${dependency}`); visit(dependency); }
    visiting.delete(id); visited.add(id);
  }
  for (const id of known) visit(id);
}

export function createContentStrategy({projectId, version, plan, audiences, planSubject, sourceObservations, evidence, observations = [], candidates, recordedAt = new Date().toISOString()}) {
  if (plan.project_id !== projectId || audiences.project_id !== projectId || !Number.isInteger(version) || version < 1) throw new StrategyError("Strategy, plan and audiences must share project and positive version");
  const expected = reviewSubject({kind: "plan", scope: planSubject?.scope, document: plan, audiences});
  if (!planSubject || ["project_id", "scope", "version", "hash"].some((key) => planSubject[key] !== expected[key])) throw new StrategyError("Strategy requires the exact current plan subject");
  if (typeof recordedAt !== "string" || Number.isNaN(Date.parse(recordedAt)) || new Date(recordedAt).toISOString() !== recordedAt) throw new StrategyError("recordedAt must be an exact ISO instant");
  const pieces = new Map(plan.suites.flatMap((suite) => suite.pieces.map((piece) => [piece.piece_id, {piece, suite}])));
  const sources = new Map(sourceObservations.sources.map((source) => [source.source_id, source]));
  const evidenceById = new Map(evidence.evidence.map((record) => [record.evidence_id, record]));
  const observationById = new Map(observations.map((record) => [record.observation_id, record]));
  if (observationById.size !== observations.length) throw new StrategyError("Performance observation IDs must be unique");
  for (const observation of observations) {
    try { assertPerformanceObservation(observation); } catch (error) { throw new StrategyError(error.message); }
    if (observation.project_id !== projectId || !pieces.has(observation.piece_id)) throw new StrategyError("Performance observation belongs to another project or piece");
  }
  if (!Array.isArray(candidates) || candidates.length === 0) throw new StrategyError("At least one strategy candidate is required");
  const built = candidates.map((candidate) => {
    const planned = pieces.get(candidate.piece_id);
    if (!planned) throw new StrategyError(`Unknown planned piece ${candidate.piece_id}`);
    if (!planned.piece.channels.includes(candidate.channel)) throw new StrategyError(`Channel ${candidate.channel} is outside the approved piece`);
    const recipes = selectRecipes({recipeIds: candidate.recipe_ids, objective: planned.suite.objective});
    const citations = candidate.reasoning?.citations;
    if (!Array.isArray(citations) || citations.length === 0) throw new StrategyError("Strategy reasoning requires citations");
    for (const citation of citations) {
      if (!["source", "evidence"].includes(citation.kind) || !sha.test(citation.hash) || !citation.locator) throw new StrategyError("Every citation requires kind, canonical hash and locator");
      const found = citation.kind === "source" ? sources.get(citation.id) : evidenceById.get(citation.id);
      if (!found) throw new StrategyError(`Unknown ${citation.kind} citation ${citation.id}`);
      const hashes = citation.kind === "source" ? [`sha256:${found.content_hash}`] : found.hashes;
      if (!hashes.includes(citation.hash)) throw new StrategyError(`Stale citation ${citation.id}`);
    }
    for (const field of ["audience_need", "why_this_piece", "why_this_channel", "why_now"]) text(candidate.reasoning?.[field], `reasoning.${field}`);
    const hypothesis = candidate.impact_hypothesis;
    text(hypothesis?.statement, "impact_hypothesis.statement"); text(hypothesis?.basis, "impact_hypothesis.basis");
    score(hypothesis?.objective_fit, "objective_fit"); score(hypothesis?.expected_impact, "expected_impact");
    if (!Object.hasOwn(confidenceValue, hypothesis?.confidence)) throw new StrategyError("confidence must be low, medium or high");
    strings(hypothesis.assumptions, "assumptions"); strings(hypothesis.unknowns, "unknowns");
    for (const id of hypothesis.observation_ids) {
      const observation = observationById.get(id);
      if (!observation) throw new StrategyError(`Unknown performance observation ${id}`);
      if (observation.piece_id !== candidate.piece_id || observation.channel !== candidate.channel) throw new StrategyError(`Performance observation ${id} does not match candidate piece and channel`);
    }
    if (candidate.effort?.estimated_minutes !== null && (!Number.isFinite(candidate.effort?.estimated_minutes) || candidate.effort.estimated_minutes < 0)) throw new StrategyError("Estimated effort must be non-negative or null");
    text(candidate.effort?.basis, "effort.basis"); strings(candidate.declared_blockers, "declared_blockers");
    if (!Array.isArray(candidate.alternatives)) throw new StrategyError("alternatives must be explicit");
    for (const alternative of candidate.alternatives) { text(alternative.label, "alternative.label"); text(alternative.reason_not_selected, "alternative.reason_not_selected"); }
    const candidateId = stableId("candidate", {projectId, pieceId: candidate.piece_id, channel: candidate.channel});
    return {candidate_id: candidateId, piece_id: candidate.piece_id, channel: candidate.channel, recipes: recipes.map(({recipe_id, version, hash}) => ({recipe_id, version, hash})), reasoning: structuredClone(candidate.reasoning), impact_hypothesis: structuredClone(hypothesis), effort: structuredClone(candidate.effort), declared_blockers: [...candidate.declared_blockers], alternatives: structuredClone(candidate.alternatives), depends_on_keys: [...candidate.depends_on_keys], depends_on: [], republication: candidate.republication ?? null};
  });
  if (new Set(built.map(({candidate_id}) => candidate_id)).size !== built.length) throw new StrategyError("Strategy candidates must be unique per piece and channel");
  const idsByKey = new Map(candidates.map((candidate, index) => [candidate.key, built[index].candidate_id]));
  if (idsByKey.size !== candidates.length || [...idsByKey.keys()].some((key) => !key)) throw new StrategyError("Candidate keys must be unique");
  for (const candidate of built) candidate.depends_on = candidate.depends_on_keys.map((key) => { if (!idsByKey.has(key)) throw new StrategyError(`Unknown publication dependency key ${key}`); return idsByKey.get(key); });
  for (const candidate of built) delete candidate.depends_on_keys;
  assertNoCycles(built);
  const sourcePlan = {plan_id: plan.plan_id, version: plan.version, subject_hash: planSubject.hash, scope: planSubject.scope};
  const strategy = {schema_version: 1, strategy_id: stableId("strategy", {projectId}), project_id: projectId, version, recorded_at: recordedAt, source_plan: sourcePlan, ranking_policy: "objective-impact-confidence-effort-v1", observations: structuredClone(observations), candidates: built};
  return {...strategy, content_hash: contentHash(strategy)};
}

export function buildPublicationQueue({strategy, plan, planSubject, distributionPlan = null, state, dashboard}) {
  if (strategy.project_id !== plan.project_id || strategy.source_plan.plan_id !== plan.plan_id || strategy.source_plan.version !== plan.version || strategy.source_plan.subject_hash !== planSubject.hash) throw new StrategyError("Strategy is stale for the current plan");
  const packages = new Map((distributionPlan?.packages ?? []).map((item) => [item.piece_id, item]));
  const publications = new Map(dashboard.pieces.map((piece) => [piece.piece_id, piece]));
  const publishedCandidates = new Set();
  for (const candidate of strategy.candidates) if (publications.get(candidate.piece_id)?.publications.some((entry) => entry.channel === candidate.channel && entry.published)) publishedCandidates.add(candidate.candidate_id);
  const items = strategy.candidates.map((candidate) => {
    const blockers = [...candidate.declared_blockers];
    const currentPiece = state.pieces.find(({piece_id}) => piece_id === candidate.piece_id);
    const pkg = packages.get(candidate.piece_id);
    if (!currentPiece || currentPiece.status !== "ready" || !pkg) blockers.push("Current passed distribution package is missing");
    if (!pkg?.channels.some(({channel}) => channel === candidate.channel)) blockers.push("Channel package is missing");
    for (const dependency of candidate.depends_on) if (!publishedCandidates.has(dependency)) blockers.push(`Publication dependency ${dependency} is not published`);
    const published = publishedCandidates.has(candidate.candidate_id);
    if (published && candidate.republication === null) blockers.push("Already published; explicit republication rationale required");
    return {candidate_id: candidate.candidate_id, piece_id: candidate.piece_id, channel: candidate.channel, status: published && candidate.republication === null ? "published" : blockers.length ? "blocked" : "ready", blockers: [...new Set(blockers)], recipe_ids: candidate.recipes.map(({recipe_id}) => recipe_id), impact_hypothesis: candidate.impact_hypothesis.statement, rank_components: {objective_fit: candidate.impact_hypothesis.objective_fit, expected_impact: candidate.impact_hypothesis.expected_impact, confidence: confidenceValue[candidate.impact_hypothesis.confidence], estimated_minutes: candidate.effort.estimated_minutes}, selection_reason: `${candidate.reasoning.why_this_piece} ${candidate.reasoning.why_now}`, observed_outcomes: candidate.impact_hypothesis.observation_ids.map((id) => strategy.observations.find((item) => item.observation_id === id))};
  });
  const compare = (left, right) => right.rank_components.objective_fit - left.rank_components.objective_fit || right.rank_components.expected_impact - left.rank_components.expected_impact || right.rank_components.confidence - left.rank_components.confidence || (left.rank_components.estimated_minutes === null) - (right.rank_components.estimated_minutes === null) || (left.rank_components.estimated_minutes ?? Infinity) - (right.rank_components.estimated_minutes ?? Infinity) || (left.candidate_id < right.candidate_id ? -1 : left.candidate_id > right.candidate_id ? 1 : 0);
  const ready = items.filter(({status}) => status === "ready").sort(compare);
  const rest = items.filter(({status}) => status !== "ready").sort(compare);
  return {schema_version: 1, project_id: strategy.project_id, source_strategy: {strategy_id: strategy.strategy_id, version: strategy.version, hash: strategy.content_hash}, source_plan: structuredClone(strategy.source_plan), dashboard_revision: dashboard.revision, ranking_policy: strategy.ranking_policy, items: [...ready, ...rest].map((item, index) => ({...item, position: index + 1}))};
}
