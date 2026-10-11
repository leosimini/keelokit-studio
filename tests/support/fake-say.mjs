#!/usr/bin/env node
// A stand-in for macOS `say -v <voice> [-r <rate>] -f <text file> -o <out.wav> --data-format=LEI16@24000`.
import {readFileSync, writeFileSync} from "node:fs";
import {synthesizeToneNarration} from "../../src/adapters/voice.mjs";
const args = process.argv.slice(2);
const value = (flag) => args[args.indexOf(flag) + 1];
if (args[0] === "-v" && args[1] === "?") { process.stdout.write("Monica             es_ES    # Hola, me llamo Monica.\nSamantha           en_US    # Hello, my name is Samantha.\n"); process.exit(0); }
if (!args.includes("--data-format=LEI16@24000")) { process.stderr.write("unexpected format\n"); process.exit(2); }
writeFileSync(value("-o"), synthesizeToneNarration(readFileSync(value("-f"), "utf8")).audio_bytes);
