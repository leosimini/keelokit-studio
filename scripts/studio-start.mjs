#!/usr/bin/env node
import {resolve} from "node:path";
import {startOrResume} from "../src/agency/start.mjs";

function parseOptions(arguments_) {
  const supported = new Set(["--project-root", "--project-id"]);
  const result = {};
  for (let index = 0; index < arguments_.length; index += 2) {
    const name = arguments_[index];
    const value = arguments_[index + 1];
    if (!supported.has(name)) throw new TypeError(`Unknown option: ${name ?? "<missing>"}`);
    if (value === undefined || value.startsWith("--")) throw new TypeError(`Option ${name} requires a value`);
    if (result[name] !== undefined) throw new TypeError(`Duplicate option: ${name}`);
    result[name] = value;
  }
  return result;
}

let options;
try {
  options = parseOptions(process.argv.slice(2));
} catch (error) {
  console.error(error.message);
  process.exitCode = 2;
}
const projectId = options?.["--project-id"];
if (options && !projectId) {
  console.error("Option --project-id is required");
  process.exitCode = 2;
} else if (options) {
  const projectRoot = resolve(options["--project-root"] ?? process.cwd());
  console.log(JSON.stringify(await startOrResume({projectRoot, projectId}), null, 2));
}

