import assert from "node:assert/strict";
import {mkdtemp, readFile, rm, stat, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {resolve} from "node:path";
import test from "node:test";
import {captureNativeJourney, nativeCaptureCapability} from "../src/adapters/native-capture.mjs";
import {evaluateEvidenceRequest} from "../src/agency/evidence.mjs";

const adb = resolve("tests/support/fake-adb.mjs");
const xcrun = resolve("tests/support/fake-xcrun.mjs");
const udid = "0F5E5A3C-1111-4222-8333-444455556666";

const screens = [
  {nodes: [{text: "Sign in", bounds: [100, 1000, 500, 1100], next: true}]},
  {nodes: [{text: "Admin", bounds: [0, 0, 200, 80]}, {text: "Dashboard", bounds: [0, 100, 400, 200]}]}
];

async function withDevice(run, overrides = {}) {
  const directory = await mkdtemp(resolve(tmpdir(), "keelokit-native-"));
  const statePath = resolve(directory, "device.json");
  await writeFile(statePath, JSON.stringify({screens, index: 0, focus: "", log: [], udid, ...overrides}));
  const previous = process.env.FAKE_DEVICE_STATE;
  process.env.FAKE_DEVICE_STATE = statePath;
  try {
    await run({directory, state: async () => JSON.parse(await readFile(statePath, "utf8"))});
  } finally {
    if (previous === undefined) delete process.env.FAKE_DEVICE_STATE; else process.env.FAKE_DEVICE_STATE = previous;
    await rm(directory, {recursive: true, force: true});
  }
}

const androidJourney = () => ({
  id: "sign-in",
  name: "Sign in as an admin",
  steps: [{action: "launch"}, {action: "tap_text", text: "Sign in"}, {action: "type", text: "hunter2"}, {action: "key", key: "ENTER"}],
  role_assertion: {role: "admin", text: "Admin"},
  verify: {text: "Dashboard"}
});

const androidOptions = (projectRoot, overrides = {}) => ({
  projectRoot, projectId: "mobile-demo", platform: "android", device: {serial: "emulator-5554"}, app: {id: "com.example.app"},
  build: "1.2.0 (42)", commit: null, locale: "en-US", role: "admin", demoDataId: "demo-seed-1", journey: androidJourney(),
  tools: {adbPath: adb}, actionTimeoutMs: 1500, allowedClaims: ["Admins see the dashboard after signing in."], ...overrides
});

test("reports native capability from the tools actually present", async () => {
  await withDevice(async () => {
    const android = await nativeCaptureCapability({platform: "android", adbPath: adb, serial: "emulator-5554"});
    assert.deepEqual([android.surface, android.adapter, android.status, android.verifies_results], ["native", "adb-android", "available", true]);
    assert.equal((await nativeCaptureCapability({platform: "android", adbPath: "/does/not/exist", serial: "emulator-5554"})).status, "blocked");
    const ios = await nativeCaptureCapability({platform: "ios", xcrunPath: xcrun, udid});
    assert.deepEqual([ios.adapter, ios.status, ios.verifies_results], ["simctl-ios", "available", false]);
    assert.equal((await nativeCaptureCapability({platform: "ios", xcrunPath: "/does/not/exist", udid})).status, "blocked");
  });
});

test("captures a verified Android journey with device context and never persists typed text", async () => {
  await withDevice(async ({state}) => {
    const projectRoot = await mkdtemp(resolve(tmpdir(), "keelokit-native-project-"));
    try {
      const result = await captureNativeJourney(androidOptions(projectRoot));
      assert.equal(result.status, "captured");
      const {evidence} = result;
      assert.deepEqual([evidence.surface, evidence.adapter, evidence.verification, evidence.availability, evidence.role, evidence.locale], ["native", "adb-android", "live-capture", "available", "admin", "en-US"]);
      assert.match(evidence.steps[0], /Pixel 7.*Android 14.*1080x2400.*emulator-5554/);
      assert.deepEqual(evidence.allowed_claims, ["Admins see the dashboard after signing in."]);
      assert.equal(result.captures.length, 1);
      assert.ok((await stat(resolve(projectRoot, result.captures[0]))).size > 0);
      assert.equal(JSON.stringify(result).includes("hunter2"), false);
      const device = await state();
      assert.ok(device.log.includes("shell input text hunter2"), "the typed text reached the device");
      assert.ok(device.log.some((line) => line.startsWith("shell input tap 300 1050")), "tap_text tapped the centre of the matching node");
      const again = await captureNativeJourney(androidOptions(projectRoot, {journey: {...androidJourney(), steps: androidJourney().steps.map((step) => step.action === "type" ? {...step, text: "different"} : step)}}));
      assert.equal(again.evidence.procedure_hash, evidence.procedure_hash, "typed text must not change or leak into the procedure hash");
      const target = {feature_or_journey: "Sign in as an admin", surface: "native", role: "admin", build: "1.2.0 (42)", locale: "en-US", flags: [], availability: "available"};
      const checked = evaluateEvidenceRequest({document: {schema_version: 1, project_id: "mobile-demo", evidence: [evidence]}, evidenceIds: [evidence.evidence_id], claims: [{claim: evidence.allowed_claims[0], evidence_id: evidence.evidence_id}], target});
      assert.deepEqual(checked.blockers, []);
    } finally {
      await rm(projectRoot, {recursive: true, force: true});
    }
  });
});

test("records a failed journey without claims when the result, role, foreground app or device is wrong", async () => {
  const projectRoot = await mkdtemp(resolve(tmpdir(), "keelokit-native-project-"));
  try {
    await withDevice(async () => {
      const wrongResult = await captureNativeJourney(androidOptions(projectRoot, {journey: {...androidJourney(), verify: {text: "Receipts"}}}));
      assert.equal(wrongResult.status, "failed");
      assert.equal(wrongResult.evidence.availability, "failed");
      assert.deepEqual(wrongResult.evidence.allowed_claims, []);
      const wrongRole = await captureNativeJourney(androidOptions(projectRoot, {journey: {...androidJourney(), role_assertion: {role: "admin", text: "Owner"}}}));
      assert.equal(wrongRole.status, "failed");
      assert.match(wrongRole.evidence.result, /role/i);
    });
    await withDevice(async () => {
      const offline = await captureNativeJourney(androidOptions(projectRoot));
      assert.equal(offline.status, "failed");
      assert.deepEqual(offline.evidence.allowed_claims, []);
      assert.doesNotMatch(JSON.stringify(offline), /device offline/);
    }, {fail: "get-state"});
    await withDevice(async () => {
      const blocked = await captureNativeJourney(androidOptions(projectRoot, {availability: "disabled"}));
      assert.equal(blocked.status, "blocked");
      assert.deepEqual(blocked.captures, []);
    });
  } finally {
    await rm(projectRoot, {recursive: true, force: true});
  }
});

test("rejects unsafe identifiers, input and malformed journeys before touching a device", async () => {
  await withDevice(async ({state}) => {
    const projectRoot = await mkdtemp(resolve(tmpdir(), "keelokit-native-project-"));
    try {
      const reject = (overrides, pattern) => assert.rejects(() => captureNativeJourney(androidOptions(projectRoot, overrides)), pattern);
      await reject({app: {id: "com.example.app; rm -rf /"}}, /package/i);
      await reject({device: {serial: "emulator-5554; reboot"}}, /serial/i);
      await reject({journey: {...androidJourney(), steps: [{action: "tap_text", text: "Sign in"}]}}, /begin with launch/);
      await reject({journey: {...androidJourney(), steps: [{action: "launch"}, {action: "type", text: "a; reboot"}]}}, /type/i);
      await reject({journey: {...androidJourney(), steps: [{action: "launch"}, {action: "type", text: "$(reboot)"}]}}, /type/i);
      await reject({journey: {...androidJourney(), steps: [{action: "launch"}, {action: "key", key: "POWER"}]}}, /key/i);
      await reject({journey: {...androidJourney(), steps: [{action: "launch"}, {action: "shell", text: "reboot"}]}}, /Unsupported native capture action/);
      await reject({journey: {...androidJourney(), role_assertion: {role: "viewer", text: "Admin"}}}, /role_assertion/);
      await reject({demoDataId: ""}, /demoDataId/);
      assert.deepEqual((await state()).log, [], "nothing reached the device");
    } finally {
      await rm(projectRoot, {recursive: true, force: true});
    }
  });
});

test("iOS simulator captures are screenshot-only: launched and navigated, never asserted, never backing claims", async () => {
  await withDevice(async ({state}) => {
    const projectRoot = await mkdtemp(resolve(tmpdir(), "keelokit-native-project-"));
    try {
      const options = {
        projectRoot, projectId: "mobile-demo", platform: "ios", device: {udid}, app: {id: "com.example.App", url_schemes: ["exampleapp"]},
        build: "1.2.0 (42)", locale: "en-US", role: "admin", demoDataId: "demo-seed-1", tools: {xcrunPath: xcrun}, actionTimeoutMs: 1500,
        journey: {id: "open-settings", name: "Open settings", steps: [{action: "launch"}, {action: "open_url", url: "exampleapp://settings?token=SECRET123"}, {action: "wait", seconds: 0.1}]}
      };
      const result = await captureNativeJourney(options);
      assert.equal(result.status, "captured");
      assert.deepEqual([result.evidence.adapter, result.evidence.verification, result.evidence.allowed_claims], ["simctl-ios", "screenshot-only", []]);
      assert.match(result.evidence.steps[0], /iPhone 15.*iOS-17-5|iOS 17\.5/);
      assert.equal(JSON.stringify(result).includes("SECRET123"), false);
      assert.ok((await state()).log.some((line) => line.startsWith("simctl openurl")));
      await assert.rejects(() => captureNativeJourney({...options, allowedClaims: ["Settings open."]}), /screenshot-only|cannot back claims/);
      await assert.rejects(() => captureNativeJourney({...options, journey: {...options.journey, steps: [{action: "launch"}, {action: "open_url", url: "https://example.com"}]}}), /scheme/);
      await assert.rejects(() => captureNativeJourney({...options, journey: {...options.journey, verify: {text: "Settings"}}}), /cannot assert/);
    } finally {
      await rm(projectRoot, {recursive: true, force: true});
    }
  });
});

test("the command line runs a capture from a request file and reports capability", async () => {
  const {spawnSync} = await import("node:child_process");
  await withDevice(async ({directory}) => {
    const projectRoot = await mkdtemp(resolve(tmpdir(), "keelokit-native-project-"));
    try {
      const { projectRoot: ignored, ...request } = androidOptions(projectRoot);
      await writeFile(resolve(directory, "request.json"), JSON.stringify(request));
      const captured = spawnSync(process.execPath, ["--no-warnings", "scripts/studio-capture-native.mjs", "--project-root", projectRoot, "--request", resolve(directory, "request.json")], {encoding: "utf8"});
      assert.equal(captured.status, 0, captured.stderr);
      assert.equal(JSON.parse(captured.stdout).status, "captured");
      const capability = spawnSync(process.execPath, ["--no-warnings", "scripts/studio-capture-native.mjs", "--capability", "android", "--serial", "emulator-5554", "--adb", adb], {encoding: "utf8"});
      assert.equal(JSON.parse(capability.stdout).status, "available");
      const missing = spawnSync(process.execPath, ["--no-warnings", "scripts/studio-capture-native.mjs", "--capability", "android", "--serial", "emulator-5554", "--adb", "/does/not/exist"], {encoding: "utf8"});
      assert.equal(missing.status, 1);
      assert.equal(spawnSync(process.execPath, ["--no-warnings", "scripts/studio-capture-native.mjs", "--bogus", "x"], {encoding: "utf8"}).status, 2);
    } finally {
      await rm(projectRoot, {recursive: true, force: true});
    }
  });
});
