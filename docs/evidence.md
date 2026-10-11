# Product evidence

Studio binds every evidence record to one journey or feature, its surface and verified adapter, the capture role, build/commit, locale, enabled flag set, observed steps/result, content hashes, and explicitly allowed claims.

Web records also retain a hash of the saved procedure and use content-addressed capture paths. A changed procedure or visible recapture creates a new evidence identity instead of overwriting prior evidence.

The capture role is an execution fact, not a marketing audience. Evidence gathered with one role does not prove that another role can perform the journey. Likewise, a matching claim is blocked when the selected evidence belongs to another build, commit, locale, feature, or flag state.

`evaluateEvidenceRequest` receives only selected evidence IDs. Its target describes the current production context with `feature_or_journey`, `surface`, `role`, `build`, optional `commit`, `locale`, `availability`, and the complete enabled `flags` set. It returns `ready` only when every selected record is compatible and every requested claim appears verbatim in that record's `allowed_claims`.

Disabled, failed, and unknown outcomes are preserved as evidence but cannot carry production claims. Missing or incompatible records produce explicit blockers; Studio does not search for an unrequested substitute or fabricate a successful result.
