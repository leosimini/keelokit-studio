# Storyboards by intent

`src/agency/storyboard.mjs` exports `createStoryboard(input)` and `validateStoryboard(storyboard, context)`. Both require the current plan, audience map, engagement state, evidence document, asset inventory and brand configuration. Authoring does not record approvals or render media.

The current plan subject in `state.versions.plan` (or an explicit `subjectKey`) must match the plan and referenced audiences and have an explicit, unrevoked approval. The storyboard records the plan ID, version, audience-bound hash and scope, a stable storyboard ID, and its own positive version. Changing the plan or a referenced audience requires review before authoring can continue.

The author supplies `pieceId`, `version`, `intentType`, `fps`, `evidenceTarget` and `scenes`. Audience, intention, message, CTA, structure, language and evidence IDs come from the approved piece. `durationSeconds` and `formats` may select approved values; an unconfirmed (`null`) plan duration may be resolved explicitly. There is no global duration, aspect ratio or audience count. A new duration, language, message or structure outside the approved piece requires updating and approving the plan.

Each scene has a unique `scene_id`, `section`, nullable `step`, `start_seconds`, `end_seconds`, `narration`, `on_screen_text`, `asset_ids`, `evidence_ids` and `claims` (objects with `claim` and `evidence_id`). Scenes form a contiguous positive timeline from zero to the storyboard duration. Scene section runs follow the approved structure.

- An `explainer` uses approved structure `["promise", "walkthrough", "cta"]` and one scene in each section. Promise and walkthrough require allowed evidence claims; the promise communicates the approved message and the closing scene communicates the approved CTA. Departures require `structureJustification` matching an explicitly approved piece requirement of the form `Storyboard exception: <justification>`.
- A `tutorial` uses `["preconditions", "step", "cta"]`. Non-exception piece requirements become its preconditions. Every procedure step from the selected evidence, in approved evidence-ID order, remains in the storyboard and its scenes, including repeated steps. Preconditions and steps must actually appear in narration or on-screen text.
- `custom` follows the approved structure but cannot bypass explainer rules for a promise structure or tutorial rules for a step structure.

Evidence is evaluated through the existing evidence gate: selected records must be available and match the declared journey, surface, role, build, flags, locale and optional commit. Output language must match that evidence locale. Claims must be exact entries in `allowed_claims` and reference evidence selected by their scene. The approved message itself must be supported. This first authoring path deliberately accepts exact approved statements: narration and on-screen text must be declared allowed claims, required preconditions, the scene's supported step or the approved CTA. Free paraphrases and translations need supported evidence statements before they can be authored.

Referenced assets and their transitive asset dependencies must exist in the inventory and be valid; rejected assets are blocked. Evidence links and dependency hashes must match scene evidence, and brand dependencies must refer to the supplied brand. Pending asset approval remains visible in the inventory and is allowed for drafting; storyboard creation does not approve it. Inventory paths and dependency graphs use existing asset validation. This gate checks declared inventory availability, not files on disk.

The schema retains compatibility with early, unversioned contract fixtures. Supplying `version` activates the complete authoring contract; `validateStoryboard` always requires that versioned contract. The generic directory contract validator remains a schema/reference check and does not replace the authoring approval and intent gate.

Verification: `node --test tests/storyboard.test.mjs tests/contracts.test.mjs`. Validation establishes declared references and supported statements, not evidence truth, editorial quality, rights, final render clarity or QA approval.
