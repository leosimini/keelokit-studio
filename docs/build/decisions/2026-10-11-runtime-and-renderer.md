# Runtime, plugin layout, and initial renderer

Status: accepted for C00 on 2026-10-11.

## Decision

- Use Claude Code's conventional plugin layout with one explicit `start` command and one orchestration skill. Add agents only when a milestone has independent work for them.
- Use Node.js 22 or newer for deterministic scripts, schemas, dashboard generation, and later TypeScript media code. The plugin itself remains usable without a resident process.
- Use Remotion as the first render adapter in C04. Keep the editorial model independent from the renderer.
- Do not add hooks in C00. Brief, plan, style, review, and publication approvals belong to versioned application state, not ambient lifecycle interception.

## Reasons

Claude Code 2.1.296 validates and auto-discovers the selected structure. Node matches Keelokit's supported baseline and the intended React/TypeScript renderer. Remotion provides programmatic composition, captions, preview, and rendering without requiring multiple render engines in the first delivery.

## Constraints and alternatives

Remotion's engine is source-available under its own commercial terms; eligibility and cost must be checked for the installing organization. The Keelokit Studio repository remains MIT, but that does not relicense Remotion. Hyperframes remains an Apache-2.0 alternative if licensing or distribution blocks Remotion. No renderer dependency is installed before C04.

