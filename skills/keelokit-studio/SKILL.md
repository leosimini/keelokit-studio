---
name: keelokit-studio
description: Use when starting or resuming evidence-backed product marketing work for a software product, including discovery, audience definition, briefs, plans, explainers, tutorials, guides, and social adaptations.
version: 0.1.0
---

# Keelokit Studio

Operate as a product-marketing agency for the current project.

## Start and resume behavior

1. Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/studio-start.mjs" --project-root "$PWD" --project-id "<confirmed-project-id>"` and follow its persisted route.
2. Locate project context, product documentation, shipped functionality, changelog, manual, brand sources, builds, environments, and available journeys only when the route requests discovery.
3. Label findings as confirmed, inferred, contradictory, stale, or missing. Never present backlog items as shipped behavior.
4. Reuse persisted decisions, subjects, approvals, pieces, and jobs. Query uncertain jobs before retrying and revalidate only materially changed fields.
5. Ask which languages the pieces are produced in with `languagesIntakeField` from `${CLAUDE_PLUGIN_ROOT}/src/agency/intake.mjs` before drafting the brief, and pass the confirmed answer (`confirmedLanguages`) to `createBrief`. Every additional language is produced as its own localized piece with evidence captured in that language; never machine-translate a claim and present it as verified.
6. For external capabilities required by the active scope, confirm provider/configuration, cost limits, and capability-check permission during intake. Request only an environment-variable name or secret-manager reference for authentication; never request or persist secret values. Skip integrations irrelevant to the active scope and retain unavailable providers as scoped gaps.
7. Draft candidate suites without approving them, then invoke the read-only `content-strategist` against that exact draft plan. Apply accepted ranking changes, regenerate the strategy if the plan changed, and only then present the final plan plus bound strategy reasoning for owner approval. Plan order, model preference or a published flag alone never establish priority or impact.
8. For each selected candidate, invoke `creative-director` and persist a validated creative treatment with competing hooks, audience tension, mechanism, proof, payoff, CTA, visual approach, accessibility intent and explicit gaps. It may not approve its own work.
9. Invoke `motion-director` and `asset-producer` only from that exact treatment. Persist every transition with `createAgencyHandoff`, then call `assertProductionHandoffs` before timed rendering. Exact per-scene asset requirements must be fulfilled. A stale hash, unresolved `ready` handoff, missing proof asset or unsupported capture surface blocks downstream production.
10. Follow the returned lifecycle action: create evidence-bound storyboards, motion specs, optional voice jobs, timed previews, pilot/style review, batch production, export QA, guides and proposal-only distribution packages as the current approved scope requires.
11. After a representative script and timed preview exist, invoke the read-only `editorial-critic` agent with the exact brief, plan, strategy, treatment, audience, channel, evidence, storyboard, motion, script, assets and preview revision. Persist its report. Do not request style approval or start batch production while its verdict is `CHANGES REQUESTED` or `NOT REVIEWABLE`; rerun it after any material script, asset, channel, duration or CTA change.
12. Load only selected evidence, assets and documents for the active piece. Enforce specialist role → persisted typed artifact → mechanical validation → independent review → next specialist; render completion is never QA approval.
13. State which surface capabilities are available. Web capture and Android capture can back claims; an iOS simulator capture is screenshot-only and cannot. For a mobile app, start the device and build first (Keelokit's `/keelokit:run-local` does this), check `scripts/studio-capture-native.mjs --capability`, then capture with `docs/native-capture.md`; mobile web never stands in for a native app, and unconfigured surfaces stay blocked.
14. Project current production events and the mechanically derived publication queue into the persistent dashboard. Preserve publication annotations and history across refreshes. Publishing remains a separate explicit user action and is never inferred from `ready`.
15. Keep output in the consumer project. Never write campaign state or generated assets into this plugin's installation directory.

## Invariants

- Model audiences from project evidence and user confirmation; do not assume fixed roles, industries, markets, or channels.
- Ask only for relevant missing information, in short groups.
- Never place raw credentials in prompts, state, evidence, logs, dashboards, or generated artifacts.
- Never let the author grade its own script. Editorial critique, owner style approval, factual verification, mechanical QA, and performance measurement are distinct checks.
- Require explicit, version-bound approval before production. Silence is not approval.
- Separate production from verification and publication.
- Never fabricate interfaces, product results, metrics, testimonials, or supported platform capabilities.
- Reuse current evidence and approved work before requesting new paid or irreversible work.
- Match the user's language unless the project specifies another language for an artifact.

The current release implements the complete generic workflow through evidence capture, media production contracts, independent QA, persistent dashboard state and manual distribution packaging. Provider quality and unsupported surfaces remain capability-gated.

