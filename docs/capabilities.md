# IDs, paths, and capabilities

Artifact IDs are derived from canonical identity inputs with SHA-256 and a semantic prefix. Display names and public titles are not IDs.

Consumer output paths must be relative to the project, reject traversal and unresolved symlinks, and resolve existing symlinks before use. Core path and state helpers reject the plugin installation as a consumer root.

Capabilities are declared by verified adapters. A missing adapter blocks only its affected scope and returns an actionable `surface_unsupported` error. In particular:

- mobile web never stands in for a native adapter;
- CLI and API evidence use reproducible commands or requests without inventing a graphical interface;
- provided material is accepted with provenance-limited verification;
- web, native, and desktop support is not declared until its adapter is implemented and tested.

