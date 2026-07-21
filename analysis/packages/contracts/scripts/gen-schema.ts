// Schema generator.
// TS is SSOT.

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createGenerator } from "ts-json-schema-generator";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const outDir = resolve(root, "generated");

// Stable stringify.
function stable(value: unknown): string {
  const seen = new WeakSet();
  function sort(v: unknown): unknown {
    if (v && typeof v === "object") {
      if (seen.has(v as object)) return v;
      seen.add(v as object);
      if (Array.isArray(v)) return v.map(sort);
      const out: Record<string, unknown> = {};
      for (const k of Object.keys(v as object).sort()) {
        out[k] = sort((v as Record<string, unknown>)[k]);
      }
      return out;
    }
    return v;
  }
  return JSON.stringify(sort(value), null, 2) + "\n";
}

// Emit one type.
function emit(type: string, file: string): void {
  const generator = createGenerator({
    path: resolve(root, "src/*.ts"),
    type,
    expose: "all",
    topRef: true,
    additionalProperties: false,
    skipTypeCheck: true,
  });
  const schema = generator.createSchema(type);
  writeFileSync(resolve(outDir, file), stable(schema));
  process.stderr.write(`generated ${file}\n`);
}

mkdirSync(outDir, { recursive: true });
emit("SecurityProveInput", "security_prove.input.schema.json");
emit("SecurityProveOutput", "security_prove.output.schema.json");
emit("SemanticIR", "semantic-ir.schema.json");
