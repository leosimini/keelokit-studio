#!/usr/bin/env node
import {resolve} from "node:path";
import {verifyPortability} from "../src/verification/portability.mjs";

const root = resolve(import.meta.dirname, "..");
const report = await verifyPortability({repositoryRoot: root, fixtures: [resolve(root, "fixtures/contracts/field-service"), resolve(root, "fixtures/contracts/learning-platform")]});
console.log(JSON.stringify(report, null, 2));
if (report.status !== "passed") process.exitCode = 1;
