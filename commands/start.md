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

Follow the returned action. Use the implemented discovery, intake, audience, brief, plan, evidence, storyboard, pilot, production, QA, guide, distribution and dashboard contracts. Ask for explicit approval of the exact brief, plan and style subject at their gates. Keep production, verification and publication annotations separate. Never simulate an unavailable surface or automatic publication.

During discovery and selective intake, inventory only the external capabilities required by the active scope (for example capture, voice, rendering, storage, or publishing). For each required capability, confirm the provider, model or relevant configuration, budget/limits, and whether a capability check may run. If authentication is needed, ask for the environment-variable name or secret-manager reference that supplies it; never ask the user to paste a key, token, password, or other secret value, and never persist one in Studio state or artifacts. An unavailable or unconfigured provider remains an explicit scoped gap. Do not ask about integrations the active scope does not need.

