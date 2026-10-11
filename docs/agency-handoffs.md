# Specialist handoffs

Every specialist transition is a persisted, content-addressed handoff. It records the producing role and run, the exact input artifact versions and hashes, the exact output, unresolved issues, and the next role.

A `ready` handoff cannot contain unresolved issues. A `blocked` handoff must name them. Consumers must call `assertAgencyHandoffCurrent` with the artifacts they actually loaded; a changed hash or version invalidates the handoff.

This contract proves continuity and freshness. It does not claim that a producer's judgment is correct; the next independent review gate remains responsible for that evaluation.
