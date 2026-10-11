# Adversarial editorial review

Studio separates authorship from editorial judgment. After a representative script and preview exist, the read-only `editorial-critic` subagent reviews the exact brief, plan, audience, channel constraints, evidence, storyboard, exported script, assets and rendered revision cold. It attacks hook strength, audience relevance, narrative progression, clarity, pacing, product proof, asset choice, CTA continuity, channel/format fit, evidence discipline and distinctiveness.

The report is bound to the piece, storyboard version and preview/export hash. Missing or stale inputs produce `NOT REVIEWABLE`, while blocking or major findings produce `CHANGES REQUESTED`. Either verdict stops style approval and batch production; a material script, asset, channel, duration or CTA change requires a new review.

A `PASS` means only that the exact revision survived the defined editorial rubric. It cannot predict engagement, replace audience research, substitute for the product owner's explicit style approval, certify factual accuracy, or replace post-publication measurement. The author, critic, owner approver, factual verifier and mechanical QA remain separate roles.
