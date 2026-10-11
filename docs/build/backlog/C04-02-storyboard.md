# C04-02 — Storyboard by intent

Status: pending

- Requirements: ST-007, ST-010, ST-015
- Evaluations: EV-002, EV-011, EV-012
- Inputs: approved production-plan piece, audience and intent, evidence records, brand configuration, requested format/duration/language and available assets
- Output: versioned storyboard with piece ID, audience, intent, message, evidence IDs, CTA, structure, duration/format/language and timed scenes containing narration, on-screen text and asset references
- Dependencies: C04-01, C02-04, C03-02, C03-05, C01-01
- Changes planned: add a validated storyboard contract and authoring path for distinct piece intents, including explainer and tutorial structures; enforce evidence and plan references; allow duration, format, language and scene structure to be set per piece
- Acceptance: each storyboard follows its approved piece intent and references only available evidence/assets; an explainer keeps to one promise, one supported walkthrough and one CTA unless its approved plan justifies otherwise; a tutorial retains required preconditions and steps; no fixed duration or combination of audiences and formats is imposed
- Verification: validate synthetic explainer and tutorial storyboards, including missing references, unsupported claims and incomplete tutorial steps; confirm valid alternatives with differing durations/formats are accepted
- Limit: storyboard validation cannot prove that an evidence record is true or that the final rendered sequence communicates clearly
