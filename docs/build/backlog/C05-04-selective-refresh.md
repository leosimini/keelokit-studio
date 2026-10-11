# C05-04 — Selective refresh

Status: verified

- Requirements: ST-013, ST-015
- Evaluations: EV-013
- Inputs: material UI, role, journey, brand, voice, manual, build or title change and affected pieces
- Output: dependency-scoped stale components and recorded reason
- Dependencies: C01-03, C03, C04
- Acceptance: only affected derivatives become stale; published annotations are never rewritten; title retains valid capture/voice
- Verification: cover every supported change type and multi-piece isolation
- Limit: callers must identify the affected scope from real change evidence
