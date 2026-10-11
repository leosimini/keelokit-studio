# Audiences and brief

Audience candidates come from project context and confirmation. Studio assigns stable internal IDs but does not supply fixed buyer, operator, developer, geography, industry, or channel audiences. Public names stay separate from those IDs.

The structured brief records objective, supported messages, audience treatments, channels, visibility, UI/build, scope, budget, reviewers, and success criteria. Every message cites known sources and every treatment references a declared audience.

Tone and voice are explicit per relevant audience. A detected choice can only be `proposed`; only an explicitly confirmed choice can be `confirmed`. The Markdown brief is a derived review view of the structured contract, not a second editable owner.

## Languages

A brief declares `languages: {primary, additional[]}` (language tags such as `es-AR`) and at least one supported message in each language, tagged with `language`. The interview asks for them with `languagesIntakeField`; `confirmedLanguages` turns the confirmed answer into the brief input. A language without a supported message is rejected, so a piece can never be planned in a language the brief does not cover.
