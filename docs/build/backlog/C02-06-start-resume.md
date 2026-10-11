# C02-06 — Start and resume agency flow

Status: todo

- Requirements: ST-013
- Evaluations: EV-007
- Inputs: project state, persisted decisions, stage, approvals, and dependency/change records
- Output: start/resume orchestration that continues at the valid stage and revalidates only decisions affected by material changes
- Dependencies: C02-01, C02-02, C02-03, C02-04, C02-05, C01-02, C01-03
- Acceptance: resume across intake, plan review, rendered, and blocked states without losing decisions; never claim an absent approval; revalidate only impacted scope
- Verification: restart synthetic flows at each evaluation stage and introduce a material change; check retained decisions, approval state, and selective revalidation
- Limit: tracks production workflow state; media production and publication remain outside this story
