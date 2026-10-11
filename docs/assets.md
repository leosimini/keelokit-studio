# Asset persistence

Studio persists assets only below an explicit project-relative output directory. Copies are content-verified, receive stable IDs and SHA-256 hashes, and never use the plugin installation or a plugin cache as storage.

Each record keeps origin, approval state (`pending`, `approved`, or explicitly `unapproved`), optional evidence, and typed dependencies. Approved and unapproved records require a review ID. Hashes identify bytes; they do not establish correctness, rights, or approval.

Dependency changes mark only direct and transitive derivatives stale. Independent assets remain valid. Asset-to-asset links carry the referenced content hash and cycles are rejected.
