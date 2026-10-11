# C04-06 — Export, mechanical checks and independent QA

Status: pending

- Requirements: ST-010, ST-011, ST-015
- Evaluations: EV-011, EV-012
- Inputs: approved rendered piece and dependencies, requested export variants/formats, captions/subtitle requirements and independent verifier observations
- Output: exported artifacts and manifest plus a QA report separating mechanical checks, visual/auditory observations, evidence reviewed, blockers, verdict and inspection limits
- Dependencies: C04-01, C04-02, C04-04, C04-05, C03-05, C01-01
- Changes planned: add export of configured deliverables (including clean master and captioned/subtitle variants when requested); check file presence, format, dimensions/size, duration and decodability; provide a verification path separate from production that records visual/auditory inspection and evidence limitations
- Acceptance: partial or undecodable files fail mechanical checks; requested audio and caption outputs are accounted for; blockers from unsupported evidence or required review prevent a ready verdict; render completion alone never marks QA approved; inability to inspect the complete media is recorded as a limitation
- Verification: run synthetic exports with valid, missing, partial and corrupt artifacts; validate independent QA reports for pass/fail/limited cases, including a render-success case with an unresolved review blocker
- Limit: mechanical checks cannot certify factual accuracy, rights, accessibility or subjective quality; QA coverage applies only to the media and inspection actually recorded
