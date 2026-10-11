---
description: Start or resume a Keelokit Studio product-marketing engagement
argument-hint: Optional objective or project context
---

# Keelokit Studio start

Use the `keelokit-studio` skill to start or resume the engagement described by `$ARGUMENTS`.

Run the persisted start router from the consumer project before choosing an action:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/studio-start.mjs" --project-root "$PWD" --project-id "<confirmed-project-id>"
```

Follow the returned action. Use the implemented context/manual discovery, selective intake, audience, brief, plan, and review contracts. Ask for explicit approval of the exact rendered subject. Media production, dashboard mutation, and publication are not yet implemented; report those capability limits instead of simulating them.

