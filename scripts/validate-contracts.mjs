#!/usr/bin/env node
import {resolve} from "node:path";
import {validateContracts} from "../src/contracts/validate.mjs";

if (!process.argv[2]) {
  console.error("Usage: validate-contracts <contracts-directory>");
  process.exit(2);
}
const directory = resolve(process.argv[2]);

try {
  const result = await validateContracts(directory);
  if (!result.valid) {
    for (const error of result.errors) console.error(error);
    process.exitCode = 1;
  } else {
    console.log(`Contracts valid: ${directory}`);
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}

