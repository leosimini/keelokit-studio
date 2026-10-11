# C01-02 — Persistent state, events, and approvals

Status: verified

- Requirements: ST-005, ST-013, ST-014
- Evaluations: EV-003, EV-007, EV-010
- Inputs: C01-01 schemas
- Output: consumer-project state store, appendable events, and approvals bound to versions and hashes
- Dependencies: C01-01
- Acceptance: resume without repeating valid decisions; silence never creates approval; uncertain paid jobs are queryable before retry
- Verification: 12 state tests across five consecutive runs, full plugin verification, dependency audit, forced-process termination, concurrent-writer check, and independent review passed on 2026-10-11
- Limit: publication state is tracked separately from production

