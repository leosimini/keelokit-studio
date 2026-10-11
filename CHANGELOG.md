# Changelog

## Unreleased

- Fixed: state could be written outside the project through a symlinked `.keelokit`.
- Fixed: voice artifacts no longer persist credential-like options or provider error text; an unknown cost fails the budget closed; failed jobs are not cached.
- Fixed: the dashboard rejects non-loopback `Host`/`Origin`, requires JSON writes, stamps its own time, refuses credentials in publication URLs and keeps history and recommendations across replans.
- Fixed: web capture blocks off-allowlist WebSockets and no longer derives the stored procedure hash from typed step values.
- Fixed: exports require a structural MP4 check instead of a self-declared probe.
- Fixed: `ready`, resuming from `blocked`, pilot/production and plan approval now require the brief approval, valid render/QA and a current style approval; style approval requires passing editorial reports from a different actor; distribution requires a style approval; the publication queue verifies its strategy and plan.
- Fixed: renders reject timeline gaps, unapproved assets, assets a component would not display and free-text captions; Remotion no longer writes a bundler cache into the plugin and its browser probe launches the browser.
- Changed: selected hooks must be evidence-safe and open the piece.
- Changed: the ZIP is named after its platform and smoke-tested before it is written.
