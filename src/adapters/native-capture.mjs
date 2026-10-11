import {execFile} from "node:child_process";
import {createHash} from "node:crypto";
import {mkdtemp, readFile, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {resolve} from "node:path";
import {promisify} from "node:util";
import {createEvidenceRecord} from "../agency/evidence.mjs";
import {storeCaptureBytes} from "../core/captures.mjs";
import {stableId} from "../core/ids.mjs";

const execFileAsync = promisify(execFile);
const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const androidPackage = /^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)+$/;
const iosBundle = /^[A-Za-z0-9][A-Za-z0-9.-]*$/;
const androidSerial = /^[A-Za-z0-9._:-]{1,64}$/;
const simulatorId = /^([A-Fa-f0-9-]{36}|booted)$/;
const typeable = /^[A-Za-z0-9 ._@:/+-]{1,200}$/;
const keys = new Map([["BACK", "KEYCODE_BACK"], ["ENTER", "KEYCODE_ENTER"], ["TAB", "KEYCODE_TAB"], ["DOWN", "KEYCODE_DPAD_DOWN"]]);
const androidActions = new Set(["launch", "tap_text", "tap", "type", "key", "wait_text"]);
const iosActions = new Set(["launch", "open_url", "wait"]);

export class NativeCaptureUnavailableError extends Error {
  constructor(message = "The native capture tooling or device is unavailable.") {
    super(message);
    this.name = "NativeCaptureUnavailableError";
    this.code = "native_capture_unavailable";
  }
}

// Messages here are fixed strings: tool output and typed values are never persisted.
class NativeExecutionError extends Error {}

const wait = (milliseconds) => new Promise((done) => setTimeout(done, milliseconds));

async function run(command, args, {timeout = 15000, binary = false} = {}) {
  const {stdout} = await execFileAsync(command, args, {timeout, maxBuffer: 64 * 1024 * 1024, encoding: binary ? "buffer" : "utf8"});
  return stdout;
}

function text(value, label) {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > 200 || /[\u0000-\u001f]/.test(value)) throw new TypeError(`${label} must be a short single-line string`);
  return value;
}

function checkCommon({projectId, platform, role, demoDataId, journey, flags, allowedClaims, actionTimeoutMs}) {
  if (typeof projectId !== "string" || projectId.length === 0) throw new TypeError("projectId is required");
  if (!["android", "ios"].includes(platform)) throw new TypeError("platform must be android or ios");
  if (typeof role !== "string" || role.length === 0) throw new TypeError("role is required");
  if (typeof demoDataId !== "string" || demoDataId.length === 0) throw new TypeError("demoDataId is required and must identify the non-secret demo dataset");
  if (!Array.isArray(flags) || !Array.isArray(allowedClaims)) throw new TypeError("flags and allowedClaims must be arrays");
  if (!Number.isInteger(actionTimeoutMs) || actionTimeoutMs < 1) throw new TypeError("actionTimeoutMs must be a positive integer");
  if (!journey || typeof journey.id !== "string" || journey.id.length === 0 || typeof journey.name !== "string" || journey.name.length === 0) throw new TypeError("journey needs non-empty id and name");
  if (!Array.isArray(journey.steps) || journey.steps.length === 0) throw new TypeError("journey.steps must be a non-empty array");
  if (journey.steps[0]?.action !== "launch") throw new TypeError("journey.steps must begin with launch");
}

function checkAndroid({app, device, journey, role}) {
  if (!androidPackage.test(app?.id ?? "")) throw new TypeError("app.id must be an Android package name");
  if (!androidSerial.test(device?.serial ?? "")) throw new TypeError("device.serial is invalid");
  for (const [index, step] of journey.steps.entries()) {
    if (!step || !androidActions.has(step.action)) throw new TypeError(`Unsupported native capture action: ${step?.action}`);
    if (step.action === "launch" && index !== 0) throw new TypeError("launch is only allowed as the first step");
    if (["tap_text", "wait_text"].includes(step.action)) text(step.text, `${step.action}.text`);
    if (step.action === "tap" && !(Number.isInteger(step.x) && Number.isInteger(step.y) && step.x >= 0 && step.y >= 0 && step.x <= 10000 && step.y <= 10000)) throw new TypeError("tap needs integer x and y");
    if (step.action === "type" && !typeable.test(step.text ?? "")) throw new TypeError("type text may only contain letters, digits, spaces and . _ @ : / + -");
    if (step.action === "key" && !keys.has(step.key)) throw new TypeError(`key must be one of ${[...keys.keys()].join(", ")}`);
  }
  if (!journey.role_assertion || journey.role_assertion.role !== role) throw new TypeError("journey.role_assertion must bind the configured role");
  text(journey.role_assertion.text, "role_assertion.text");
  text(journey.verify?.text, "verify.text");
}

