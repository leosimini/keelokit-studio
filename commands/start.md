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

If the command exits with status 3, dependencies are not installed on this machine: tell the user, run the `npm ci --omit=dev --ignore-scripts --prefix` command it prints (a one-time install, nothing else is written into the plugin), and run the router again.

Follow the returned action. Use the implemented discovery, intake, audience, brief, plan, evidence, storyboard, pilot, production, QA, guide, distribution and dashboard contracts. Ask for explicit approval of the exact brief, plan and style subject at their gates. Keep production, verification and publication annotations separate. Never simulate an unavailable surface or automatic publication.

Once a representative script and preview exist, delegate their cold review to the read-only `editorial-critic` agent. Bind its report to the exact piece, storyboard revision and preview/export hash. A `CHANGES REQUESTED` or `NOT REVIEWABLE` verdict blocks style approval and batch production until the author revises the piece and the critic reviews the new revision. A critic `PASS` is not owner approval and does not predict channel performance.

Draft candidate suites without approving them, then delegate portfolio reasoning on that exact draft to the read-only `content-strategist`. Persist citations, recipes, impact hypothesis, uncertainty, effort basis, alternatives and dependencies. Apply accepted changes, regenerate stale strategy bindings, and only then present the final plan plus reasoning for approval and compute its deterministic queue. Never substitute plan order or unsupported model preference for an argument.

During discovery and selective intake, inventory only the external capabilities required by the active scope (for example capture, voice, rendering, storage, or publishing). For each required capability, confirm the provider, model or relevant configuration, budget/limits, and whether a capability check may run. If authentication is needed, ask for the environment-variable name or secret-manager reference that supplies it; never ask the user to paste a key, token, password, or other secret value, and never persist one in Studio state or artifacts. An unavailable or unconfigured provider remains an explicit scoped gap. Do not ask about integrations the active scope does not need.

