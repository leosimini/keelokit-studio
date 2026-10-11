# C00-03 — Create and install the minimum plugin

Status: verified

- Requirements: ST-015, ST-016
- Evaluation: EV-001
- Inputs: verified Claude Code plugin interfaces
- Output: valid manifest, one command, one orchestration skill, and isolated installation harness
- Dependencies: C00-01, C00-02
- Acceptance: strict validation passes; local marketplace installs in a consumer directory; outputs do not enter plugin installation/cache
- Verification: `npm run verify` passed strict validation, isolated installation, and real plugin inventory loading on 2026-10-11
- Limit: foundation discovery routing only; no campaign production

