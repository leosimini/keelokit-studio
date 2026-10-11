#!/usr/bin/env node
// Runs one native capture, or checks that the tooling and device are reachable.
//   studio-capture-native.mjs --project-root <dir> --request <request.json>
//   studio-capture-native.mjs --capability android --serial emulator-5554 [--adb /path/to/adb]
//   studio-capture-native.mjs --capability ios --udid booted [--xcrun /path/to/xcrun]
import {readFile} from "node:fs/promises";
import {resolve} from "node:path";
await import("./require-deps.mjs");
const {captureNativeJourney, nativeCaptureCapability} = await import("../src/adapters/native-capture.mjs");

const supported = new Set(["--project-root", "--request", "--capability", "--serial", "--udid", "--adb", "--xcrun"]);
const options = {};
const argv = process.argv.slice(2);
try {
  for (let index = 0; index < argv.length; index += 2) {
    if (!supported.has(argv[index]) || argv[index + 1] === undefined || argv[index + 1].startsWith("--")) throw new TypeError(`Invalid option: ${argv[index] ?? "<missing>"}`);
    options[argv[index]] = argv[index + 1];
  }
  if (options["--capability"]) {
    const result = await nativeCaptureCapability({platform: options["--capability"], serial: options["--serial"], udid: options["--udid"], adbPath: options["--adb"], xcrunPath: options["--xcrun"]});
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = result.status === "available" ? 0 : 1;
  } else {
    if (!options["--request"]) throw new TypeError("Provide --request <file> (or --capability <android|ios>)");
    const request = JSON.parse(await readFile(resolve(options["--request"]), "utf8"));
    const result = await captureNativeJourney({...request, projectRoot: resolve(options["--project-root"] ?? process.cwd())});
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = result.status === "captured" ? 0 : 1;
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 2;
}
