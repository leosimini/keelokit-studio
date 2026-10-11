# Engagement state

Studio state belongs to the consumer project at `.keelokit/studio/state.json`. Initialization refuses to overwrite an existing file and all later writes validate a cloned snapshot before atomically replacing the prior JSON.

The JSON records:

- engagement and piece phases;
- document versions and confirmed decisions;
- explicit approvals bound to kind, scope, version, and SHA-256 hash;
- costs and provider jobs, including uncertain jobs that must be queried before retry;
- appendable audit events and a monotonic `state_revision`.

`versions` stores the current scope, version, hash, and covered piece IDs for plan/style subjects. Production derives its approval checks from those persisted subjects; callers cannot select an older approved hash or substitute another approval kind.

`ready` never means `published`. Publication records are modeled separately in the distribution milestone.

## Concurrency and recovery

Every update compares its loaded `state_revision` with the current file and rejects stale snapshots. A small SQLite coordination file next to the JSON provides an operating-system lock across processes; the operating system releases it when a process exits, including forced termination. The JSON remains the source of truth.

This requires Node.js 22.16 or newer. The implementation rejects destinations inside the plugin installation and resolves existing symlinks before creating state directories.

## Development CLI

```bash
npm run state -- init /path/to/consumer project-id
npm run state -- show /path/to/consumer
```

`init` is exclusive. Run `show` or load the existing state to resume; never initialize again to reset an engagement.

## Transition and invalidation rules

Engagement transitions follow the documented phase graph. A pilot requires a current plan approval and explicit pieces contained by that plan. Production requires an explicit batch, current plan approval, and current style approval covering every selected piece.

Material changes mark only selected piece components stale. Title changes preserve capture and voice. UI, role, and journey changes invalidate evidence and its media derivatives. Brand or voice changes also remove only the affected current style subjects, while historical approvals remain as audit evidence. `ready` remains separate from publication.

