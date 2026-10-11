#!/usr/bin/env node
// A stand-in for `adb` driven by a JSON state file (FAKE_DEVICE_STATE). It exercises the adapter's real process, argument and parsing
// paths without a device; it is not evidence that the adapter works on real hardware.
import {readFileSync, renameSync, writeFileSync} from "node:fs";

const statePath = process.env.FAKE_DEVICE_STATE;
const state = JSON.parse(readFileSync(statePath, "utf8"));
let args = process.argv.slice(2);
if (args[0] === "-s") args = args.slice(2);
state.log.push(args.join(" "));
const save = () => { const temporary = `${statePath}.${process.pid}`; writeFileSync(temporary, JSON.stringify(state)); renameSync(temporary, statePath); };
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
const xml = (screen) => `<?xml version='1.0' encoding='UTF-8' standalone='yes' ?><hierarchy rotation="0">${screen.nodes.map((node, index) => `<node index="${index}" text="${node.text}" resource-id="" class="android.widget.TextView" package="${state.focus}" content-desc="${node.desc ?? ""}" bounds="[${node.bounds[0]},${node.bounds[1]}][${node.bounds[2]},${node.bounds[3]}]" />`).join("")}</hierarchy>`;

const [command, ...rest] = args;
if (state.fail === command) { save(); process.stderr.write("device offline\n"); process.exit(1); }
if (command === "get-state") process.stdout.write("device\n");
else if (command === "shell" && rest[0] === "getprop") process.stdout.write(rest[1] === "ro.product.model" ? "Pixel 7\n" : "14\n");
else if (command === "shell" && rest[0] === "wm") process.stdout.write("Physical size: 1080x2400\n");
else if (command === "shell" && rest[0] === "monkey") { state.focus = rest[2]; state.index = 0; process.stdout.write("Events injected: 1\n"); }
else if (command === "shell" && rest[0] === "dumpsys") process.stdout.write(`  mCurrentFocus=Window{abc u0 ${state.focus}/.MainActivity}\n`);
else if (command === "shell" && rest[0] === "input" && rest[1] === "tap") {
  const [x, y] = [Number(rest[2]), Number(rest[3])];
  const hit = state.screens[state.index].nodes.find((node) => node.next && x >= node.bounds[0] && x <= node.bounds[2] && y >= node.bounds[1] && y <= node.bounds[3]);
  if (hit) state.index += 1;
} else if (command === "shell" && rest[0] === "input") { /* text and keyevent are only logged */ }
else if (command === "exec-out" && rest[0] === "uiautomator") process.stdout.write(`${xml(state.screens[state.index])}\nUI hierarchy dumped to: /dev/tty\n`);
else if (command === "exec-out" && rest[0] === "screencap") process.stdout.write(png);
else { save(); process.stderr.write(`unexpected adb command: ${args.join(" ")}\n`); process.exit(2); }
save();
