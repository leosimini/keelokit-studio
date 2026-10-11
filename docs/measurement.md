# Media measurement

Studio measures supported audio bytes and compares their duration with the rendered artifact. Captions retain their timing source and may be checked against provider alignment using an explicit project tolerance. Layout checks use measured element and viewport bounds plus project-configured safe margins and minimum text size.

Unsupported or corrupt media produces an explicit unavailable capability and blocker. Audio is never shortened silently. Layout sampling and mechanical checks do not certify accessibility, perceptual quality, or frames that were not inspected.
