# Keelokit Studio

Keelokit Studio is a generic Claude Code plugin for evidence-backed product marketing. It is designed to discover product context, close relevant gaps, define audiences and strategy, require explicit approvals, and produce reviewable explainers, tutorials, guides, and social adaptations.

`/keelokit-studio:start` persists and resumes discovery, selective intake, audiences, brief, planning, exact approvals, evidence, production, independent QA and distribution preparation. Studio now uses explicit specialist handoffs: a cited portfolio strategist ranks what to produce and publish; a creative director develops competing hooks and a treatment; motion and asset specialists specify every beat and required proof; an independent adversarial critic evaluates the resulting script, assets and timed preview. Recipes are documented hypotheses with sources and limitations, never performance guarantees.

The implementation includes web capture, contributed material, evidence-bound scripts, exact asset requirements, a small validated motion vocabulary, real Remotion PNG/MP4 rendering, optional voice-provider contracts, evidence-derived guides, attributed post-publication observations and a persistent local dashboard. Unsupported surfaces, missing proof, stale handoffs and absent owner approvals remain explicitly blocked.

## Development checks

Requires Node.js 22 or newer.

```bash
npm ci
npm run verify
```

The installation test uses an isolated Claude Code configuration and a temporary consumer repository. It does not publish content or modify a user's Claude configuration.

## Dashboard

```bash
npm run dashboard -- /absolute/path/to/consumer-project 4317
```

The loopback dashboard persists suite progress, blockers, previews, exports, revision history, ranked publication recommendations and manual publication annotations under `.keelokit/studio/`. Refresh projection is idempotent and retains prior publication history. Studio prepares channel packages but never publishes automatically.

## Development loading

```bash
npx @anthropic-ai/claude-code@2.1.296 --plugin-dir /absolute/path/to/keelokit-studio
```

When a reviewed revision is available on the remote repository, Claude Code 2.1.275 or later can install it with:

```text
/plugin install keelokit-studio --marketplace leosimini/keelokit-studio
```

Keelokit Studio stores engagement state and outputs in the consumer project, never in the plugin installation or cache. Current verified surfaces and limits are recorded in `docs/build/compatibility.md`; native capture remains unavailable until a native adapter is exercised against a real build.

