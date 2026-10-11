import {deflateSync, inflateSync} from "node:zlib";

const crcTable = Array.from({length: 256}, (_, n) => { let c = n; for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (buffer) => { let c = 0xffffffff; for (const byte of buffer) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => { const out = Buffer.alloc(12 + data.length); out.writeUInt32BE(data.length, 0); out.write(type, 4, "latin1"); data.copy(out, 8); out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length); return out; };

// Encodes an RGB image; `pixel(x, y)` returns [r, g, b].
export function encodePng(width, height, pixel) {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) { const [r, g, b] = pixel(x, y); const at = y * (width * 3 + 1) + 1 + x * 3; raw[at] = r; raw[at + 1] = g; raw[at + 2] = b; }
  const header = Buffer.alloc(13); header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 2;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", header), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

// Decodes 8-bit RGB/RGBA non-interlaced PNGs into {width, height, at(x, y) -> [r, g, b]}.
export function decodePng(bytes) {
  let offset = 8; let header; const data = [];
  while (offset < bytes.length) {
    const length = bytes.readUInt32BE(offset); const type = bytes.toString("latin1", offset + 4, offset + 8);
    if (type === "IHDR") header = bytes.subarray(offset + 8, offset + 8 + length);
    if (type === "IDAT") data.push(bytes.subarray(offset + 8, offset + 8 + length));
    offset += 12 + length;
  }
  const width = header.readUInt32BE(0); const height = header.readUInt32BE(4); const channels = header[9] === 6 ? 4 : 3;
  if (header[8] !== 8 || ![2, 6].includes(header[9]) || header[12] !== 0) throw new Error("Unsupported PNG layout");
  const raw = inflateSync(Buffer.concat(data)); const stride = width * channels; const pixels = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)];
    for (let x = 0; x < stride; x += 1) {
      const value = raw[y * (stride + 1) + 1 + x];
      const left = x >= channels ? pixels[y * stride + x - channels] : 0; const up = y > 0 ? pixels[(y - 1) * stride + x] : 0; const upLeft = x >= channels && y > 0 ? pixels[(y - 1) * stride + x - channels] : 0;
      const predictor = [0, left, up, (left + up) >> 1, (() => { const p = left + up - upLeft; const pa = Math.abs(p - left); const pb = Math.abs(p - up); const pc = Math.abs(p - upLeft); return pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft; })()][filter];
      pixels[y * stride + x] = (value + predictor) & 0xff;
    }
  }
  return {width, height, at: (x, y) => [pixels[y * stride + x * channels], pixels[y * stride + x * channels + 1], pixels[y * stride + x * channels + 2]]};
}
