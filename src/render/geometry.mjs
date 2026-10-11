// Pure geometry for the camera, overlays and image sizes. Nothing here touches React or Remotion, so it is unit-tested directly.

export function fitRect(box, dimensions) {
  const scale = Math.min(box.width / dimensions.width, box.height / dimensions.height);
  return {width: dimensions.width * scale, height: dimensions.height * scale};
}

const easings = {
  linear: (t) => t,
  "ease-in-out": (t) => (t < 0.5 ? 4 * t * t * t : 1 - ((-2 * t + 2) ** 3) / 2),
  "ease-out": (t) => 1 - (1 - t) ** 3
};
export const easingNames = Object.freeze(Object.keys(easings));

export function easeValue(name, t) {
  if (!Object.hasOwn(easings, name)) throw new TypeError(`Unknown easing ${name}`);
  return easings[name](Math.min(1, Math.max(0, t)));
}

const lerp = (from, to, t) => from + (to - from) * t;
const centre = Object.freeze({x: 0.5, y: 0.5, zoom: 1});

// The camera describes which part of an asset is visible: a focal point (x, y in 0..1 of the asset) and a zoom of at least 1.
export function cameraAt(camera, frame) {
  if (!camera) return {...centre};
  const span = Math.max(1, camera.to_frame - camera.from_frame);
  const t = easeValue(camera.easing, (frame - camera.from_frame) / span);
  return {x: lerp(camera.start.x, camera.end.x, t), y: lerp(camera.start.y, camera.end.y, t), zoom: lerp(camera.start.zoom, camera.end.zoom, t)};
}

// Centres the focal point and clamps so the stage never shows anything outside the asset.
export function viewTransform(stage, state) {
  const zoom = Math.max(1, state.zoom);
  const clamp = (value, size) => Math.min(0, Math.max(size * (1 - zoom), value));
  return {scale: zoom, tx: clamp(stage.width / 2 - state.x * stage.width * zoom, stage.width), ty: clamp(stage.height / 2 - state.y * stage.height * zoom, stage.height)};
}

export function project(stage, view, nx, ny) {
  return {x: view.tx + nx * stage.width * view.scale, y: view.ty + ny * stage.height * view.scale};
}

// Position along a path of {x, y, frame} points: rests at the first and last point and eases between neighbours.
export function pathAt(points, frame) {
  if (frame <= points[0].frame) return {x: points[0].x, y: points[0].y};
  const last = points.at(-1);
  if (frame >= last.frame) return {x: last.x, y: last.y};
  const index = points.findIndex((point, position) => frame >= point.frame && frame < points[position + 1].frame);
  const from = points[index];
  const to = points[index + 1];
  const t = easeValue("ease-in-out", (frame - from.frame) / (to.frame - from.frame));
  return {x: lerp(from.x, to.x, t), y: lerp(from.y, to.y, t)};
}

export function imageDimensions(bytes, mediaType) {
  const fail = () => { throw new TypeError(`Cannot read image dimensions for ${mediaType}`); };
  if (!Buffer.isBuffer(bytes)) fail();
  if (mediaType === "image/png") {
    if (bytes.length < 24 || bytes.toString("latin1", 12, 16) !== "IHDR") fail();
    return {width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20)};
  }
  if (mediaType === "image/gif") {
    if (bytes.length < 10 || !bytes.toString("latin1", 0, 3).startsWith("GIF")) fail();
    return {width: bytes.readUInt16LE(6), height: bytes.readUInt16LE(8)};
  }
  if (mediaType === "image/jpeg") {
    let offset = 2;
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 0xff) { offset += 1; continue; }
      const marker = bytes[offset + 1];
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return {height: bytes.readUInt16BE(offset + 5), width: bytes.readUInt16BE(offset + 7)};
      offset += 2 + bytes.readUInt16BE(offset + 2);
    }
    fail();
  }
  if (mediaType === "image/webp") {
    if (bytes.length < 30 || bytes.toString("latin1", 0, 4) !== "RIFF" || bytes.toString("latin1", 8, 12) !== "WEBP") fail();
    const chunk = bytes.toString("latin1", 12, 16);
    if (chunk === "VP8X") return {width: bytes.readUIntLE(24, 3) + 1, height: bytes.readUIntLE(27, 3) + 1};
    if (chunk === "VP8 ") return {width: bytes.readUInt16LE(26) & 0x3fff, height: bytes.readUInt16LE(28) & 0x3fff};
    if (chunk === "VP8L") { const bits = bytes.readUInt32LE(21); return {width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1}; }
  }
  return fail();
}

export function mixHex(from, to, amount) {
  const channel = (hex, index) => parseInt(hex.slice(1 + index * 2, 3 + index * 2), 16);
  return `#${[0, 1, 2].map((index) => Math.round(channel(from, index) + (channel(to, index) - channel(from, index)) * amount).toString(16).padStart(2, "0")).join("")}`;
}

export function estimateLines(text, fontPx, maxWidth) {
  if (!text) return 0;
  return Math.max(1, Math.ceil((text.length * fontPx * 0.52) / Math.max(1, maxWidth)));
}

