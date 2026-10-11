import assert from "node:assert/strict";
import test from "node:test";
import {cameraAt, easeValue, fitRect, imageDimensions, pathAt, project, viewTransform} from "../src/render/geometry.mjs";

const approx = (actual, expected, epsilon = 1e-6) => assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} !~ ${expected}`);

test("fits an asset inside a box without distortion", () => {
  assert.deepEqual(fitRect({width: 1000, height: 500}, {width: 1920, height: 1080}), {width: 888.8888888888889, height: 500});
  assert.deepEqual(fitRect({width: 400, height: 1000}, {width: 1000, height: 1000}), {width: 400, height: 400});
});

test("easing is anchored at 0 and 1 and monotonic", () => {
  for (const name of ["linear", "ease-in-out", "ease-out"]) {
    approx(easeValue(name, 0), 0); approx(easeValue(name, 1), 1);
    let previous = -1;
    for (let step = 0; step <= 20; step += 1) { const value = easeValue(name, step / 20); assert.ok(value >= previous); previous = value; }
  }
  assert.throws(() => easeValue("bounce", 0.5), /easing/);
});

test("the camera holds before its movement, moves between from_frame and to_frame, then holds", () => {
  const camera = {start: {x: 0.5, y: 0.5, zoom: 1}, end: {x: 0.25, y: 0.25, zoom: 3}, from_frame: 10, to_frame: 30, easing: "linear"};
  assert.deepEqual(cameraAt(camera, 0), {x: 0.5, y: 0.5, zoom: 1});
  assert.deepEqual(cameraAt(camera, 10), {x: 0.5, y: 0.5, zoom: 1});
  const middle = cameraAt(camera, 20);
  approx(middle.x, 0.375); approx(middle.zoom, 2);
  assert.deepEqual(cameraAt(camera, 30), {x: 0.25, y: 0.25, zoom: 3});
  assert.deepEqual(cameraAt(camera, 999), {x: 0.25, y: 0.25, zoom: 3});
  assert.deepEqual(cameraAt(null, 5), {x: 0.5, y: 0.5, zoom: 1});
});

test("the view centres the focal point and never shows beyond the asset", () => {
  const stage = {width: 800, height: 400};
  const centred = viewTransform(stage, {x: 0.5, y: 0.5, zoom: 2});
  approx(centred.tx, -400); approx(centred.ty, -200);
  const corner = viewTransform(stage, {x: 0, y: 0, zoom: 2});
  approx(corner.tx, 0); approx(corner.ty, 0);
  const far = viewTransform(stage, {x: 1, y: 1, zoom: 2});
  approx(far.tx, -800); approx(far.ty, -400);
  const identity = viewTransform(stage, {x: 0.2, y: 0.9, zoom: 1});
  approx(identity.tx, 0); approx(identity.ty, 0);
  const point = project(stage, viewTransform(stage, {x: 0.5, y: 0.5, zoom: 2}), 0.5, 0.5);
  approx(point.x, 400); approx(point.y, 200);
});

test("a cursor path interpolates between its points and rests at the ends", () => {
  const points = [{x: 0.1, y: 0.1, frame: 10}, {x: 0.5, y: 0.5, frame: 30}, {x: 0.9, y: 0.1, frame: 50}];
  assert.deepEqual(pathAt(points, 0), {x: 0.1, y: 0.1});
  assert.deepEqual(pathAt(points, 99), {x: 0.9, y: 0.1});
  const middle = pathAt(points, 20);
  assert.ok(middle.x > 0.1 && middle.x < 0.5);
  approx(pathAt(points, 30).x, 0.5);
});

test("reads image dimensions from PNG, JPEG, GIF and WebP headers", () => {
  const png = Buffer.alloc(33); Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(png); png.write("IHDR", 12); png.writeUInt32BE(640, 16); png.writeUInt32BE(360, 20);
  assert.deepEqual(imageDimensions(png, "image/png"), {width: 640, height: 360});
  const gif = Buffer.alloc(13); gif.write("GIF89a"); gif.writeUInt16LE(320, 6); gif.writeUInt16LE(200, 8);
  assert.deepEqual(imageDimensions(gif, "image/gif"), {width: 320, height: 200});
  const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x0b, 0x08]), Buffer.from([0x01, 0xe0, 0x02, 0x80]), Buffer.from([0x01, 0x01, 0x11, 0x00])]);
  assert.deepEqual(imageDimensions(jpeg, "image/jpeg"), {width: 640, height: 480});
  const webp = Buffer.alloc(30); webp.write("RIFF", 0); webp.write("WEBP", 8); webp.write("VP8X", 12); webp.writeUIntLE(799, 24, 3); webp.writeUIntLE(449, 27, 3);
  assert.deepEqual(imageDimensions(webp, "image/webp"), {width: 800, height: 450});
  assert.throws(() => imageDimensions(Buffer.from("junk"), "image/png"), /dimensions/);
});
