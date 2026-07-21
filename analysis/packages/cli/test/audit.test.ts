// CLI audit tests.
// Repo to verdict.

import { describe, it, expect } from "vitest";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { audit } from "../src/audit.js";

const here = dirname(fileURLToPath(import.meta.url));

// Fixture directory.
function fixture(name: string): string {
  return resolve(here, "../../frontend/test/e2e", name);
}

describe("cli audit", () => {
  // Vulnerable repo.
  it("e1 id-only => SUPPORTED finding", async () => {
    const r = await audit(fixture("e1-id-only"));
    expect(r.findings.some((f) => f.verdict === "SUPPORTED")).toBe(true);
  });

  // Safe repo.
  it("e2 inline tenant => no SUPPORTED", async () => {
    const r = await audit(fixture("e2-inline-tenant"));
    expect(r.findings.every((f) => f.verdict !== "SUPPORTED")).toBe(true);
  });

  // Interprocedural repo.
  it("e5 route->service => SUPPORTED", async () => {
    const r = await audit(fixture("e5-interprocedural"));
    expect(r.findings.some((f) => f.verdict === "SUPPORTED")).toBe(true);
  });
});
