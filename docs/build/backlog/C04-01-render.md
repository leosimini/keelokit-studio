# C04-01 — Render adapter and brand components

Status: pending

- Requirements: ST-006, ST-010, ST-015
- Evaluations: EV-011, EV-012
- Inputs: versioned storyboard, brand tokens and assets with approval/provenance state, evidence references, requested output formats and declared render capabilities
- Output: reproducible preview/render artifacts and metadata linking compositions, assets, brand version and render configuration
- Dependencies: C03-01, C03-02, C03-05, C01-01
- Changes planned: define the render adapter contract and its capability reporting; implement the selected initial engine behind that contract; provide reusable, parameterized brand and product-demonstration components; support configurable layouts without assuming a customer, industry, audience, channel or fixed production setting
- Acceptance: rendered product surfaces derive from supplied evidence/assets rather than generated reconstructions; brand assets and fonts are traceable and pinned for a render; unsupported capabilities are reported; composition parameters remain project-configurable
- Verification: render synthetic storyboards using fixture assets and evidence; confirm output references the exact inputs and versions, and that missing or unsupported inputs produce explicit errors or limits
- Limit: a successful render establishes that the renderer produced an artifact, not that its content is accurate, approved or QA-passed; engine coverage is limited to the adapter actually implemented
