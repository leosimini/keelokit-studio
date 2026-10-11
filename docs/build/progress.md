# Build progress

Updated: 2026-10-11.

## Active milestone

C02 — agency workflow.

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

## Blockers and limits

- The build environment has no Claude authentication. Static validation, isolated installation, and plugin loading are testable; model-driven command execution is blocked.
- Keelokit marketplace integration is intentionally deferred until Studio is installable from its remote repository and EV-001 passes.

## Next

Implement C02-04 objective-led suites and a prioritized per-piece production plan.

