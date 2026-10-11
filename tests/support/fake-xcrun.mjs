#!/usr/bin/env node
// A stand-in for `xcrun simctl`, driven by a JSON state file (FAKE_DEVICE_STATE). Not evidence about a real simulator.
import {readFileSync, renameSync, writeFileSync} from "node:fs";

const statePath = process.env.FAKE_DEVICE_STATE;
const state = JSON.parse(readFileSync(statePath, "utf8"));
const args = process.argv.slice(2);
state.log.push(args.join(" "));
const temporary = `${statePath}.${process.pid}`;
writeFileSync(temporary, JSON.stringify(state));
renameSync(temporary, statePath);
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
const [tool, command, ...rest] = args;
if (tool !== "simctl") { process.stderr.write("unexpected tool\n"); process.exit(2); }
if (command === "list") process.stdout.write(JSON.stringify({devices: {"com.apple.CoreSimulator.SimRuntime.iOS-17-5": [{udid: state.udid, name: "iPhone 15", state: "Booted"}]}}));
else if (command === "launch") process.stdout.write(`${rest[1]}: 4242\n`);
else if (command === "openurl") process.stdout.write("");
else if (command === "io" && rest[1] === "screenshot") writeFileSync(rest.at(-1), png);
else { process.stderr.write(`unexpected simctl command: ${args.join(" ")}\n`); process.exit(2); }
