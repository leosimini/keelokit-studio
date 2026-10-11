# Keelokit Studio — working agreement for this repo

This repo is Keelokit Studio itself: a Claude Code plugin for evidence-backed product marketing,
and a sibling of [Keelokit](https://github.com/leosimini/keelokit) in its marketplace. It is
generic. No product, fixture or customer name may appear in defaults, logic, schemas, agents or
skills; fixtures live in `fixtures/` and historical validation records in `docs/build/validation/`
(explicitly non-normative).

## Layout

```
.claude-plugin/   plugin.json, marketplace.json (development marketplace)
commands/ skills/ agents/    the plugin surface
src/              runtime: state, agency contracts, adapters, render, QA, dashboard
schemas/ recipes/ references/ docs/    contracts, documented hypotheses, sources, per-area docs
scripts/          start/state/dashboard entry points, verification, package-plugin.sh
tests/ fixtures/  node:test suite and synthetic products
```

## Commands

| What | Command |
|---|---|
| Everything CI should check | `npm run verify` |
| Unit tests only | `npm test` (rendering and capture tests need a Chromium; set `KEELOKIT_CHROMIUM` or `PLAYWRIGHT_BROWSERS_PATH`) |
| Strict manifest validation | `npm run validate:plugin` |
| Self-contained ZIP | `scripts/package-plugin.sh` → `dist/` (platform-tagged, not versioned in git) |

## Rules

- A rule that matters points to an executable check. Write the failing test first.
- Whoever produces does not approve. Keep author, verifier, reviewer and breaker apart.
- Unknowns are recorded as gaps, never invented. No secrets are requested or persisted; use
  environment-variable names or secret-manager references.
- "Rendered" is not "verified" and "ready" is not "published". Studio never publishes.
- Approvals bind to an exact version and hash. A material change invalidates only its dependents.
- The plugin never writes into its own installation directory; state belongs to the consumer
  project under `.keelokit/studio/`.
- No hypothetical abstractions or infrastructure.

## Releases

Never change `version`, create tags or push release branches by hand. A release is requested by
the maintainer. The Keelokit marketplace entry for Studio should pin a reviewed `sha` or tag.
