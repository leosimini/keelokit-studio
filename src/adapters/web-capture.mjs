import {createHash} from "node:crypto";
import {chromium} from "playwright";
import {createEvidenceRecord} from "../agency/evidence.mjs";
import {stableId} from "../core/ids.mjs";
import {storeCaptureBytes} from "../core/captures.mjs";

const actions = new Set(["goto", "click", "fill", "select", "check", "uncheck"]);

export class WebCaptureUnavailableError extends Error {
  constructor(message = "The configured Chromium runtime is unavailable.") {
    super(message);
    this.name = "WebCaptureUnavailableError";
    this.code = "web_capture_unavailable";
  }
}

class CaptureExecutionError extends Error {
  constructor(message) {
    super(message);
    this.name = "CaptureExecutionError";
  }
}

function validateJourney(journey, role) {
  if (!journey || typeof journey.id !== "string" || journey.id.length === 0 || typeof journey.name !== "string" || journey.name.length === 0) throw new TypeError("journey needs non-empty id and name");
  if (!Array.isArray(journey.steps) || journey.steps.length === 0) throw new TypeError("journey.steps must be a non-empty array");
  if (journey.steps[0]?.action !== "goto") throw new TypeError("journey.steps must begin with goto");
  for (const step of journey.steps) {
    if (!step || !actions.has(step.action)) throw new TypeError(`Unsupported web capture action: ${step?.action}`);
    if (step.action === "goto" && (typeof step.path !== "string" || step.path.length === 0)) throw new TypeError("goto step needs a path");
    if (step.action !== "goto" && (typeof step.selector !== "string" || step.selector.length === 0)) throw new TypeError(`${step.action} step needs a selector`);
    if (["fill", "select"].includes(step.action) && typeof step.value !== "string") throw new TypeError(`${step.action} step needs a string value`);
  }
  if (!journey.verify || typeof journey.verify.selector !== "string" || typeof journey.verify.text !== "string") throw new TypeError("journey.verify needs selector and text");
  if (!journey.role_assertion || journey.role_assertion.role !== role || typeof journey.role_assertion.selector !== "string" || typeof journey.role_assertion.text !== "string") throw new TypeError("journey.role_assertion must bind the configured role to selector and text");
}

function configuredOrigins(baseUrl, allowedOrigins) {
  const base = new URL(baseUrl);
  if (!["http:", "https:"].includes(base.protocol) || base.username || base.password) throw new TypeError("baseUrl must be an HTTP(S) URL without embedded credentials");
  if (!Array.isArray(allowedOrigins)) throw new TypeError("allowedOrigins must be an array");
  const origins = new Set([base.origin]);
  for (const value of allowedOrigins) {
    const candidate = new URL(value);
    if (!["http:", "https:"].includes(candidate.protocol) || candidate.username || candidate.password || candidate.href !== `${candidate.origin}/`) throw new TypeError("allowedOrigins entries must be bare HTTP(S) origins without credentials");
    origins.add(candidate.origin);
  }
  return {base, origins};
}

function contextHash({build, commit, procedureHash, role, locale, flags, viewport, demoDataId, allowedOrigins}) {
  return createHash("sha256").update(JSON.stringify({build, commit, procedureHash, role, locale, flags: [...flags].sort(), viewport, demoDataId, allowedOrigins: [...allowedOrigins].sort()})).digest("hex");
}

async function assertText(page, assertion, failureMessage, timeout) {
  try {
    const locator = page.locator(assertion.selector);
    const deadline = Date.now() + timeout;
    await locator.waitFor({state: "visible", timeout});
    while (Date.now() <= deadline) {
      const observed = (await locator.innerText()).trim();
      if (observed === assertion.text) return observed;
      await new Promise((resolveWait) => setTimeout(resolveWait, Math.min(50, Math.max(0, deadline - Date.now()))));
    }
    throw new Error("mismatch");
  } catch {
    throw new CaptureExecutionError(failureMessage);
  }
}

