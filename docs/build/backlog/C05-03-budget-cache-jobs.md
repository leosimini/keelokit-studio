# C05-03 — Budget, cache and uncertain jobs

Status: verified

- Requirements: ST-014, ST-013
- Evaluations: EV-010, EV-013
- Inputs: persisted costs/jobs, request identity, approved budget and provider query capability
- Output: guarded spend decision, reusable cache identity and recoverable job transition
- Dependencies: C04-03, C01-02
- Acceptance: cost limits and attempts are enforced; uncertain paid work is queried before resubmission; unrelated work is retained
- Verification: exercise allowed/blocked spend, cache hit, uncertain query, retry limits and restart
- Limit: provider pricing remains external evidence and unknown costs stay unknown
