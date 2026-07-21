// Boundary validator.
// Ajv checked.

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Ajv } from "ajv";
import type {
  SecurityProveInput,
  SecurityProveOutput,
} from "@vibegate/contracts";

const here = dirname(fileURLToPath(import.meta.url));

// Generated schema path.
function schemaPath(name: string): string {
  return resolve(here, "../../contracts/generated", name);
}

// Load a schema.
function load(name: string): object {
  return JSON.parse(readFileSync(schemaPath(name), "utf8")) as object;
}

const ajv = new Ajv({ allErrors: true, strict: false });
const validateInput = ajv.compile(load("security_prove.input.schema.json"));
const validateOutput = ajv.compile(load("security_prove.output.schema.json"));

// Validation error.
export class InputError extends Error {}
// Output contract error.
export class OutputError extends Error {}

// Parse tool input.
export function parseInput(raw: unknown): SecurityProveInput {
  if (!validateInput(raw)) {
    const msg = ajv.errorsText(validateInput.errors);
    throw new InputError(msg);
  }
  return raw as SecurityProveInput;
}

// Check tool output.
export function checkOutput(out: SecurityProveOutput): SecurityProveOutput {
  if (!validateOutput(out)) {
    const msg = ajv.errorsText(validateOutput.errors);
    throw new OutputError(msg);
  }
  return out;
}
