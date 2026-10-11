# Video design

How Studio turns a validated storyboard into a video, and what the motion director can ask of the renderer. Everything here is presentation: it never adds a claim, an asset or copy that the storyboard and its evidence did not already validate.

## The picture

- **Scenes** use one of six components: `title`, `result`, `end` (copy only), and `browser`, `phone`, `feature` (a verified capture). A captured scene shows its asset in a framed window (browser chrome or a phone bezel) sized to the asset's real aspect ratio, with a soft shadow on a themed backdrop.
- **Copy** comes from the storyboard: the scene's on-screen text is a chip above the window (or a large panel beside a phone in a wide frame, or the headline of a `feature` scene); captions sit at the bottom. The layout reserves their space, so the window never sits under text.
- **Capture at 2× or better.** The camera can zoom up to 6×; web captures default to a device scale factor of 2 so the zoomed pixels are real. Native captures are full resolution.
- **Formats.** Render 1920×1080 for landscape and 1080×1920 for vertical. A desktop capture in a vertical frame is small by nature: use a camera move to fill the frame, or capture the mobile layout. Keep captions out of the platform's bottom UI area with `theme.safe_padding`.

## Motion (authored by the motion director, in the motion spec)

Per scene, on top of `entrance`, `exit`, `emphasis` and `purpose`:

| Field | What it does |
|---|---|
| `camera` | `{start: {x, y, zoom}, end: {x, y, zoom}, from_frame, to_frame, easing}`. Which part of the asset is visible: `x`, `y` are the focal point in 0..1 of the asset, `zoom` is 1 to 6. The camera holds before `from_frame` and after `to_frame`, and never shows beyond the asset's edge. `easing` is `linear`, `ease-in-out` or `ease-out`. |
| `callouts` | Up to 3 of `{region: {x, y, width, height}, label, start_frame, end_frame, style}` in the same 0..1 asset coordinates, so they stay on the element while the camera moves. `style` is `box` or `spotlight` (dims everything else). A label must equal the scene's narration, on-screen text or step; it cannot introduce new copy. |
| `cursor` | `{points: [{x, y, frame}], click_frame}`: a pointer that glides along 2 to 8 points and ripples at the click. |
| `transition` | `{type: "none" \| "crossfade", frames}` (1 to 15 frames, never on the first scene). |

To frame a region of the capture, compute its centre for the focal point and `zoom = 1 / max(width, height)`. These all need exactly one visual asset in the scene and a `browser`, `phone` or `feature` component. Unknown motion keys are rejected, never ignored.

`renderConfig.reduced_motion: true` renders the same piece without anything that moves: cuts, the camera held on its final framing, the cursor at rest, no pulse, no crossfade. It is a separate render (a different `render_id`), meant as the variant for viewers who need it.

## Sound

- **Narration.** Generate each scene's narration with a voice provider (`docs/voice.md`), save it with `persistNarration`, and pass it as `renderConfig.narration: {<scene_id>: {asset_id, voice_artifact}}`. The renderer refuses narration whose audio was generated from different text, for another scene or piece, whose hash does not match, or that is longer than its scene, and it requires every scene with narration to be voiced or none. The MP4 then carries one AAC track.
- **Music.** `renderConfig.music: {asset_id, volume, duck_volume, fade_in_seconds, fade_out_seconds}`. The asset's origin must record a license; Studio does not use music of unknown rights. Music loops, fades in and out, and ducks under the narration.
- **Captions.** `renderConfig.captions: "narration"` shows the approved narration as captions, in phrases timed from the voice alignment when the provider returns it. Captions can also be exported as WebVTT or SRT with `renderStoryboardCaptions`. Use `captions` or `subtitles`, not both.
- Loudness is not normalised: listen to the result and adjust `volume` and the voice provider's settings.

## Review and output

- **Preview every scene.** `renderRemotionSceneStills({..., position})` renders one still per scene (`position` 0 is a scene's first frame, 1 its last, 0.5 the middle). Look at the end of each camera move, not only the middle. `renderRemotionPreview` renders the first scene only.
- **Pacing warnings.** The render manifest lists `warnings` (non-blocking): a scene too short to read its text (`too-short-to-read`) and a long scene with little narration (`mostly-silent`).
- **Encoding.** H.264 in `yuv420p`, BT.709, CRF 16, AAC 192 kbps. A video that should carry audio must pass the export check with `expects_audio: true`, which fails an MP4 without an audio track.
- **Languages.** Render every language of a localized piece with `renderRemotionLocalizedVideos`; each variant has its own narration and captions (`docs/localization.md`).
