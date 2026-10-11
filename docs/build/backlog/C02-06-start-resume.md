# C02-06 — Start and resume agency flow

Status: verified

- Requirements: ST-013
- Evaluations: EV-007
- Inputs: project state, persisted decisions, stage, approvals, and dependency/change records
- Output: start/resume orchestration that continues at the valid stage and revalidates only decisions affected by material changes
- Dependencies: C02-01, C02-02, C02-03, C02-04, C02-05, C01-02, C01-03
- Acceptance: resume across intake, plan review, rendered, and blocked states without losing decisions; never claim an absent approval; revalidate only impacted scope
- Verification: 8 focused tests cover first start/re-entry, intake decisions, exact plan approval, rendered work, uncertain jobs, scoped blockers, active/deferred material changes, state authority, and strict CLI parsing; independent review confirmed closure of all P1/P2 findings
- Limit: tracks production workflow state; media production and publication remain outside this story
