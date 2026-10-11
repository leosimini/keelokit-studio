# Localization

A brief declares its languages (see `docs/brief.md`). Each language of a piece is its own **localized variant**: an ordinary planned piece with its own `language`, copy, evidence, storyboard, motion, assets and review, linked to its siblings by `localization_group`.

## Planning

- `localizePieces(basePieces, {"en-US": {}, "es-AR": {<pieceKey>: {message, intention, cta, evidence_ids, evidence_requirements}}})` expands each base piece into one variant per language. Variant keys are `<pieceKey>.<language>` and dependencies follow the same language.
- `createContentPlan` requires every piece's language to be a brief language and its message to be a brief message written in that language. A group must cover every brief language, repeat none, and keep the same audience, structure, formats and channels.
- With more than one brief language, a piece outside any group needs a `Localization exception: <reason>` requirement; otherwise the plan is rejected.

## Evidence and copy

Claims must still match an evidence record verbatim, and a storyboard's evidence locale must equal its language. A Spanish variant therefore needs evidence captured in the product's Spanish locale, with its own allowed claims; an English claim is never accepted as a translation. Hooks are written for each language by the creative director, not translated mechanically.

## Rendering

`renderRemotionLocalizedVideos({variants, browserExecutable})` renders every language with the same composition from one bundle. Variants must have distinct languages and share size, frame rate and theme, and each is checked against its own storyboard, evidence and handoffs before any frame is rendered. Export captions per language with `renderStoryboardCaptions`.

Studio cannot check that a font covers a language's script. Choose a theme font that does, and review each variant's preview.
