# Discovery sources

The context adapter records project-relative provenance, observation time, optional build, classification, and a content hash without copying source contents into persistent state. The manual adapter uses the same observation contract and loads a bounded excerpt only when the active task needs it.

`source-observations.schema.json` validates the adapter payload. It is a staging payload, not a second editable owner: accepted observations are incorporated into the consumer project's `project-context.json`.

Source classifications are `confirmed`, `inferred`, `contradictory`, `stale`, or `missing`. Classification describes the observed source; file existence alone does not prove a product claim. README and backlog sources cannot attest feature availability. Completed-work records, changelogs, UI, builds, and journeys are only candidates for later evidence verification.

Contradictions remain explicit for selective intake. Missing or stale sources are local facts; C02-02 determines which affected scope, if any, they block.
