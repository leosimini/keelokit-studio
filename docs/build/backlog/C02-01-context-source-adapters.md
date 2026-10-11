# C02-01 — Context adapters and source classification

Status: verified

- Requirements: ST-001
- Evaluations: EV-004
- Inputs: project context, configured paths, available manuals and product documents
- Output: normalized source records with origin/date/build and confirmed, inferred, contradictory, stale, or missing classifications
- Dependencies: C01-01, C01-04
- Acceptance: use available configured sources; keep pending backlog separate from available functionality; mark conflicts and missing sources for follow-up
- Verification: 4 focused tests cover complete, conflicting, stale, missing, manual, and bounded-read cases; both source schemas reject README/backlog as availability evidence; independent review confirmed closure of all P1/P2 findings
- Limit: no fixed source paths or assumptions about a particular project or industry
