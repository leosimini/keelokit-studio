# Generic creative treatment

A creative treatment translates one strategy candidate into narrative and visual intent before a storyboard or script is written. It is product independent: no default layout, palette, hook, transition, or animation style is implied by the contract. A recipe is a versioned hypothesis with limitations, not a guarantee of engagement.

`createCreativeTreatment({projectId, version, plan, audiences, planSubject, strategy, candidateId, treatment, evidence})` returns an immutable-by-convention JSON handoff. `assertCurrentCreativeTreatment({treatment, plan, audiences, planSubject, strategy, evidence})` validates an existing handoff against current inputs before downstream use; it returns that handoff or throws. These pure functions do not persist files, authorize production, or grant approval.

The artifact has `schema_version`, a stable `treatment_id` per project/candidate, a positive `version`, and a canonical `content_hash`. It binds the complete current plan review subject, plan ID, exact piece and audience hashes, strategy ID/version/hash, exact candidate ID/hash, current recipe IDs/versions/hashes, and hashes of each cited evidence record. A revised strategy, audience, plan, recipe, claim evidence, or treatment invalidates the prior handoff even when its display names and IDs remain unchanged. Hashes attest to exact inputs, not to their truth or human approval.

The `treatment` input becomes the output's `intent` object:

```text
audience_tension: nonempty string
hooks: [{key, text, selected: boolean, rationale}]
mechanism, proof, payoff, cta: nonempty strings
visual_approach: {concept, asset_intent, motion_intent}
channel_format: {channel, formats: string[], reasoning}
recipe_bindings: [{recipe_id, version, hash}]
risks: [{risk, mitigation}]
claims: [{claim, evidence_ids: string[], limitation}]
accessibility_intent: {captions, contrast, readability, reduced_motion}
unresolved_gaps: [{gap, impact, resolution}]
```

Every object field above is required and textual fields must be nonempty. Hooks require unique keys, at least two options, exactly one selection, and a rationale for every selection or rejection. CTA must equal the planned CTA; channel must equal the candidate channel; selected formats must be a nonempty subset of planned formats. Recipe bindings must exactly match the candidate and current catalog. Risks, claims and gaps must be explicit arrays, including when empty. Every factual claim must quote an allowed claim in each cited available evidence record, and evidence must belong to the planned piece. Unsupported propositions belong in unresolved gaps. Creative interpretation and expected outcomes remain hypotheses; do not inflate allowed evidence into new factual promises.

## Typed author handoffs

The creative director returns the complete `createCreativeTreatment` input payload. After validation and persistence, its output artifact is the creative handoff. Motion and asset agents consume the validated artifact and return JSON author handoffs with:

```text
schema_version: 1
kind: "motion-direction" | "asset-request"
project_id, piece_id, audience_id
source_treatment: {treatment_id, version, hash}
source_strategy: {strategy_id, version, hash, candidate_id, candidate_hash}
unresolved_gaps: [{gap, impact, resolution}]
```

`motion-direction` additionally requires `beats: [{key, purpose, visual_action, transition, duration_basis, proof_evidence_ids}]`, `format_adaptations: [{format, reasoning, safe_area_intent}]`, `accessibility_intent`, and `risks: [{risk, mitigation}]`. It describes motion choices and their narrative purpose without rewriting the approved claim or CTA.

`asset-request` additionally requires `requests: [{key, purpose, evidence_ids, asset_kind, capture_requirements, format_requirements, accessibility_requirements, acceptance_criteria}]` and `risks: [{risk, mitigation}]`. `capture_requirements`, `format_requirements`, `accessibility_requirements`, and `acceptance_criteria` are explicit string arrays. Missing proof, licensing, source availability or capture capability belongs in unresolved gaps. These two handoff shapes are agent output requirements; this module validates only the creative-treatment artifact. Existing asset verification remains responsible for capture and inventory acceptance.

Authors cannot mark their work editorially passed. The editorial critic remains an independent reader of the actual script, storyboard, assets and rendered preview. A validated treatment does not establish editorial quality, accessibility compliance, rendering correctness, human style approval or publication readiness.
