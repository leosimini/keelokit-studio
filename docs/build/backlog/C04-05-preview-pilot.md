# C04-05 — Preview, pilot and style approval gate

Status: verified

- Requirements: ST-005, ST-006, ST-008, ST-010, ST-015
- Evaluations: EV-003, EV-011, EV-012
- Inputs: approved plan/version and scope, current storyboard/render preview, brand/style version and approval record, pilot coverage needs and review feedback
- Output: reviewable pilot set with preview artifacts, recorded style decision bound to version/hash and scope, and a gate state for subsequent batch production
- Dependencies: C04-01, C04-02, C04-04, C02-05, C01-02, C01-03
- Changes planned: implement preview and pilot workflow after plan approval; determine the minimal pilot set from materially distinct styles in the approved scope; record explicit approval or requested changes; allow an already approved applicable style to be reused without repeating approval
- Acceptance: no unapproved plan scope enters production; a required pilot is limited to approved scope; batch production remains blocked while required style approval is absent or stale; approval is linked to the reviewed version/hash and does not silently apply to material changes
- Verification: exercise unapproved plan, pending pilot, explicit approval, stale approval and still-valid approval cases; confirm only authorized scope advances and an unchanged approved style is not needlessly re-approved
- Limit: a pilot approval covers only its recorded scope/style and does not establish correctness of product claims or independent QA approval
