# Brief and plan review

Review subjects use the document version and a full canonical SHA-256 hash. Studio persists each current subject before presenting the combined brief and plan view. The view shows whether that exact brief and plan are approved or still require approval.

An approval requires an explicit reviewer identity and method. It is recorded against exact kind, scope, version, and hash. A changed document becomes a different subject and is not covered by the earlier approval. Silence never approves anything.

A request for changes records the reviewed version/hash and comments as an event without creating an approval. Production remains blocked by the state transition guards until the current plan and later style subjects have their required approvals.
