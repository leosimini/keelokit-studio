# C04-03 — Optional voice adapter

Status: verified

- Requirements: ST-006, ST-010, ST-014, ST-015
- Evaluations: EV-010, EV-011
- Inputs: approved narration text and relevant audience/language/voice configuration, provider capability and cost limits, plus synthetic provider doubles for tests
- Output: optional audio artifact and metadata for provider/model/options, text and configuration hashes, known cost/job identity, duration and timing/alignment data when available
- Dependencies: C04-02, C03-05, C01-02
- Changes planned: define an optional voice adapter contract; support a test double and explicit unavailable-capability path; preserve provider job/cost metadata and cache identity; make voice selection and pronunciation configuration project-specific
- Acceptance: voice generation is optional; no voice or provider is assumed; audio is traceable to approved text and configuration; uncertain provider jobs can be queried where supported before resubmission; provider failures or missing timing data remain visible to downstream composition
- Verification: exercise success, failure, unavailable provider, uncertain job and changed-text cases with a deterministic double; verify cache behavior and that a text change does not restart unrelated capture work
- Limit: doubles validate orchestration contracts, not provider quality, availability, pricing accuracy or pronunciation quality; no voice cloning is included