function checkIos({app, device, journey}) {
  if (!iosBundle.test(app?.id ?? "")) throw new TypeError("app.id must be an iOS bundle identifier");
  if (!simulatorId.test(device?.udid ?? "")) throw new TypeError("device.udid must be a simulator UDID or booted");
  const schemes = app.url_schemes ?? [];
  if (!Array.isArray(schemes) || schemes.some((scheme) => !/^[a-z][a-z0-9+.-]*$/.test(scheme))) throw new TypeError("app.url_schemes must list URL schemes");
  for (const [index, step] of journey.steps.entries()) {
    if (!step || !iosActions.has(step.action)) throw new TypeError(`Unsupported native capture action: ${step?.action}`);
    if (step.action === "launch" && index !== 0) throw new TypeError("launch is only allowed as the first step");
    if (step.action === "wait" && !(Number.isFinite(step.seconds) && step.seconds >= 0 && step.seconds <= 10)) throw new TypeError("wait needs seconds between 0 and 10");
    if (step.action === "open_url") {
      let url;
      try { url = new URL(step.url); } catch { throw new TypeError("open_url needs a valid URL"); }
      if (!schemes.includes(url.protocol.slice(0, -1))) throw new TypeError(`open_url scheme ${url.protocol} is not declared in app.url_schemes`);
      if (step.url.length > 2000 || /\s/.test(step.url)) throw new TypeError("open_url URL is invalid");
    }
  }
  if (journey.verify !== undefined || journey.role_assertion !== undefined) throw new TypeError("An iOS simulator capture cannot assert visible results: remove verify and role_assertion, or supply an observer adapter");
}

function parseHierarchy(xml) {
  const nodes = [];
  for (const [tag] of xml.matchAll(/<node\b[^>]*>/g)) {
    const attributes = Object.fromEntries([...tag.matchAll(/([\w-]+)="([^"]*)"/g)].map(([, name, value]) => [name, value.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")]));
    const bounds = /^\[(\d+),(\d+)\]\[(\d+),(\d+)\]$/.exec(attributes.bounds ?? "");
    if (bounds) nodes.push({text: (attributes.text ?? "").trim(), description: (attributes["content-desc"] ?? "").trim(), bounds: bounds.slice(1).map(Number)});
  }
  return nodes;
}

function android({adbPath, serial, timeout}) {
  const adb = (args, options) => run(adbPath, ["-s", serial, ...args], {timeout, ...options});
  const dump = async () => parseHierarchy(await adb(["exec-out", "uiautomator", "dump", "/dev/tty"]));
  const find = (nodes, label) => nodes.find((node) => node.text === label || node.description === label);
  return {
    async ready() { if ((await adb(["get-state"])).trim() !== "device") throw new NativeExecutionError("The Android device is not ready."); },
    async info() {
      const model = await adb(["shell", "getprop", "ro.product.model"]);
      const release = await adb(["shell", "getprop", "ro.build.version.release"]);
      const size = await adb(["shell", "wm", "size"]);
      return {description: `${model.trim()}, Android ${release.trim()}, ${/(\d+x\d+)/.exec(size)?.[1] ?? "unknown size"} (${serial})`, facts: {model: model.trim(), os: release.trim(), size: /(\d+x\d+)/.exec(size)?.[1] ?? null}};
    },
    async launch(app) { await adb(["shell", "monkey", "-p", app, "-c", "android.intent.category.LAUNCHER", "1"]); await this.assertForeground(app); },
    async assertForeground(app) {
      const deadline = Date.now() + timeout;
      do {
        if ((await adb(["shell", "dumpsys", "window"])).includes(`${app}/`)) return;
        await wait(200);
      } while (Date.now() < deadline);
      throw new NativeExecutionError("The application is not in the foreground.");
    },
    async waitText(label) {
      const deadline = Date.now() + timeout;
      do {
        const node = find(await dump(), label);
        if (node) return node;
        await wait(250);
      } while (Date.now() < deadline);
      throw new NativeExecutionError("Expected visible text did not appear.");
    },
    async tapText(label) { const {bounds} = await this.waitText(label); await this.tap(Math.round((bounds[0] + bounds[2]) / 2), Math.round((bounds[1] + bounds[3]) / 2)); },
    async tap(x, y) { await adb(["shell", "input", "tap", String(x), String(y)]); },
    async type(value) { await adb(["shell", "input", "text", value.replace(/ /g, "%s")]); },
    async key(name) { await adb(["shell", "input", "keyevent", keys.get(name)]); },
    async screenshot() {
      const bytes = await adb(["exec-out", "screencap", "-p"], {binary: true});
      if (!Buffer.isBuffer(bytes) || bytes.length < 8 || !bytes.subarray(0, 8).equals(pngSignature)) throw new NativeExecutionError("The device did not return a PNG screenshot.");
      return bytes;
    }
  };
}

