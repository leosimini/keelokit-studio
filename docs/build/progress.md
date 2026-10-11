# Build progress

Updated: 2026-10-11.

## Active milestone

C03 — identity, evidence, and capture.

| Story | Status | Evidence |
| --- | --- | --- |
| C00-01 | verified | Studio and Keelokit repositories inspected; Claude Code 2.1.296 and Keelokit 0.9.1 interfaces recorded in `compatibility.md` |
| C00-02 | verified | runtime, plugin layout, renderer, licensing, and alternative recorded in the C00 decision |
| C00-03 | verified | strict validation, isolated marketplace installation, and real `--plugin-dir` inventory passed |
| C00-04 | verified | progress, decision, limits, evidence, and C00/C01 backlog are tracked in git |
| C01-01 | verified | six versioned schemas, cross-reference validator, two sector fixtures, and 7 contract tests pass |
| C01-02 | verified | exclusive initialization, atomic revisioned state, exact approvals, crash-safe locking, and 12 state tests pass |
| C01-03 | verified | guarded phase graph, persisted batch scope, per-piece plan/style gates, and selective component invalidation pass review |
| C01-04 | verified | canonical IDs, consumer-only paths, scoped capability failures, and provenance limits pass tests and independent review |
| C02-01 | verified | context/manual adapters preserve source path, observation time, build, classification, hash, and availability limits |
| C02-02 | verified | intake asks only uncovered scope deltas and persists hash-bound decisions without expanding unrelated blockers |
| C02-03 | verified | project-defined audiences and a versioned sourced brief preserve explicit tone/voice confirmation and material review fields |
| C02-04 | verified | objective-led suites validate brief scope, evidence needs, execution order, dependency graphs, costs, pending work, and exclusions |
| C02-05 | verified | review subjects derive plan scope, bind exact documents and relevant audiences, expose material fields, and record explicit approval or revocation |
| C02-06 | verified | start initializes once and resumes persisted decisions, approvals, renders, jobs, blockers, and material changes by active scope |
| C03-01 | verified | sourced brand candidates, explicit conflicts/gaps, versioned confirmation state, and a standalone escaped HTML reference pass independent review |
| C03-02 | pending | evidence compatibility by role/build/locale/feature |
| C03-03 | pending | repeatable web capture adapter and success/failure fixture |
| C03-04 | pending | contributed-material ingest with provenance limits |
| C03-05 | pending | project-local assets, hashes, and dependency tracking |

## Verification ledger

