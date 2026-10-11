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
5. Follow the returned lifecycle action: create evidence-bound storyboards, optional voice jobs, measured previews, pilot/style review, batch production, export QA, guides and proposal-only distribution packages as the current approved scope requires.
6. Load only selected evidence, assets and documents for the active piece. Use the selector → composer → independent reviewer separation; render completion is never QA approval.
7. State which surface capabilities are available. Web capture is verified; native or other unconfigured surfaces must remain blocked rather than being simulated through a browser.
8. Launch the persistent dashboard when the user needs suite progress, blockers, previews, exports, history or manual publication annotations. Publication is never inferred from `ready`.
9. Keep output in the consumer project. Never write campaign state or generated assets into this plugin's installation directory.

## Invariants

- Model audiences from project evidence and user confirmation; do not assume fixed roles, industries, markets, or channels.
- Ask only for relevant missing information, in short groups.
- Require explicit, version-bound approval before production. Silence is not approval.
- Separate production from verification and publication.
- Never fabricate interfaces, product results, metrics, testimonials, or supported platform capabilities.
- Reuse current evidence and approved work before requesting new paid or irreversible work.
- Match the user's language unless the project specifies another language for an artifact.

The current release implements the complete generic workflow through evidence capture, media production contracts, independent QA, persistent dashboard state and manual distribution packaging. Provider quality and unsupported surfaces remain capability-gated.

