# Optional voice adapter

Studio assumes no voice provider. A configured adapter must declare availability before use. Every request is bound to exact approved narration, project-defined provider/model/voice/language/pronunciation/options, budget and a stable request hash.

Successful audio records provider job identity, known cost, measured duration and alignment when supplied. Missing alignment remains explicit. An uncertain submission is queried when the provider supports it and is never automatically resubmitted. Terminal results may be cached by exact request hash; changing narration invalidates only that voice request.

The deterministic provider is a test double. It verifies orchestration, cache and failure behavior, not naturalness, pronunciation, provider availability or pricing.
