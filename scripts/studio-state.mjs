#!/usr/bin/env node
import {resolve} from "node:path";
import {createInitialState, initializeState, loadState} from "../src/state/store.mjs";

const [command, rootArgument, projectId] = process.argv.slice(2);
const projectRoot = resolve(rootArgument ?? ".");

if (command === "init") {
  if (!projectId) throw new Error("Usage: studio-state init <project-root> <project-id>");
  const destination = await initializeState(projectRoot, createInitialState(projectId));
  console.log(destination);
} else if (command === "show") {
  console.log(JSON.stringify(await loadState(projectRoot), null, 2));
} else {
  throw new Error("Usage: studio-state <init|show> <project-root> [project-id]");
}