function ios({xcrunPath, udid, timeout}) {
  const simctl = (args, options) => run(xcrunPath, ["simctl", ...args], {timeout, ...options});
  return {
    async ready() { await simctl(["list", "devices", "-j"]); },
    async info() {
      const listing = JSON.parse(await simctl(["list", "devices", "-j"]));
      for (const [runtime, devices] of Object.entries(listing.devices ?? {})) {
        const match = devices.find((device) => (udid === "booted" ? device.state === "Booted" : device.udid === udid));
        if (match) { const version = runtime.split(".").at(-1); return {description: `${match.name}, ${version} (${match.udid})`, facts: {model: match.name, os: version, size: null}}; }
      }
      throw new NativeExecutionError("The simulator was not found.");
    },
    async launch(app) { await simctl(["launch", udid, app]); },
    async openUrl(url) { await simctl(["openurl", udid, url]); },
    async screenshot() {
      const directory = await mkdtemp(resolve(tmpdir(), "keelokit-simctl-"));
      try {
        const file = resolve(directory, "screen.png");
        await simctl(["io", udid, "screenshot", "--type=png", file]);
        const bytes = await readFile(file);
        if (bytes.length < 8 || !bytes.subarray(0, 8).equals(pngSignature)) throw new NativeExecutionError("The simulator did not return a PNG screenshot.");
        return bytes;
      } finally { await rm(directory, {recursive: true, force: true}); }
    }
  };
}

export async function nativeCaptureCapability({platform, adbPath = "adb", xcrunPath = "xcrun", serial, udid, timeoutMs = 5000}) {
  const base = platform === "android" ? {surface: "native", adapter: "adb-android", repeatable: true, verifies_results: true} : {surface: "native", adapter: "simctl-ios", repeatable: true, verifies_results: false};
  if (!["android", "ios"].includes(platform)) throw new TypeError("platform must be android or ios");
  try {
    if (platform === "android") { if (!androidSerial.test(serial ?? "")) throw new Error("serial"); await android({adbPath, serial, timeout: timeoutMs}).ready(); }
    else { if (!simulatorId.test(udid ?? "")) throw new Error("udid"); await ios({xcrunPath, udid, timeout: timeoutMs}).ready(); }
    return {...base, status: "available"};
  } catch {
    return {...base, status: "blocked", code: "native_capture_unavailable"};
  }
}

