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