async function execute(page, step, base) {
  if (step.action === "goto") {
    const target = new URL(step.path, base);
    if (target.origin !== base.origin) throw new CaptureExecutionError("Journey navigation is outside the allowed application origin.");
    await page.goto(target.href, {waitUntil: "networkidle"});
  } else if (step.action === "click") await page.locator(step.selector).click();
  else if (step.action === "fill") await page.locator(step.selector).fill(step.value);
  else if (step.action === "select") await page.locator(step.selector).selectOption(step.value);
  else if (step.action === "check") await page.locator(step.selector).check();
  else if (step.action === "uncheck") await page.locator(step.selector).uncheck();
}

async function closeQuietly(resource) {
  if (!resource) return;
  try {
    await resource.close();
  } catch {}
}

async function storeScreenshot({page, projectRoot, outputDirectory, captureId, suffix = ""}) {
  return storeCaptureBytes({projectRoot, outputDirectory, captureId, suffix, content: await page.screenshot({fullPage: true})});
}

export async function captureWebJourney({projectRoot, projectId, baseUrl, allowedOrigins = [], executablePath, browserType = chromium, journey, role, availability = "available", flags = [], build, commit = null, locale, viewport = {width: 1280, height: 720}, actionTimeoutMs = 10000, demoDataId, outputDirectory = "media/studio/captures", allowedClaims = []}) {
  validateJourney(journey, role);
  if (!Array.isArray(flags) || !Array.isArray(allowedClaims)) throw new TypeError("flags and allowedClaims must be arrays");
  if (!Number.isInteger(actionTimeoutMs) || actionTimeoutMs < 1) throw new TypeError("actionTimeoutMs must be a positive integer");
  if (typeof demoDataId !== "string" || demoDataId.length === 0) throw new TypeError("demoDataId is required and must identify the non-secret demo dataset");
  const {base, origins} = configuredOrigins(baseUrl, allowedOrigins);
  // Step values may be credentials: they must never be recoverable from the stored hash.
  const hashedJourney = {...journey, steps: journey.steps.map((step) => step.value === undefined ? step : {...step, value: "[value-not-hashed]"})};
  const procedureHash = stableId("procedure", {journey: hashedJourney, allowedOrigins: [...origins].sort(), actionTimeoutMs});
  const captureId = stableId("capture", {projectId, procedureHash, role, build, commit, locale, flags: [...flags].sort(), viewport, demoDataId});
  const hash = `capture-context:${contextHash({build, commit, procedureHash, role, locale, flags, viewport, demoDataId, allowedOrigins: origins})}`;

  if (availability !== "available") {
    const evidence = createEvidenceRecord({projectId, featureOrJourney: journey.name, procedureHash, surface: "web", adapter: "playwright-web", verification: "configured-unavailable", role, availability, flags, build, commit, locale, steps: ["Capture skipped because the configured feature state is unavailable"], result: `Feature ${availability}; no web journey was represented as successful.`, hashes: [hash], allowedClaims: []});
    return {status: "blocked", adapter: "playwright-web", evidence, captures: []};
  }

  let browser;
  try {
    browser = await browserType.launch({headless: true, executablePath});
  } catch {
    throw new WebCaptureUnavailableError();
  }

  let context;
  try {
    let page;
    const blockedOrigins = new Set();
    try {
      context = await browser.newContext({locale, viewport, serviceWorkers: "block"});
      context.setDefaultTimeout(actionTimeoutMs);
      context.setDefaultNavigationTimeout(actionTimeoutMs);
      await context.routeWebSocket(/.*/, (socket) => {
        let origin;
        try {
          const url = new URL(socket.url());
          origin = `${url.protocol === "wss:" ? "https:" : "http:"}//${url.host}`;
        } catch {
          origin = "invalid-origin";
        }
        if (origins.has(origin)) { socket.connectToServer(); return; }
        blockedOrigins.add(origin);
        socket.close();
      });
      await context.route("**/*", async (route) => {
        let origin;
        try {
          origin = new URL(route.request().url()).origin;
        } catch {
          blockedOrigins.add("invalid-origin");
          await route.abort("blockedbyclient");
          return;
        }
        if (!origins.has(origin)) {
          blockedOrigins.add(origin);
          await route.abort("blockedbyclient");
        } else if (route.request().isNavigationRequest()) {
          try {
            const response = await route.fetch({maxRedirects: 0});
            const location = response.headers().location;
            if (location) {
              const redirectOrigin = new URL(location, route.request().url()).origin;
              if (!origins.has(redirectOrigin)) {
                blockedOrigins.add(redirectOrigin);
                await route.abort("blockedbyclient");
                return;
              }
            }
            await route.fulfill({response});
          } catch {
            await route.abort("failed");
          }
        } else await route.continue();
      });
      page = await context.newPage();
    } catch {
      throw new WebCaptureUnavailableError("The configured Chromium runtime could not create an isolated page.");
    }

    const completedSteps = [];
    try {
      for (let index = 0; index < journey.steps.length; index += 1) {
        const step = journey.steps[index];
        try {
          await execute(page, step, base);
        } catch (error) {
          if (error instanceof CaptureExecutionError) throw error;
          throw new CaptureExecutionError(`Journey step ${index + 1} (${step.action}) failed.`);
        }
        if (blockedOrigins.size > 0) throw new CaptureExecutionError("Journey requested an origin outside its explicit allowlist.");
        completedSteps.push(`Completed step ${index + 1} (${step.action})`);
        await assertText(page, journey.role_assertion, "The active application role did not match the configured capture role.", actionTimeoutMs);
        completedSteps.push(`Verified capture role ${role} after step ${index + 1}`);
      }
      const observed = await assertText(page, journey.verify, "The observed result did not match the journey verification.", actionTimeoutMs);
      if (blockedOrigins.size > 0) throw new CaptureExecutionError("Journey requested an origin outside its explicit allowlist.");
      const capture = await storeScreenshot({page, projectRoot, outputDirectory, captureId});
      const evidence = createEvidenceRecord({projectId, featureOrJourney: journey.name, procedureHash, surface: "web", adapter: "playwright-web", verification: "live-capture", role, availability: "available", flags, build, commit, locale, steps: completedSteps, result: observed, capturePaths: [capture.path], hashes: [hash, capture.hash], allowedClaims});
      return {status: "captured", adapter: "playwright-web", evidence, captures: [capture.path]};
    } catch (error) {
      const capturePaths = [];
      const hashes = [hash];
      let canCaptureFailure = false;
      try {
        canCaptureFailure = origins.has(new URL(page.url()).origin);
      } catch {}
      if (canCaptureFailure) {
        try {
          const capture = await storeScreenshot({page, projectRoot, outputDirectory, captureId, suffix: "-failed"});
          capturePaths.push(capture.path);
          hashes.push(capture.hash);
        } catch {}
      }
      const safeResult = error instanceof CaptureExecutionError ? error.message : "The web journey failed without a verified result.";
      const evidence = createEvidenceRecord({projectId, featureOrJourney: journey.name, procedureHash, surface: "web", adapter: "playwright-web", verification: "live-capture", role, availability: "failed", flags, build, commit, locale, steps: completedSteps.length > 0 ? completedSteps : ["Web journey failed before its first step completed"], result: safeResult, capturePaths, hashes, allowedClaims: []});
      return {status: "failed", adapter: "playwright-web", evidence, captures: capturePaths};
    }
  } finally {
    await closeQuietly(context);
    await closeQuietly(browser);
  }
}

export async function webCaptureCapability({executablePath, browserType = chromium} = {}) {
  let browser;
  try {
    browser = await browserType.launch({headless: true, executablePath});
    return {surface: "web", adapter: "playwright-web", status: "available", repeatable: true, native_support: false};
  } catch {
    return {surface: "web", adapter: "playwright-web", status: "blocked", code: "web_capture_unavailable", repeatable: true, native_support: false};
  } finally {
    await closeQuietly(browser);
  }
}
