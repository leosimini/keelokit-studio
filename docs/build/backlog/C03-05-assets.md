# C03-05 — Persist assets, hashes and dependencies

Status: verified

- Requirements: ST-006, ST-009, ST-015
- Evaluations: EV-009
- Inputs: approved or explicitly unapproved brand references, captured evidence, contributed material and assets referenced by downstream storyboards
- Output: project-local asset records with stable paths, hashes, source/approval state and dependency links
- Dependencies: C03-01, C03-02, C03-03, C03-04, C01-04
- Changes planned: persist assets under a configurable project output location; calculate content hashes; record dependencies so changes to source evidence, identity or assets can invalidate only affected derivatives
- Acceptance: assets are not written into plugin installation/cache paths; hashes and provenance allow change detection; dependency links support targeted invalidation; unapproved assets remain distinguishable
- Verification: verify project-local paths, stable hashes for unchanged content, changed hashes for changed content, provenance/approval metadata and selective invalidation across dependent records
- Limit: hashes establish content identity, not correctness, rights or approval; no project-specific asset or default output path is assumed
