# C06-03 — Required real-surface adapter

Status: blocked

- Requirements: ST-009, ST-015
- Evaluations: EV-016
- Inputs: capabilities required by the real validation application
- Output: implemented adapter or explicit blocked coverage record
- Dependencies: C06-01
- Acceptance: no surface is claimed from an emulator of another surface
- Verification: execute the chosen adapter against the actual surface
- Limit: blocked credentials/tools remain recorded, not simulated

Blocker verified 2026-10-11: the later real case requires a native application surface. This workspace contains no application checkout/build, demo roles, device/simulator, or native automation executable (`adb`, Maestro, Xcode/simctl). The existing capability gate correctly returns `surface_unsupported`; implementing or claiming a working adapter cannot be validated from the supplied environment.
