# Asset requirements

`src/assets/requirements.mjs` records explicit, generic asset requests before media is supplied. It does not select a product, asset source, layout, or capture method.

`createAssetRequirements({storyboard, requirements, evidence})` binds a document to the exact project, piece, storyboard ID, version, and canonical `contentHash(storyboard)`. Each input must supply all of these fields:

- `scene_id`, `purpose`, and `media_kind` (an existing inventory kind).
- `evidence_id`, `evidence_hash`, `build`, `role`, `locale`, `state`, `action`, and `result`. Non-evidence assets use explicit nulls where these are inapplicable. Evidence requests require all context strings, a scene-selected evidence ID, and `contentHash(evidenceRecord)`; build, role, and locale must match the storyboard target. When the evidence document is supplied, its project, record hash, build, role, locale, action step, and result are checked.
- `dimensions` (`{width, height}` in positive integer pixels or null), `aspect_ratio` (positive integer `width:height` or null), `crop`, `focus`, `duration_seconds` (positive seconds or null), and `rights` (the required inventory origin license or null). Specified dimensions and aspect must agree.
- `approval` (`{status: "pending" | "approved", review_id: string | null}`), and a nonempty array of unique `acceptance_criteria` strings. A null review ID allows any inventory review with the specified status; the inventory still requires a review ID for an approved asset.

No fields are silently defaulted. Unknown fields, duplicate requirements, and unknown scenes are rejected. Each `requirement_id` derives from the exact storyboard binding and all request fields; `fulfillment` starts at null. Changing request content requires constructing a new requirement instead of retaining its previous ID.

`fulfillAssetRequirement(document, {requirementId, assetId, assetSha256, storyboard, assets, evidence})` returns a cloned document with `{asset_id, sha256}` attached to the named requirement. The SHA-256 is the inventory's 64-character bytes digest, distinct from the `sha256:` canonical document hashes. It rejects unknown requirement IDs, stale storyboard bindings, unknown assets, mismatched bytes hashes, stale or rejected assets and their transitive asset dependencies, wrong media kind, incompatible evidence or evidence dependency hashes, license mismatches, and incompatible approval. Evidence fulfillment requires the current evidence document.

`validateAssetRequirements(document, {storyboard, assets, evidence})` rechecks the same constraints, including previously populated fulfillments. Unfulfilled requests can be validated without an inventory. Every populated fulfillment requires a current inventory from the same project. Validation returns the document or throws `AssetRequirementsError` with an `errors` array; underlying malformed inventories raise the existing inventory error.

Dimensions, crop, focus, duration, UI state, and acceptance criteria describe what the reviewer must inspect. The current inventory does not store measured dimensions, durations, or review findings, so this contract cannot automatically establish those properties. Likewise an inventory hash identifies recorded bytes; this module does not read media files or grant approval. A populated fulfillment records an inventory-compatible candidate, not a claim that all human acceptance criteria have passed. Require approved status and the relevant review ID when the workflow needs reviewed media.
