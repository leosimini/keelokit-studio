# Keelokit Studio

Keelokit Studio is a generic Claude Code plugin for evidence-backed product marketing. It is designed to discover product context, close relevant gaps, define audiences and strategy, require explicit approvals, and produce reviewable explainers, tutorials, guides, and social adaptations.

The repository is under active construction. The current foundation exposes `/keelokit-studio:start`, validates the plugin structure, and proves isolated installation. Persistent campaign state and production capabilities are added milestone by milestone; the command reports unavailable stages instead of pretending they work.

## Development checks

Requires Node.js 22 or newer.

```bash
npm ci
npm run verify
```

The installation test uses an isolated Claude Code configuration and a temporary consumer repository. It does not publish content or modify a user's Claude configuration.

## Development loading

```bash
npx @anthropic-ai/claude-code@2.1.296 --plugin-dir /absolute/path/to/keelokit-studio
```

Keelokit Studio stores future engagement state and outputs in the consumer project, never in the plugin installation or cache.

