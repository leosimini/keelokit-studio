# Rendering

Studio uses a portable render manifest and a first adapter for Remotion 4.0.534. The adapter binds each render ID to the full storyboard, brand record and version, selected evidence records, asset hashes and approval states, and explicit layout, theme, and component configuration.

No customer, audience, channel, duration, frame rate, dimensions, palette, font, or scene component is selected implicitly. Product imagery must arrive as a supplied asset whose embedded bytes match the inventory SHA-256; the renderer does not reconstruct a product interface.

The current C04-01 output is an in-memory PNG preview. A browser executable must be configured and available; Studio will not download one implicitly. A successful render retains `qa_status: not-reviewed`: preview and pilot review, exports, media checks, and independent QA belong to later C04 stories.

Remotion has its own license terms. Installing organizations must confirm eligibility; Studio's MIT license does not change those terms.
