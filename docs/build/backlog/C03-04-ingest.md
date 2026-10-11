# C03-04 — Ingest contributed material

Status: verified

- Requirements: ST-009, ST-015
- Evaluations: EV-009
- Inputs: user-contributed screenshots, recordings or other project material, with any supplied source, date, context and verification details
- Output: ingested material record preserving origin, available context, verification status and explicit limits on supported claims
- Dependencies: C03-02, C01-01
- Changes planned: add a bounded ingest path that stores material references and provenance metadata, distinguishes supplied context from independently verified observations, and makes verification limits available to downstream evidence consumers
- Acceptance: original provenance is retained; unknown origin/context remains unknown; contributed material is not represented as a live or independently verified product capture
- Verification: ingest material with complete, partial and absent provenance; confirm metadata and references persist and downstream claim limits remain visible
- Limit: ingest does not authenticate the contributor, verify product behavior, or fill missing provenance by inference
