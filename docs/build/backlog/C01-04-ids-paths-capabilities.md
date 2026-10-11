# C01-04 — IDs, paths, capabilities, and useful errors

Status: todo

- Requirements: ST-009, ST-013, ST-015, ST-016
- Evaluations: EV-002, EV-007, EV-009
- Inputs: C01 schemas and transitions
- Output: deterministic IDs, safe consumer paths, capability detection, and actionable unsupported-surface errors
- Dependencies: C01-01, C01-03
- Acceptance: no outputs in plugin cache; missing adapters block only affected scope; internal IDs remain distinct from public titles
- Verification: path, capability, and error tests
- Limit: adapters are declared only after real verification

