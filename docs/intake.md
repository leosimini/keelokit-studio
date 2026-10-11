# Selective intake

Intake fields distinguish `confirmed`, `inferred`, `contradictory`, `stale`, and `missing` information. The planner filters them to the active suite or scope, skips confirmed fields and current persisted decisions, and returns at most three questions per batch. Each question retains its source references and current value so confirmation is explicit.

Unresolved fields produce gaps with owner, impact, and affected scope. A blocking gap contributes only its own scope to `blocked_scope_ids`; it never blocks an unrelated suite. Gap records belong in `project-context.json`.

Confirmed answers are appended to revisioned engagement state as decisions bound to the exact subject hash and covered scopes. Re-entry combines current decisions by scope before planning the next question batch. A material source change produces a new subject hash and reopens only that field and its uncovered scopes. Approval remains a separate explicit record; an intake answer cannot approve a brief, plan, style, or publication.