export async function captureNativeJourney({projectRoot, projectId, platform, device, app, build, commit = null, locale, role, demoDataId, flags = [], journey, availability = "available", actionTimeoutMs = 10000, outputDirectory = "media/studio/captures", allowedClaims = [], tools = {}}) {
  checkCommon({projectId, platform, role, demoDataId, journey, flags, allowedClaims, actionTimeoutMs});
  if (typeof build !== "string" || build.length === 0 || typeof locale !== "string" || locale.length === 0) throw new TypeError("build and locale are required");
  if (platform === "android") checkAndroid({app, device, journey, role}); else checkIos({app, device, journey});
  if (platform === "ios" && allowedClaims.length > 0) throw new TypeError("An iOS simulator capture is screenshot-only and cannot back claims");

  const adapter = platform === "android" ? "adb-android" : "simctl-ios";
  const verification = platform === "android" ? "live-capture" : "screenshot-only";
  const redactedSteps = journey.steps.map((step) => step.action === "type" ? {...step, text: "[text-not-hashed]"} : step.action === "open_url" ? {...step, url: (({protocol, host, pathname}) => `${protocol}//${host}${pathname}`)(new URL(step.url))} : step);
  const procedureHash = stableId("procedure", {platform, app: app.id, journey: {...journey, steps: redactedSteps}});
  const captureId = stableId("capture", {projectId, procedureHash, role, build, commit, locale, flags: [...flags].sort(), demoDataId});
  const contextFor = (facts) => `capture-context:${createHash("sha256").update(JSON.stringify({platform, app: app.id, build, commit, procedureHash, role, locale, flags: [...flags].sort(), demoDataId, device: facts})).digest("hex")}`;

  if (availability !== "available") {
    const evidence = createEvidenceRecord({projectId, featureOrJourney: journey.name, procedureHash, surface: "native", adapter, verification: "configured-unavailable", role, availability, flags, build, commit, locale, steps: ["Capture skipped because the configured feature state is unavailable"], result: `Feature ${availability}; no native journey was represented as successful.`, hashes: [contextFor(null)], allowedClaims: []});
    return {status: "blocked", adapter, evidence, captures: []};
  }

  const driver = platform === "android" ? android({adbPath: tools.adbPath ?? "adb", serial: device.serial, timeout: actionTimeoutMs}) : ios({xcrunPath: tools.xcrunPath ?? "xcrun", udid: device.udid, timeout: actionTimeoutMs});
  const completed = [];
  let facts = null;
  const failure = async (message) => {
    const captures = [];
    const hashes = [contextFor(facts)];
    try {
      const stored = await storeCaptureBytes({projectRoot, outputDirectory, captureId, suffix: "-failed", content: await driver.screenshot()});
      captures.push(stored.path); hashes.push(stored.hash);
    } catch {}
    const evidence = createEvidenceRecord({projectId, featureOrJourney: journey.name, procedureHash, surface: "native", adapter, verification, role, availability: "failed", flags, build, commit, locale, steps: completed.length > 0 ? completed : ["Native journey failed before its first step"], result: message, capturePaths: captures, hashes, allowedClaims: []});
    return {status: "failed", adapter, evidence, captures};
  };

  try {
    await driver.ready();
    const info = await driver.info();
    facts = info.facts;
    completed.push(`Device: ${info.description}; application ${app.id}; build ${build}`);
  } catch {
    return failure("The native device or tooling was unavailable.");
  }

  try {
    for (const [index, step] of journey.steps.entries()) {
      try {
        if (step.action === "launch") await driver.launch(app.id);
        else if (step.action === "tap_text") await driver.tapText(step.text);
        else if (step.action === "tap") await driver.tap(step.x, step.y);
        else if (step.action === "type") await driver.type(step.text);
        else if (step.action === "key") await driver.key(step.key);
        else if (step.action === "wait_text") await driver.waitText(step.text);
        else if (step.action === "open_url") await driver.openUrl(step.url);
        else if (step.action === "wait") await wait(step.seconds * 1000);
      } catch (error) {
        if (error instanceof NativeExecutionError) throw error;
        throw new NativeExecutionError(`Journey step ${index + 1} (${step.action}) failed.`);
      }
      completed.push(step.action === "type" ? `Completed step ${index + 1} (type: text not recorded)` : step.action === "open_url" ? `Completed step ${index + 1} (open_url: deep link opened)` : `Completed step ${index + 1} (${step.action})`);
    }
    let observed = "Simulator screenshot taken after the journey; the on-screen outcome was not asserted.";
    if (platform === "android") {
      try { await driver.waitText(journey.role_assertion.text); } catch { throw new NativeExecutionError("The active application role did not match the configured capture role."); }
      completed.push(`Verified capture role ${role} at the end`);
      try { await driver.waitText(journey.verify.text); } catch { throw new NativeExecutionError("The observed result did not match the journey verification."); }
      await driver.assertForeground(app.id);
      observed = `Visible text confirmed: ${journey.verify.text}`;
    }
    const capture = await storeCaptureBytes({projectRoot, outputDirectory, captureId, content: await driver.screenshot()});
    const evidence = createEvidenceRecord({projectId, featureOrJourney: journey.name, procedureHash, surface: "native", adapter, verification, role, availability: "available", flags, build, commit, locale, steps: completed, result: observed, capturePaths: [capture.path], hashes: [contextFor(facts), capture.hash], allowedClaims: platform === "android" ? allowedClaims : []});
    return {status: "captured", adapter, evidence, captures: [capture.path]};
  } catch (error) {
    return failure(error instanceof NativeExecutionError ? error.message : "The native journey failed without a verified result.");
  }
}