// Lays out the text around the visual stage. The step label is a chip above the stage, or a side panel when a phone sits in a wide frame;
// captions sit at the bottom. What remains is the area for the stage.
export function sceneLayout({width, height, padding, bodyPx, subtitlePx, titlePx = bodyPx * 1.6, label, subtitle, panel = false}) {
  const gap = Math.round(padding * 0.5);
  const subtitleWidth = width * 0.82;
  const subtitleHeight = subtitle ? estimateLines(subtitle, subtitlePx, subtitleWidth - subtitlePx * 2) * subtitlePx * 1.35 + subtitlePx : 0;
  const bottomEdge = height - padding - (subtitleHeight ? subtitleHeight + gap : 0);
  const subtitleBox = subtitleHeight ? {bottom: padding, height: subtitleHeight, width: subtitleWidth} : null;
  if (label && panel) {
    const panelWidth = Math.round(width * 0.34);
    const stageLeft = padding + panelWidth + padding;
    return {subtitle: subtitleBox, label: {mode: "panel", left: padding, top: padding, width: panelWidth, height: bottomEdge - padding, fontPx: titlePx}, stage: {left: stageLeft, top: padding, width: width - stageLeft - padding, height: bottomEdge - padding}};
  }
  const chipMax = width - 2 * padding;
  const chipFont = bodyPx * 0.95;
  const chipLines = label ? estimateLines(label, chipFont, chipMax - chipFont * 2.4) : 0;
  const chipHeight = label ? chipLines * chipFont * 1.3 + chipFont * 1.0 : 0;
  const chipWidth = label ? Math.min(chipMax, Math.round(label.length * chipFont * 0.56 + chipFont * 2.6)) : 0;
  const stageTop = padding + (chipHeight ? chipHeight + gap : 0);
  return {
    subtitle: subtitleBox,
    label: label ? {mode: "chip", top: padding, width: chipWidth, height: chipHeight, fontPx: chipFont} : null,
    stage: {left: padding, top: stageTop, width: width - 2 * padding, height: Math.max(height * 0.3, bottomEdge - stageTop)}
  };
}

// Music volume at a frame: fades in and out over the piece and ducks under narration windows ([{from, to}] in frames).
export function musicVolume({frame, total, volume, duck_volume, fade_in_frames, fade_out_frames, windows, ramp = 6}) {
  const fadeIn = fade_in_frames > 0 ? Math.min(1, frame / fade_in_frames) : 1;
  const fadeOut = fade_out_frames > 0 ? Math.min(1, Math.max(0, (total - frame) / fade_out_frames)) : 1;
  let duck = 1;
  for (const window of windows) {
    const into = Math.min(1, Math.max(0, (frame - (window.from - ramp)) / ramp));
    const out = Math.min(1, Math.max(0, (window.to + ramp - frame) / ramp));
    duck = Math.min(duck, 1 - Math.min(into, out) * (1 - duck_volume / volume));
  }
  return Math.max(0, volume * fadeIn * fadeOut * duck);
}

// Black or white, whichever reads better on the given hex background.
export function readableOn(hex) {
  const channel = (index) => { const value = parseInt(hex.slice(1 + index * 2, 3 + index * 2), 16) / 255; return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2) > 0.4 ? "#000000" : "#ffffff";
}

const normalizeText = (value) => value.replace(/\s+/g, " ").trim();

// Groups aligned words into caption phrases (a pause at punctuation, or at most 7 words). Returns null if the words do not spell the narration exactly.
export function captionCues(alignment, narration, fps) {
  if (!Array.isArray(alignment) || alignment.length === 0) return null;
  if (normalizeText(alignment.map(({text}) => text).join(" ")) !== normalizeText(narration)) return null;
  const cues = [];
  let current = [];
  const flush = () => {
    if (current.length === 0) return;
    const from = Math.round(current[0].start_seconds * fps);
    const previousEnd = cues.at(-1)?.to_frame ?? 0;
    const start = Math.max(from, previousEnd);
    cues.push({from_frame: start, to_frame: Math.max(start + 1, Math.round(current.at(-1).end_seconds * fps)), text: current.map(({text}) => text).join(" ")});
    current = [];
  };
  for (const word of alignment) {
    current.push(word);
    if (current.length >= 7 || /[.!?;:,]$/.test(word.text)) flush();
  }
  flush();
  return cues;
}

// The phrase to show at a frame: the latest cue that has started (the first cue before any has).
export function activeCue(cues, frame) {
  let active = cues[0];
  for (const cue of cues) if (frame >= cue.from_frame) active = cue;
  return active;
}

const wordCount = (text) => {
  const trimmed = (text ?? "").trim();
  if (trimmed === "") return 0;
  const words = trimmed.split(/\s+/).length;
  return words === 1 && trimmed.length > 12 ? Math.ceil(trimmed.length / 5) : words;
};

// Non-blocking pacing notes: a scene too short to read its text, or a long scene with little to hear.
export function pacingWarnings({scenes, narrationSeconds = {}}) {
  const warnings = [];
  for (const scene of scenes) {
    const seconds = scene.end_seconds - scene.start_seconds;
    const onScreen = scene.on_screen_text ? 0.8 + wordCount(scene.on_screen_text) / 3.3 : 0;
    const needed = Math.max(onScreen, scene.subtitle && !Object.hasOwn(narrationSeconds, scene.scene_id) ? 0.5 + wordCount(scene.subtitle) / 3.8 : 0);
    if (needed > seconds) warnings.push({scene_id: scene.scene_id, code: "too-short-to-read", scene_seconds: Number(seconds.toFixed(2)), needed_seconds: Number(needed.toFixed(2))});
    if (Object.hasOwn(narrationSeconds, scene.scene_id) && seconds > 4 && narrationSeconds[scene.scene_id] < seconds * 0.35) warnings.push({scene_id: scene.scene_id, code: "mostly-silent", scene_seconds: Number(seconds.toFixed(2)), narration_seconds: Number(narrationSeconds[scene.scene_id].toFixed(2))});
  }
  return warnings;
}
