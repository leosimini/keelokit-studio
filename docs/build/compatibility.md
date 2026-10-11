# Compatibility map

Verified on 2026-10-11.

| Surface | Version or revision | Evidence | Status |
| --- | --- | --- | --- |
| Claude Code CLI | 2.1.296 | `claude plugin validate`, local marketplace install, and `--plugin-dir` inventory | verified for manifest, components, and loading |
| Claude Code plugin layout | 2.1.296 | official plugin examples and strict validator | conventional manifest, commands, skills |
| Keelokit | 0.9.1, commit `ae9966c4994438332a3ff5c1497ce499ae117c9b` | repository instructions, marketplace, packaging, and tests | compatible independent repository |
| Node.js | 24.19.0 exercised; 22.16+ required | local verification, Keelokit baseline, and stable `node:sqlite` interface | verification and state runtime |
| Remotion | 4.0.534 | npm metadata, installed type definitions, `bundle`, `selectComposition`, and real `renderStill` with system Chromium | integrated for C04 PNG previews |
| Dashboard | Node.js HTTP on `127.0.0.1` | persisted revision tests, path/XSS review, registered artifact serving and publication round trips | verified for local consumer projects |
| Native capture | `adb-android`, `simctl-ios` adapters | contract tests against stand-ins for `adb` and `xcrun simctl`; no device, emulator, Xcode or simulator was available | implemented, **not verified on real hardware** |

## Current limits

- Claude Code is exercised through the pinned development dependency because it is not installed globally in the build environment.
- Plugin loading can be observed without authentication. A model-driven command execution is not verified because the environment has no Claude login or API credential.
- Remotion has separate commercial terms. Its packages declare `SEE LICENSE IN LICENSE.md`; each installing organization must confirm eligibility, and Studio's MIT license does not relicense it.
- The render adapter requires an explicit Chromium-compatible executable and does not trigger an implicit browser download.
- Marketplace integration in Keelokit waits for an installable, remotely accessible Studio revision.

