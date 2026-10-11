import {planIntake} from "./intake.mjs";
import {assertValidState, createInitialState, hasCurrentApproval, initializeState, loadState, StateConflictError} from "../state/store.mjs";

export function resumeEngagement({state, intakeFields, activeScopeIds = [], changedFieldIds = [], blockers = []}) {
  assertValidState(state);
  if (!Array.isArray(activeScopeIds) || !Array.isArray(changedFieldIds) || !Array.isArray(blockers)) throw new TypeError("Resume inputs must be arrays");
  const uncertainJobs = state.jobs.filter(({status}) => status === "uncertain" || status === "submitted" || status === "running");
  if (uncertainJobs.length > 0) return {phase: state.engagement_phase, action: "reconcile_jobs", job_ids: uncertainJobs.map(({job_id}) => job_id), reason: "Query existing provider jobs before any retry"};

  if (changedFieldIds.length > 0) {
    const providedIds = new Set(Array.isArray(intakeFields) ? intakeFields.map(({field_id}) => field_id) : []);
    const missingIds = changedFieldIds.filter((fieldId) => !providedIds.has(fieldId));
    if (missingIds.length > 0) return {phase: state.engagement_phase, action: "load_changed_context", field_ids: missingIds, reason: "Load every materially changed intake subject before resuming downstream work"};
    const changed = new Set(changedFieldIds);
    const changedFields = intakeFields.filter(({field_id}) => changed.has(field_id));
    const applies = ({scope_ids: scopes}) => activeScopeIds.length === 0 || scopes.length === 0 || scopes.some((scope) => activeScopeIds.includes(scope));
    const activeChangedFields = changedFields.filter(applies);
    const deferredFieldIds = changedFields.filter((field_) => !applies(field_)).map(({field_id}) => field_id);
    if (activeChangedFields.length === 0) {
      return {...resumeEngagement({state, intakeFields, activeScopeIds, changedFieldIds: [], blockers}), deferred_changed_field_ids: deferredFieldIds};
    }
    const intake = planIntake({projectId: state.project_id, fields: activeChangedFields, decisions: state.decisions, activeScopeIds});
    if (intake.questions.length > 0) return {phase: state.engagement_phase, action: "revalidate_changes", ...intake, deferred_changed_field_ids: deferredFieldIds, reason: "Revalidate only decisions affected by material changes in the active scope"};
    return {phase: state.engagement_phase, action: "refresh_affected_documents", field_ids: activeChangedFields.map(({field_id}) => field_id), deferred_changed_field_ids: deferredFieldIds, reason: "Confirmed material changes in the active scope require downstream brief and plan refresh"};
  }

  if (state.engagement_phase === "blocked") {
    if (blockers.length === 0) return {phase: "blocked", action: "load_blockers", reason: "Load persisted blocker scope before choosing work"};
    const applies = (blocker) => {
      if (activeScopeIds.length === 0) return true;
      const scopes = Array.isArray(blocker.scope_ids) ? blocker.scope_ids : typeof blocker.scope === "string" ? [blocker.scope] : [];
      return scopes.length === 0 || scopes.some((scope) => activeScopeIds.includes(scope));
    };
    const activeBlockers = blockers.filter(applies);
    const deferredBlockers = blockers.filter((blocker) => !applies(blocker));
    return activeBlockers.length > 0
      ? {phase: "blocked", action: "resolve_blockers", blockers: structuredClone(activeBlockers), deferred_blockers: structuredClone(deferredBlockers), reason: "Resolve only blockers affecting the active scope"}
      : {phase: "blocked", action: "resume_unblocked_scope", deferred_blockers: structuredClone(deferredBlockers), reason: "Recorded blockers do not affect the active scope"};
  }

  const rendered = state.pieces.filter(({status}) => status === "rendered").map(({piece_id}) => piece_id);
  if (rendered.length > 0 && ["producing", "reviewing"].includes(state.engagement_phase)) return {phase: state.engagement_phase, action: "review_rendered", piece_ids: rendered, reason: "Reuse completed renders and continue independent review"};

  switch (state.engagement_phase) {
    case "discovered":
      return {phase: "discovered", action: "discover_sources", reason: "Classify current project and manual sources"};
    case "interviewing": {
      if (!Array.isArray(intakeFields)) return {phase: "interviewing", action: "load_intake_context", reason: "Load current fields before asking any question"};
      const intake = planIntake({projectId: state.project_id, fields: intakeFields, decisions: state.decisions, activeScopeIds});
      return intake.questions.length > 0
        ? {phase: "interviewing", action: "continue_intake", ...intake, reason: "Ask only the unresolved delta"}
        : {phase: "interviewing", action: "draft_brief", reason: "Relevant intake is confirmed"};
    }
    case "brief_draft":
      return {phase: "brief_draft", action: "draft_brief", reason: "Resume the current brief version"};
    case "plan_draft":
      return {phase: "plan_draft", action: "draft_plan", reason: "Resume the current prioritized plan"};
    case "awaiting_plan_approval": {
      const subject = state.versions.plan;
      if (!subject) return {phase: "awaiting_plan_approval", action: "draft_plan", reason: "No current plan subject is persisted"};
      const approved = hasCurrentApproval(state, {kind: "plan", scope: subject.scope, subjectVersion: subject.version, subjectHash: subject.hash});
      return approved
        ? {phase: "awaiting_plan_approval", action: "prepare_pilot", subject: structuredClone(subject), reason: "Current plan is approved; media work remains a later capability"}
        : {phase: "awaiting_plan_approval", action: "review_plan", subject: structuredClone(subject), reason: "Current plan still needs explicit approval"};
    }
    case "pilot_in_progress":
    case "awaiting_style_approval":
    case "producing":
    case "reviewing":
    case "ready":
      return {phase: state.engagement_phase, action: "resume_current_phase", reason: "Preserve completed work and continue from persisted piece state"};
    default:
      throw new TypeError(`Unsupported engagement phase: ${state.engagement_phase}`);
  }
}

export async function startOrResume({projectRoot, projectId, intakeFields, activeScopeIds, changedFieldIds, blockers}) {
  if (typeof projectId !== "string" || projectId.length === 0) throw new TypeError("projectId is required");
  let state;
  let created = false;
  try {
    state = await loadState(projectRoot);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    try {
      await initializeState(projectRoot, createInitialState(projectId));
      created = true;
    } catch (initializationError) {
      if (!(initializationError instanceof StateConflictError)) throw initializationError;
    }
    state = await loadState(projectRoot);
  }
  if (state.project_id !== projectId) throw new TypeError(`Persisted project_id ${state.project_id} does not match ${projectId}`);
  return {created, state_revision: state.state_revision, ...resumeEngagement({state, intakeFields, activeScopeIds, changedFieldIds, blockers})};
}

