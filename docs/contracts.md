# Studio contracts

Keelokit Studio contracts use JSON Schema draft 2020-12 and carry `schema_version: 1`. The plugin owns schema definitions; engagement data belongs to the consumer project.

The first contract set covers the references needed to connect discovery, audiences, evidence, assets, plans, and storyboards:

- `project-context.json` owns source observations, surfaces, capabilities, and gaps.
- `source-observations.schema.json` validates transient context/manual adapter output before accepted observations are incorporated into `project-context.json`.
- `audiences.json` owns stable audience IDs and confirmed audience decisions.
- `brief.schema.json` owns the versioned agency brief, including audience-specific tone and voice confirmation state.
- `product-evidence.json` owns reproducible product evidence and allowed claims.
- `assets.json` owns asset hashes and provenance. An asset without origin is invalid.
- `content-plan.json` owns suites and planned pieces, including their audience, intention, CTA, evidence, and dependencies.
- `storyboards/*.json` derives audience, intention, and CTA from a planned piece and adds timed scenes.

Validate a contract directory with:

```bash
npm run validate:contracts -- /path/to/contracts
```

Shape validation is not enough. The validator also enforces unique IDs, project consistency, dependency references, source/evidence/asset references, and agreement between a storyboard and its planned piece.

Brand, approval/state, distribution, QA, cost, and job contracts are introduced by the milestones that implement their behavior. They must use the same versioning and single-owner rules.

