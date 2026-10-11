# Compatibility map

Verified on 2026-10-11.

| Surface | Version or revision | Evidence | Status |
| --- | --- | --- | --- |
| Claude Code CLI | 2.1.296 | `claude plugin validate`, local marketplace install, and `--plugin-dir` inventory | verified for manifest, components, and loading |
| Claude Code plugin layout | 2.1.296 | official plugin examples and strict validator | conventional manifest, commands, skills |
| Keelokit | 0.9.1, commit `ae9966c4994438332a3ff5c1497ce499ae117c9b` | repository instructions, marketplace, packaging, and tests | compatible independent repository |
| Node.js | 24.19.0 exercised; 22.16+ required | local verification, Keelokit baseline, and stable `node:sqlite` interface | verification and state runtime |
| Remotion | 4.0.534 observed | npm metadata and upstream licensing documentation | selected for C04; not integrated yet |

## Current limits

- Claude Code is exercised through the pinned development dependency because it is not installed globally in the build environment.
- Plugin loading can be observed without authentication. A model-driven command execution is not verified because the environment has no Claude login or API credential.
- Remotion has separate commercial terms. It is not an MIT dependency and will not be installed until the media milestone needs it.
- Marketplace integration in Keelokit waits for an installable, remotely accessible Studio revision.