- `npm run test`: pass, 2 foundation tests.
- `npm run validate:plugin`: pass for plugin manifest, marketplace manifest, commands, and skills under Claude Code 2.1.296 strict mode; no warnings.
- `npm run test:install`: pass; isolated local marketplace added and `keelokit-studio@keelokit-studio` 0.1.0 installed and enabled outside the plugin repository.
- `npm run test:load`: pass; Claude Code init inventory contains `keelokit-studio:start` and `keelokit-studio:keelokit-studio`. Authenticated inference remains unavailable.
- `npm run validate:contracts -- fixtures/contracts/field-service`: pass.
- `npm run validate:contracts -- fixtures/contracts/learning-platform`: pass with three audiences, compared with one in the other fixture.
- `npm test`: pass, including EV-002 negative cases for required piece fields, provenance, dependencies, contradictory metadata, duplicate IDs, and missing references.
- Independent high-reasoning review found four false negatives; all were fixed and the reviewer confirmed closure without regressions.
- `node --test tests/state.test.mjs`: pass across five consecutive runs; covers re-entry phases, exact approval/revocation, uncertain jobs, exclusive init, stale writers, immutable snapshots, path/symlink guards, forced process termination, and concurrent writers.
- Independent high-reasoning review reproduced state-loss races in two discarded lock implementations. The final SQLite transaction lock closed those findings; the reviewer confirmed no remaining P1/P2 lock defect after raising the Node minimum.
- `node --test tests/transitions.test.mjs`: pass; covers approval kind/version/hash, pilot membership, per-piece style coverage, publication separation, selective invalidation, and immutable invalidation rules.
- Independent high-reasoning transition review reproduced approval and style-coverage bypasses; all were fixed and the reviewer confirmed no remaining P1/P2 regression.
- `node --test tests/core.test.mjs`: pass; covers deterministic IDs, invalid JSON identities, traversal, resolved and dangling symlinks, plugin-root exclusion, scoped adapter failures, and non-graphical evidence.
- C01-04 independent review found a dangling-symlink escape, plugin-root output acceptance, and ambiguous non-JSON IDs. All were fixed and the complete 35-test suite passes.
- `node --test tests/discovery.test.mjs`: pass; covers generic source provenance, contradictory/stale/missing classifications, build association, bounded manual reads, and negative availability rules in transient and persistent schemas.
- Independent C02-01 review found three adapter/schema inconsistencies; envelope, build propagation, and README/backlog restrictions were fixed, then confirmed with no remaining P1/P2 findings.
- `node --test tests/intake.test.mjs`: pass; covers two/three-question batches, scope-local blockers, accumulated scope decisions, restart persistence, and material-change revalidation by subject hash.
- Independent C02-02 review found scope-union, stale-decision, and decision-ID defects; all were fixed and the reviewer confirmed no remaining P1/P2 findings.
- `node --test tests/brief.test.mjs`: pass; covers variable audience counts, stable IDs, supported messages, explicit/proposed tone and voice, rejected audiences, cross-document validation, and review-view completeness.
- Independent C02-03 review found rejected-audience, duplicate/reference, renderer-bypass, and review-omission defects; all were fixed and the reviewer confirmed no remaining P1/P2 findings.
- `node --test tests/plan.test.mjs`: pass; covers differing product plans, stable IDs, brief constraints, required fields, budgets, and suite/piece/effective dependency cycles.
- Independent C02-04 review found five plan integrity defects plus a combined suite/piece deadlock; all were fixed and the reviewer confirmed no remaining P1/P2 findings.
- `node --test tests/review.test.mjs`: pass; covers document-derived piece scope, exact presented version/hash, changes-requested revocation, relevant-audience snapshots, silence/cross-kind rejection, and complete plan review fields.
- Independent C02-05 review found one unauthorized-piece P1 and five approval/review P2 defects; all were fixed and the reviewer confirmed no remaining P1/P2 findings.
- `node --test tests/start.test.mjs`: pass; covers initial/repeated start, delta intake, plan approval, rendered pieces, uncertain jobs, scoped blockers, selective changes, loaded-state authority, and CLI validation.
- Independent C02-06 review found four re-entry/CLI defects plus one cross-scope refresh defect; all were fixed and the reviewer confirmed no remaining P1/P2 findings.
- `node --test tests/brand.test.mjs`: pass; covers proposed/unconfirmed identity, source/asset/audience references, absent and conflicting extraction, duplicate roles/tokens, standalone HTML escaping, and CSS injection resistance.
- Independent C03-01 review reproduced lost usage conflicts and an incomplete reference sheet; both were fixed, regression-tested, and confirmed closed with no remaining P1/P2 findings.
- Narrative/prompt research was assessed as non-authoritative design evidence. Mechanical evidence gates are queued for C03; selector/composer/reviewer work remains owned by C04 and is not described as model-validated.

## Blockers and limits

- The build environment has no Claude authentication. Static validation, isolated installation, and plugin loading are testable; model-driven command execution is blocked.
- GitHub review publication is blocked because the configured `GH_TOKEN` is invalid; local branch and coherent commits remain available.
- Keelokit marketplace integration is intentionally deferred until Studio is installable from its remote repository and EV-001 passes.

## Next

Implement C03-02 evidence compatibility by role, build, locale, and feature.

