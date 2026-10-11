import assert from "node:assert/strict";
import {createServer} from "node:http";
import {mkdtemp, readFile, rm, stat} from "node:fs/promises";
import {tmpdir} from "node:os";
import {resolve} from "node:path";
import test from "node:test";
import {stableId} from "../src/core/ids.mjs";
import {chromiumExecutable} from "./support/chromium.mjs";
import {captureWebJourney, webCaptureCapability} from "../src/adapters/web-capture.mjs";

const fixtureHtml = await readFile(resolve("fixtures/web-capture/index.html"));

async function withFixture(run) {
  const server = createServer((request, response) => {
    response.writeHead(200, {"content-type": "text/html; charset=utf-8"});
    response.end(fixtureHtml);
  });
  await new Promise((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
  const {port} = server.address();
  try {
    await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolveClose, reject) => server.close((error) => error ? reject(error) : resolveClose()));
  }
}

function options(projectRoot, baseUrl, overrides = {}) {
  return {
    projectRoot,
    projectId: "web-fixture",
    baseUrl,
    executablePath: chromiumExecutable,
    journey: {
      id: "save-task",
      name: "Save a task",
      steps: [
        {action: "goto", path: "/"},
        {action: "fill", selector: "#task", value: "Review evidence"},
        {action: "click", selector: "#save"}
      ],
      role_assertion: {role: "operator", selector: "#active-role", text: "operator"},
      verify: {selector: "#result", text: "Saved: Review evidence"}
    },
    role: "operator",
    flags: ["tasks-enabled"],
    build: "fixture-1",
    locale: "en-US",
    actionTimeoutMs: 1500,
    demoDataId: "fixture-data-v1",
    allowedClaims: ["Operators can save a task."],
    ...overrides
  };
}

test("captures a verified web journey with reproducible context and file hashes", async () => {
  const projectRoot = await mkdtemp(resolve(tmpdir(), "keelokit-studio-web-"));
  try {
    await withFixture(async (baseUrl) => {
      const result = await captureWebJourney(options(projectRoot, baseUrl));
      assert.equal(result.status, "captured");
      assert.equal(result.evidence.availability, "available");
      assert.equal(result.evidence.surface, "web");
      assert.deepEqual(result.evidence.allowed_claims, ["Operators can save a task."]);
      assert.equal(result.evidence.hashes.length, 2);
      await stat(resolve(projectRoot, result.captures[0]));
    });
  } finally {
    await rm(projectRoot, {recursive: true, force: true});
  }
});

test("preserves a failed verification without claims or a fabricated capture", async () => {
  const projectRoot = await mkdtemp(resolve(tmpdir(), "keelokit-studio-web-"));
  try {
    await withFixture(async (baseUrl) => {
      const base = options(projectRoot, baseUrl);
      base.journey.verify.text = "A result that does not exist";
      const result = await captureWebJourney(base);
      assert.equal(result.status, "failed");
      assert.equal(result.evidence.availability, "failed");
      assert.deepEqual(result.evidence.allowed_claims, []);
      assert.equal(result.captures.length, 1);
      await stat(resolve(projectRoot, result.captures[0]));
      assert.match(result.evidence.result, /observed result/);
    });
  } finally {
    await rm(projectRoot, {recursive: true, force: true});
  }
});

test("does not run or claim a disabled feature", async () => {
  const projectRoot = await mkdtemp(resolve(tmpdir(), "keelokit-studio-web-"));
  try {
    const result = await captureWebJourney(options(projectRoot, "http://127.0.0.1:1", {availability: "disabled"}));
    assert.equal(result.status, "blocked");
    assert.equal(result.evidence.availability, "disabled");
    assert.deepEqual(result.evidence.allowed_claims, []);
  } finally {
    await rm(projectRoot, {recursive: true, force: true});
  }
});

test("declares web-only capability and rejects external journey navigation", async () => {
  assert.deepEqual(await webCaptureCapability({executablePath: chromiumExecutable}), {surface: "web", adapter: "playwright-web", status: "available", repeatable: true, native_support: false});
  assert.equal((await webCaptureCapability({executablePath: "/does/not/exist"})).status, "blocked");
  const projectRoot = await mkdtemp(resolve(tmpdir(), "keelokit-studio-web-"));
  try {
    await withFixture(async (baseUrl) => {
      const base = options(projectRoot, baseUrl);
      base.journey.steps = [{action: "goto", path: "https://example.com"}];
      const result = await captureWebJourney(base);
      assert.equal(result.status, "failed");
      assert.match(result.evidence.result, /allowed application origin/);
    });
  } finally {
    await rm(projectRoot, {recursive: true, force: true});
  }
});

