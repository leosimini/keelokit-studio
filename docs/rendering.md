# Rendering

Studio uses a portable render manifest and a first adapter for Remotion 4.0.534. The adapter binds each render ID to the full storyboard, brand record and version, selected evidence records, asset hashes and approval states, and explicit layout, theme, and component configuration.

No customer, audience, channel, duration, frame rate, dimensions, palette, font, or scene component is selected implicitly. Product imagery must arrive as a supplied asset whose embedded bytes match the inventory SHA-256; the renderer does not reconstruct a product interface.

The current C04-01 output is an in-memory PNG preview. A browser executable must be configured and available; Studio will not download one implicitly. A successful render retains `qa_status: not-reviewed`: preview and pilot review, exports, media checks, and independent QA belong to later C04 stories.

Remotion has its own license terms. Installing organizations must confirm eligibility; Studio's MIT license does not change those terms.

## Previews, captions and audio

- `renderRemotionPreview` returns one still at the midpoint of the first scene (frame 0 can be an entrance fade that shows only the background). `renderRemotionSceneStills` returns one still at the midpoint of every scene; review all of them.
- A scene's declared asset must be displayable by its component (`browser`, `phone` or `feature`); `title`, `result` and `end` reject assets. Timelines must be contiguous from 0 to the storyboard duration.
- Subtitles may only equal the scene's narration or on-screen text. `renderStoryboardCaptions(storyboard, "vtt" | "srt")` exports captions from approved narration and timing.
- The MP4 carries one AAC track when narration or music is supplied (`audio_tracks: 1`, `narration_audible`); without them it has none and the manifest says `audio_tracks: 0`. See `docs/video-design.md`. QA reports a video without sampled frames, or with narration but no measured audio, as a blocker.
- `focus` emphasis darkens the edges around the frame; `pulse` composes with entrances. Motion keys the renderer does not implement are rejected. `reduced_motion: "cut"` is a declared policy; Studio does not render a separate reduced-motion variant.
- The browser must be a headless-shell or Chrome for Testing build; a full desktop Chrome that answers `--version` is reported as blocked.
