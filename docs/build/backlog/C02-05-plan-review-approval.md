# C02-05 — Plan review and approval record

Status: verified

- Requirements: ST-005, ST-007
- Evaluations: EV-006, EV-007
- Inputs: brief and prioritized plan with versioned content
- Output: review view and explicit approval or requested changes bound to the reviewed version/hash
- Dependencies: C02-03, C02-04, C01-02
- Acceptance: present concrete brief and plan for review; capture approval only for its scope and version; silence and automatic development mode never count as approval
- Verification: 7 focused tests cover derived piece scope, schema/project validation, exact presented subject, approval/revocation, selective audience hashing, cross-kind/silence rejection, and material review fields; independent review confirmed closure of the P1 and all P2 findings
- Limit: approval enables only the reviewed scope; no production or publication is performed
