# C03-02 — Evidence by role, build, locale and feature

Status: pending

- Requirements: ST-009, ST-015
- Evaluations: EV-008, EV-009
- Inputs: feature or journey, requested role, availability/feature flags, build or commit, locale, demo data and the applicable surface
- Output: product evidence record linking execution context, steps, observed result, captures and hashes to claims the evidence can support
- Dependencies: C02-06, C01-01, C01-04
- Changes planned: implement evidence records and validation of required context; bind each observation to the actual role/build/locale and relevant feature availability; preserve failure and disabled-feature outcomes
- Acceptance: evidence supports only the role and context actually exercised; disabled features are excluded from production claims; a failed journey is reported without replacement by a fabricated screen or result
- Verification: exercise role/build/locale variants, successful and failing journeys, and disabled flags; verify claim boundaries and references; validate records against the evidence schema
- Limit: evidence from one role, build, locale or surface does not establish behavior in another; screenshots alone do not prove an unobserved outcome