test("blocks external requests before contact and never persists secret step values", async () => {
  let externalHits = 0;
  const external = createServer((request, response) => {
    externalHits += 1;
    response.end("external");
  });
  await new Promise((resolveListen) => external.listen(0, "127.0.0.1", resolveListen));
  const externalOrigin = `http://127.0.0.1:${external.address().port}`;
  const app = createServer((request, response) => {
    if (request.url === "/redirect") {
      response.writeHead(302, {location: `${externalOrigin}/leak?token=DEMO_SECRET_PASSWORD`});
      response.end();
      return;
    }
    response.writeHead(200, {"content-type": "text/html"});
    response.end(`<!doctype html><p id="active-role">operator</p><img src="${externalOrigin}/subresource?token=DEMO_SECRET_PASSWORD"><button id="save">Save</button><p id="result">ready</p>`);
  });
  await new Promise((resolveListen) => app.listen(0, "127.0.0.1", resolveListen));
  const projectRoot = await mkdtemp(resolve(tmpdir(), "keelokit-studio-web-"));
  try {
    const baseUrl = `http://127.0.0.1:${app.address().port}`;
    const subresource = options(projectRoot, baseUrl);
    subresource.journey.steps = [{action: "goto", path: "/"}];
    subresource.journey.verify = {selector: "#result", text: "ready"};
    const blockedResource = await captureWebJourney(subresource);
    assert.equal(blockedResource.status, "failed");
    assert.equal(externalHits, 0);

    const redirect = options(projectRoot, baseUrl);
    redirect.journey.steps = [{action: "goto", path: "/redirect"}];
    const blockedRedirect = await captureWebJourney(redirect);
    assert.equal(blockedRedirect.status, "failed");
    assert.equal(externalHits, 0);

    const secret = options(projectRoot, baseUrl);
    secret.journey.steps = [{action: "goto", path: "/"}, {action: "fill", selector: "#save", value: "DEMO_SECRET_PASSWORD"}];
    const secretFailure = await captureWebJourney(secret);
    assert.equal(secretFailure.status, "failed");
    assert.doesNotMatch(JSON.stringify(secretFailure), /DEMO_SECRET_PASSWORD/);
  } finally {
    await rm(projectRoot, {recursive: true, force: true});
    app.closeAllConnections();
    external.closeAllConnections();
    await new Promise((resolveClose) => app.close(resolveClose));
    await new Promise((resolveClose) => external.close(resolveClose));
  }
});

test("journey changes create new evidence and preserve prior capture paths", async () => {
  const projectRoot = await mkdtemp(resolve(tmpdir(), "keelokit-studio-web-"));
  try {
    await withFixture(async (baseUrl) => {
      const first = await captureWebJourney(options(projectRoot, baseUrl));
      const changed = options(projectRoot, baseUrl);
      changed.journey.steps[1].value = "Inspect changed evidence";
      changed.journey.verify.text = "Saved: Inspect changed evidence";
      const second = await captureWebJourney(changed);
      assert.notEqual(first.evidence.procedure_hash, second.evidence.procedure_hash);
      assert.notEqual(first.evidence.evidence_id, second.evidence.evidence_id);
      assert.notEqual(first.captures[0], second.captures[0]);
      await stat(resolve(projectRoot, first.captures[0]));
      await stat(resolve(projectRoot, second.captures[0]));
    });
  } finally {
    await rm(projectRoot, {recursive: true, force: true});
  }
});

test("fails when the visible application role does not match the configured role", async () => {
  const projectRoot = await mkdtemp(resolve(tmpdir(), "keelokit-studio-web-"));
  try {
    await withFixture(async (baseUrl) => {
      const mismatched = options(projectRoot, baseUrl);
      mismatched.journey.role_assertion.text = "administrator";
      const result = await captureWebJourney(mismatched);
      assert.equal(result.status, "failed");
      assert.match(result.evidence.result, /active application role/);
      assert.deepEqual(result.evidence.allowed_claims, []);
    });
  } finally {
    await rm(projectRoot, {recursive: true, force: true});
  }
});

