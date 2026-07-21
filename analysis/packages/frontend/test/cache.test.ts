// Cache tests.
// Hit and miss.

import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { extractCached, clearCache } from "../src/index.js";

// Route body text.
const ROUTE =
  `import { prisma } from "../db";\n` +
  `export async function DELETE(_r: Request,` +
  ` { params }: { params: { id: string } }) {\n` +
  `  await prisma.project.delete({ where: { id: params.id } });\n` +
  `  return new Response("ok");\n}\n`;

let dir: string;

afterEach(() => {
  clearCache();
  if (dir) rmSync(dir, { recursive: true, force: true });
});

describe("extraction cache", () => {
  // Same content hits.
  it("unchanged files return same IR", () => {
    dir = mkdtempSync(join(tmpdir(), "vg-cache-"));
    const sub = join(dir, "app");
    mkdirSync(sub, { recursive: true });
    const file = join(sub, "route.ts");
    writeFileSync(file, ROUTE);

    const a = extractCached([file], [], "snap");
    const b = extractCached([file], [], "snap");
    expect(a).toBe(b);
  });

  // Changed content misses.
  it("changed file re-extracts", () => {
    dir = mkdtempSync(join(tmpdir(), "vg-cache-"));
    const sub = join(dir, "app");
    mkdirSync(sub, { recursive: true });
    const file = join(sub, "route.ts");
    writeFileSync(file, ROUTE);

    const a = extractCached([file], [], "snap");
    writeFileSync(file, ROUTE + "\n// changed\n");
    const c = extractCached([file], [], "snap");
    expect(a).not.toBe(c);
  });
});
