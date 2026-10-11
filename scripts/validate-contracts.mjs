#!/usr/bin/env node
import {resolve} from "node:path";
import {validateContracts} from "../src/contracts/validate.mjs";

const directory = resolve(process.argv[2] ?? "fixtures/contracts/field-service");

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