test("revalidates the role after actions and blocks a mid-journey privilege change", async () => {
  const html = fixtureHtml.toString().replace('document.querySelector("#result").textContent = task ? `Saved: ${task}` : "Task is required.";', 'document.querySelector("#result").textContent = task ? `Saved: ${task}` : "Task is required."; document.querySelector("#active-role").textContent = "administrator";');
  const server = createServer((request, response) => response.end(html));
  await new Promise((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
  const projectRoot = await mkdtemp(resolve(tmpdir(), "keelokit-studio-web-"));
  try {
    const result = await captureWebJourney(options(projectRoot, `http://127.0.0.1:${server.address().port}`));
    assert.equal(result.status, "failed");
    assert.match(result.evidence.result, /active application role/);
    assert.deepEqual(result.evidence.allowed_claims, []);
  } finally {
    await rm(projectRoot, {recursive: true, force: true});
    server.closeAllConnections();
    await new Promise((resolveClose) => server.close(resolveClose));
  }
});

test("content-addresses recaptures when unrelated visible output changes", async () => {
  let visualRevision = "revision-one";
  const server = createServer((request, response) => response.end(fixtureHtml.toString().replace("<body>", `<body><p>${visualRevision}</p>`)));
  await new Promise((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
  const projectRoot = await mkdtemp(resolve(tmpdir(), "keelokit-studio-web-"));
  try {
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const first = await captureWebJourney(options(projectRoot, baseUrl));
    visualRevision = "revision-two";
    const second = await captureWebJourney(options(projectRoot, baseUrl));
    assert.equal(first.evidence.procedure_hash, second.evidence.procedure_hash);
    assert.notEqual(first.captures[0], second.captures[0]);
    assert.notEqual(first.evidence.evidence_id, second.evidence.evidence_id);
    await stat(resolve(projectRoot, first.captures[0]));
    await stat(resolve(projectRoot, second.captures[0]));
  } finally {
    await rm(projectRoot, {recursive: true, force: true});
    server.closeAllConnections();
    await new Promise((resolveClose) => server.close(resolveClose));
  }
});

test("waits for an asynchronous SPA result within the configured timeout", async () => {
  const html = fixtureHtml.toString().replace('document.querySelector("#result").textContent = task ? `Saved: ${task}` : "Task is required.";', 'setTimeout(() => { document.querySelector("#result").textContent = task ? `Saved: ${task}` : "Task is required."; }, 250);');
  const server = createServer((request, response) => response.end(html));
  await new Promise((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
  const projectRoot = await mkdtemp(resolve(tmpdir(), "keelokit-studio-web-"));
  try {
    const result = await captureWebJourney(options(projectRoot, `http://127.0.0.1:${server.address().port}`));
    assert.equal(result.status, "captured");
    assert.equal(result.evidence.result, "Saved: Review evidence");
  } finally {
    await rm(projectRoot, {recursive: true, force: true});
    server.closeAllConnections();
    await new Promise((resolveClose) => server.close(resolveClose));
  }
});

test("keeps Playwright selector semantics while waiting for the expected result", async () => {
  const projectRoot = await mkdtemp(resolve(tmpdir(), "keelokit-studio-web-"));
  try {
    await withFixture(async (baseUrl) => {
      const configured = options(projectRoot, baseUrl);
      configured.journey.verify.selector = "text=Saved: Review evidence";
      const result = await captureWebJourney(configured);
      assert.equal(result.status, "captured");
      assert.equal(result.evidence.result, "Saved: Review evidence");
    });
  } finally {
    await rm(projectRoot, {recursive: true, force: true});
  }
});

test("closes context and browser when isolated page creation fails", async () => {
  let contextClosed = 0;
  let browserClosed = 0;
  const browserType = {
    async launch() {
      return {
        async newContext() {
          return {async route() {}, async newPage() { throw new Error("injected"); }, async close() { contextClosed += 1; }};
        },
        async close() { browserClosed += 1; }
      };
    }
  };
  const projectRoot = await mkdtemp(resolve(tmpdir(), "keelokit-studio-web-"));
  try {
    await assert.rejects(() => captureWebJourney(options(projectRoot, "http://127.0.0.1:1", {browserType})), /isolated page/);
    assert.equal(contextClosed, 1);
    assert.equal(browserClosed, 1);
  } finally {
    await rm(projectRoot, {recursive: true, force: true});
  }
});

test("blocks WebSocket connections to origins outside the allowlist and does not hash step values", async () => {
  let upgrades = 0;
  const external = createServer();
  external.on("upgrade", (request, socket) => { upgrades += 1; socket.destroy(); });
  await new Promise((resolveListen) => external.listen(0, "127.0.0.1", resolveListen));
  const externalPort = external.address().port;
  const app = createServer((request, response) => {
    response.writeHead(200, {"content-type": "text/html"});
    response.end(`<!doctype html><p id="active-role">operator</p><input id="task"><p id="result">ready</p><script>new WebSocket("ws://127.0.0.1:${externalPort}/socket");</script>`);
  });
  await new Promise((resolveListen) => app.listen(0, "127.0.0.1", resolveListen));
  const projectRoot = await mkdtemp(resolve(tmpdir(), "keelokit-studio-web-"));
  try {
    const baseUrl = `http://127.0.0.1:${app.address().port}`;
    const attempt = options(projectRoot, baseUrl);
    attempt.journey.steps = [{action: "goto", path: "/"}, {action: "fill", selector: "#task", value: "hunter2"}];
    attempt.journey.verify = {selector: "#result", text: "ready"};
    const result = await captureWebJourney(attempt);
    await new Promise((resolveWait) => setTimeout(resolveWait, 300));
    assert.equal(upgrades, 0);
    assert.equal(result.status, "failed");
    const guess = attempt.journey.steps.map((step) => step.value === "hunter2" ? {...step} : step);
    assert.equal(JSON.stringify(result.evidence).includes("hunter2"), false);
    assert.equal(stableId("procedure", {journey: {...attempt.journey, steps: guess}, allowedOrigins: [baseUrl], actionTimeoutMs: 10000}) === result.evidence.procedure_hash, false);
  } finally {
    await rm(projectRoot, {recursive: true, force: true});
    await new Promise((resolveClose) => external.close(resolveClose));
    await new Promise((resolveClose) => app.close(resolveClose));
  }
});
