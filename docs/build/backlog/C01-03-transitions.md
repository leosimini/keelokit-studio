# C01-03 — Transitions and selective invalidation

Status: verified

- Requirements: ST-005, ST-008, ST-013
- Evaluations: EV-003, EV-007
- Inputs: C01-02 state and approval records
- Output: guarded stage transitions and dependency-based invalidation
- Dependencies: C01-02
- Acceptance: production cannot precede required approvals; relevant changes invalidate only dependent decisions and pieces
- Verification: transition/invalidation tests plus independent high-reasoning review passed on 2026-10-11; reproduced approval-kind, stale-version, style-invalidation, shared-reference, distribution, and batch-coverage bypasses were fixed
- Limit: automatic development mode never grants editorial approval

