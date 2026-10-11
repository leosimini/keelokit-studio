#!/usr/bin/env node
import {createServer} from "node:http";
import {readFile} from "node:fs/promises";
import {resolve} from "node:path";
await import("./require-deps.mjs");
const {loadDashboard, saveDashboard, setPublication} = await import("../src/dashboard/store.mjs");
const {renderDashboardHtml} = await import("../src/dashboard/html.mjs");
const {resolveConsumerPath} = await import("../src/core/paths.mjs");

const arguments_ = process.argv.slice(2);
const projectRoot = resolve(arguments_[0] ?? ".");
const port = Number(arguments_[1] ?? 4317);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Usage: studio-dashboard <project-root> [port]");
const allowedHosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
const server = createServer(async (request, response) => {
  try {
    // Defend against DNS rebinding and cross-site writes: only loopback Host/Origin, and JSON-only writes.
    if (!allowedHosts.has(request.headers.host ?? "")) { response.statusCode = 403; response.end("Forbidden host"); return; }
    if (request.headers.origin !== undefined && !allowedHosts.has(request.headers.origin.replace(/^https?:\/\//, ""))) { response.statusCode = 403; response.end("Forbidden origin"); return; }
    if (request.method === "PUT" && !/^application\/json(;|$)/i.test(request.headers["content-type"] ?? "")) { response.statusCode = 415; response.end("Content-Type must be application/json"); return; }
    if (request.method === "GET" && request.url === "/") { response.setHeader("content-type", "text/html; charset=utf-8"); response.end(renderDashboardHtml(await loadDashboard(projectRoot))); return; }
    if (request.method === "GET" && request.url === "/api/dashboard") { response.setHeader("content-type", "application/json"); response.end(JSON.stringify(await loadDashboard(projectRoot))); return; }
    if (request.method === "GET" && request.url?.startsWith("/artifact?")) {
      const path = new URL(request.url, "http://127.0.0.1").searchParams.get("path");
      const dashboard = await loadDashboard(projectRoot);
      if (!dashboard.pieces.some((piece) => [...piece.previews, ...piece.exports].some((artifact) => artifact.path === path))) throw new Error("Artifact is not registered in the dashboard");
      const bytes = await readFile(await resolveConsumerPath(projectRoot, path));
      response.setHeader("content-type", "application/octet-stream"); response.setHeader("x-content-type-options", "nosniff"); response.end(bytes); return;
    }
    if (request.method === "PUT" && request.url === "/api/publication") {
      const chunks = []; let size = 0;
      for await (const chunk of request) { size += chunk.length; if (size > 65536) throw new Error("Request body too large"); chunks.push(chunk); }
      const current = await loadDashboard(projectRoot);
      const next = await saveDashboard(projectRoot, setPublication(current, {...JSON.parse(Buffer.concat(chunks).toString("utf8")), updatedAt: new Date().toISOString()}));
      response.setHeader("content-type", "application/json"); response.end(JSON.stringify(next)); return;
    }
    response.statusCode = 404; response.end("Not found");
  } catch (error) { response.statusCode = 400; response.end(error.message); }
});
server.requestTimeout = 10000; server.headersTimeout = 5000;
server.listen(port, "127.0.0.1", () => console.log(`Keelokit Studio dashboard: http://127.0.0.1:${port}`));
