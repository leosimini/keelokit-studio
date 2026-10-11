# C03-02 — Evidence by role, build, locale and feature

Status: verified

- Requirements: ST-009, ST-015
- Evaluations: EV-008, EV-009
- Inputs: feature or journey, requested role, availability/feature flags, build or commit, locale, demo data and the applicable surface
- Output: product evidence record linking execution context, steps, observed result, captures and hashes to claims the evidence can support
- Dependencies: C02-06, C01-01, C01-04
- Changes planned: implement evidence records and validation of required context; bind each observation to the actual role/build/locale and relevant feature availability; preserve failure and disabled-feature outcomes
- Acceptance: evidence supports only the role and context actually exercised; disabled features are excluded from production claims; a failed journey is reported without replacement by a fabricated screen or result
- Verification: 7 focused tests cover exact role/build/commit/locale/flag context, available/disabled/failed/unknown outcomes, claim authorization, selected IDs, immutable results and strict array inputs; independent high-reasoning review reproduced flag/availability and input fail-open defects, then confirmed their fixes and no remaining P1/P2 findings
- Limit: evidence from one role, build, locale or surface does not establish behavior in another; screenshots alone do not prove an unobserved outcome
