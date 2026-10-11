# C03-03 — Web capture adapter and journey fixture

Status: verified

- Requirements: ST-009, ST-015
- Evaluations: EV-008, EV-009
- Inputs: configured web target, reproducible journey, role, build, locale, viewport and demo data
- Output: declared web adapter capability and uniform capture/evidence result for successful, failed or unavailable journeys
- Dependencies: C03-02, C01-01, C01-04
- Changes planned: add a repeatable web capture adapter using a saved automation script, plus a fixture covering a verified successful journey and a failed journey; connect output to the evidence record
- Acceptance: the fixture verifies the observed result against the journey; adapter reports failures and unavailable capabilities explicitly; capture includes its execution context and does not synthesize UI or outcomes
- Verification: 12 web tests run real Chromium through verified success, async SPA result, failed and disabled journeys, role changes, external requests/redirects, secret-safe errors, procedure and content-addressed recaptures, browser lifecycle, Playwright selectors and capability probing; independent high-reasoning review iterated through nine reproduced P1/P2 defects and confirmed closure with no remaining P1/P2 findings
- Limit: web support does not establish native-app support; exploratory tooling alone is not a reproducible capture; no surface-specific capability is claimed without a working adapter
