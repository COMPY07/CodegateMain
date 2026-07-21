// Vibegate CLI.
// Thin entry point.

import { resolve } from "node:path";
import { audit } from "./audit.js";

// Print and exit.
async function main(): Promise<number> {
  const target = process.argv[2];
  if (!target) {
    process.stderr.write("usage: vibegate <repo-path>\n");
    return 2;
  }
  const root = resolve(target);
  const result = await audit(root);
  process.stdout.write(`VibeGate audit: ${root}\n`);
  process.stdout.write(
    `entrypoints=${result.entrypoints} effects=${result.effects}\n\n`,
  );
  let supported = 0;
  for (const f of result.findings) {
    process.stdout.write(`  ${f.resource} DB_DELETE => ${f.verdict}\n`);
    if (f.verdict === "SUPPORTED") supported += 1;
  }
  process.stdout.write(`\n${supported} finding(s).\n`);
  return supported > 0 ? 1 : 0;
}

main()
  .then((code) => process.exit(code))
  .catch((err: unknown) => {
    process.stderr.write(`error: ${String(err)}\n`);
    process.exit(3);
  });
