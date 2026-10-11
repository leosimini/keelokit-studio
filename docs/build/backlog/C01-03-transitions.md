# C01-03 — Transitions and selective invalidation

Status: todo

- Requirements: ST-005, ST-008, ST-013
- Evaluations: EV-003, EV-007
- Inputs: C01-02 state and approval records
- Output: guarded stage transitions and dependency-based invalidation
- Dependencies: C01-02
- Acceptance: production cannot precede required approvals; relevant changes invalidate only dependent decisions and pieces
- Verification: transition table tests
- Limit: automatic development mode never grants editorial approval

