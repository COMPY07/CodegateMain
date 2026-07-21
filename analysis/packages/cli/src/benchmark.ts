// Scaling benchmark.
// Synthetic repo.

import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { audit } from "./audit.js";

// One vulnerable route.
function routeSource(): string {
  return (
    `import { prisma } from "../../../lib/db";\n` +
    `export async function DELETE(_r: Request,` +
    ` { params }: { params: { id: string } }) {\n` +
    `  await prisma.project.delete({ where: { id: params.id } });\n` +
    `  return new Response("ok");\n}\n`
  );
}

// Generate synthetic repo.
function generate(root: string, count: number): void {
  for (let i = 0; i < count; i += 1) {
    const dir = join(root, "app", "api", `r${i}`, "[id]");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "route.ts"), routeSource());
  }
}

// Run the benchmark.
async function main(): Promise<void> {
  const count = Number(process.argv[2] ?? "50");
  const root = mkdtempSync(join(tmpdir(), "vibegate-bench-"));
  try {
    generate(root, count);
    const start = process.hrtime.bigint();
    const result = await audit(resolve(root));
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    const perSec = (count / (ms / 1000)).toFixed(1);
    process.stdout.write(
      `routes=${count} effects=${result.effects}` +
        ` findings=${result.findings.length}\n`,
    );
    process.stdout.write(`time=${ms.toFixed(1)}ms throughput=${perSec} routes/s\n`);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

void main();
