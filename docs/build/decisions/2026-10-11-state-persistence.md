# Consumer state persistence and concurrency

Status: accepted for C01-02 on 2026-10-11.

## Decision

Keep the engagement record as validated JSON under the consumer project's `.keelokit/studio/` directory. Use a monotonic revision plus an operating-system SQLite transaction lock for cross-process updates. Initialize exclusively and replace validated snapshots atomically.

## Reasons

JSON remains inspectable and versionable with the consumer repository. Revisions reject stale sessions, while the SQLite transaction prevents two sessions from passing the same revision check concurrently. Unlike marker files, the operating system releases the transaction if a process is killed.

## Consequences

Node.js 22.16 or newer is required for the used `node:sqlite` interface. The adjacent SQLite file coordinates writers only and is not a second editable source of engagement data. Transition policy and selective invalidation remain C01-03.

