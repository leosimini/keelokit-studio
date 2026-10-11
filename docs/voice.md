# Optional voice adapter

Studio assumes no voice provider. A configured adapter must declare availability before use. Every request is bound to exact approved narration, project-defined provider/model/voice/language/pronunciation/options, budget and a stable request hash.

Successful audio records provider job identity, known cost, measured duration and alignment when supplied. Missing alignment remains explicit. An uncertain submission is queried when the provider supports it and is never automatically resubmitted. Terminal results may be cached by exact request hash; changing narration invalidates only that voice request.

The deterministic provider is a test double. It verifies orchestration, cache and failure behavior, not naturalness, pronunciation, provider availability or pricing.

## Providers and the audio itself

`generateVoice` returns `{artifact, audio_bytes, cache_hit}`. The audio must be `audio/wav`: its duration is measured from the file and replaces whatever the provider reports, and anything else is rejected. `persistNarration` saves the WAV and its voice artifact in the project and returns the audio asset to give the renderer (`docs/video-design.md`).

Providers (all optional, all capability-gated):

- `createOpenAiCompatibleSpeechProvider({endpoint, apiKeyEnv, pricing})` works with any service that implements `POST /v1/audio/speech` and can answer in WAV, hosted or local. The key is read from the environment variable you name when a request is made and is never stored; the endpoint must be https (plain http only for a local server). Provide `pricing: {currency, per_character}` so a budget can be enforced; without a price a budgeted request is refused.
- `createMacSayProvider()` uses the macOS `say` command for free, offline drafts. The voice must match the piece's language (for example `Monica` for Spain Spanish).
- The deterministic provider produces tone bursts, not speech. It exists to test orchestration.

Neither real provider has been exercised against the live service or a real macOS in Studio's own verification: they are tested against stand-ins. Listen to a sample before producing a whole piece.
