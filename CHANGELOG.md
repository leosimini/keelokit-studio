# Changelog

## Unreleased

- Changed: the video design. Browser and phone windows sized to the real asset, a themed backdrop and a calm layout (a compact step chip above the stage, or a side panel for a phone in a wide frame; captions below; no text over the picture), balanced headings, a result card with an animated check and a call-to-action pill.
- Added: camera moves in the motion spec (focal point and zoom up to 6x with easing and hold), callouts (`box` and `spotlight`) and an animated cursor with a click ripple, all in asset coordinates so they follow the camera, and crossfade transitions. Unknown motion keys are rejected. Verified by rendering real pixels.
- Added: sound. Voice providers return the audio itself (WAV, duration measured from the file), `persistNarration` saves it as an audio asset, and the renderer binds each scene's narration to its exact approved text, scene, hash and measured length, refuses narration longer than its scene, mixes in licensed music that fades and ducks under the voice, and shows captions in phrases timed from the voice alignment. MP4 exports are checked for an audio track when one is expected. OpenAI-compatible and macOS `say` providers are included (tested against stand-ins).
- Added: `reduced_motion` renders; 2x web captures by default so zoom stays sharp; per-scene preview stills at any position; pacing warnings in the render manifest; H.264 `yuv420p` BT.709 with AAC.

- Added: native mobile capture. `adb-android` drives an Android device or emulator (launch, tap by text, type, keys, visible-text assertions) and its evidence can back claims; `simctl-ios` launches and navigates an iOS simulator by deep link and keeps screenshots, but they are `screenshot-only` and cannot back claims. `scripts/studio-capture-native.mjs` checks the tooling and runs a capture. Contract-tested against stand-ins; not yet exercised on real hardware (`docs/native-capture.md`).
- Added: languages. The interview asks which languages to produce in (`languagesIntakeField`), briefs declare `languages` and a supported message per language, `localizePieces` plans one complete variant per language, and `renderRemotionLocalizedVideos` renders every language with the same composition from one bundle. Each language needs evidence captured in that language (`docs/localization.md`).

- Fixed: state could be written outside the project through a symlinked `.keelokit`.
- Fixed: voice artifacts no longer persist credential-like options or provider error text; an unknown cost fails the budget closed; failed jobs are not cached.
- Fixed: the dashboard rejects non-loopback `Host`/`Origin`, requires JSON writes, stamps its own time, refuses credentials in publication URLs and keeps history and recommendations across replans.
- Fixed: web capture blocks off-allowlist WebSockets and no longer derives the stored procedure hash from typed step values.
- Fixed: exports require a structural MP4 check instead of a self-declared probe.
- Fixed: `ready`, resuming from `blocked`, pilot/production and plan approval now require the brief approval, valid render/QA and a current style approval; style approval requires passing editorial reports from a different actor; distribution requires a style approval; the publication queue verifies its strategy and plan.
- Fixed: renders reject timeline gaps, unapproved assets, assets a component would not display and free-text captions; Remotion no longer writes a bundler cache into the plugin and its browser probe launches the browser.
- Changed: selected hooks must be evidence-safe and open the piece.
- Changed: the zip is source-only (about 180 KB), identical on every platform and reproducible; dependencies are installed once with `npm ci --omit=dev`. The router explains this instead of crashing. `releases/keelokit-studio-plugin.zip` is the downloadable copy and `npm run verify` fails when it is stale.
- Changed: `@anthropic-ai/claude-code` is no longer a dependency; checks use a pinned `npx` call, so installing the plugin no longer downloads a 250 MB binary.
- Added: `setPieceComponent` is the only writer of piece progress; exports and distribution are bound to the render and storyboard; plans record the brief they were built on; captions export from approved narration; per-scene preview stills; focus emphasis renders; strategy cannot claim high confidence without observed outcomes.
- Added: `docs/trust-model.md`.
