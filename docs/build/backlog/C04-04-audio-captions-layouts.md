# C04-04 — Measure audio, captions and layouts

Status: verified

- Requirements: ST-006, ST-010, ST-011, ST-015
- Evaluations: EV-011, EV-012
- Inputs: storyboard and rendered preview, measured voice/audio when present, caption text and timing, target layout specifications and configured review constraints
- Output: measurement and layout report identifying duration, audio bounds, caption/audio alignment, text/layout readability checks and any unresolved constraints
- Dependencies: C04-01, C04-02, C04-03
- Changes planned: measure actual rendered/audio durations rather than infer timing from word counts; check caption timing against available audio alignment; inspect supported layouts for clipping, unsafe placement and illegible text; keep thresholds configurable and distinguish mechanical results from human observations
- Acceptance: timing and layout problems are reported against the affected scene or artifact; audio narration is not silently truncated to fit; captions remain linked to their timing source; the system does not present proposed mix or layout targets as universal platform rules
- Verification: use synthetic media fixtures covering aligned and misaligned captions, short/long audio, clipping and readable layouts; confirm each issue is surfaced and missing measurement capability is declared
- Limit: mechanical measurements do not establish accessibility or perceptual quality; sampled frames alone cannot prove there are no defects between frames
