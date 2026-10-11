# IDs, paths, and capabilities

Artifact IDs are derived from canonical identity inputs with SHA-256 and a semantic prefix. Display names and public titles are not IDs.

Consumer output paths must be relative to the project, reject traversal and unresolved symlinks, and resolve existing symlinks before use. Core path and state helpers reject the plugin installation as a consumer root.

Capabilities are declared by verified adapters. A missing adapter blocks only its affected scope and returns an actionable `surface_unsupported` error. In particular:

- mobile web never stands in for a native adapter;
- CLI and API evidence use reproducible commands or requests without inventing a graphical interface;
- provided material is accepted with provenance-limited verification;
- web capture uses a saved Playwright journey and verifies the observed result before allowing claims;
- native and desktop support are not declared until their adapters are implemented and tested.

The web adapter requires a resolved Chromium executable and reports `blocked` when it cannot launch it. Capture uses an explicit request-origin allowlist (the application origin by default), requires a visible role assertion, and stores only sanitized failure messages. Playwright is a pinned runtime dependency in the self-contained plugin archive; no browser binary is downloaded or bundled implicitly.

