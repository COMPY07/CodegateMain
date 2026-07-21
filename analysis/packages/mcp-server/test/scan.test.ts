// Scanner tests.
// Rule findings.

import { describe, it, expect } from "vitest";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { scan } from "../src/scan.js";

const here = dirname(fileURLToPath(import.meta.url));

describe("config scanner", () => {
  // Finds planted issues.
  it("detects secret, aws key, insecure cookie", async () => {
    const root = resolve(here, "scan-target");
    const out = await scan(root);
    const rules = out.findings.map((f) => f.rule);
    expect(rules).toContain("hardcoded-secret");
    expect(rules).toContain("aws-access-key");
    expect(rules).toContain("insecure-cookie");
    expect(out.findings.every((f) => f.line > 0)).toBe(true);
  });

  // Supply chain and logging.
  it("detects install script, git dep, logged secret", async () => {
    const root = resolve(here, "scan-target");
    const out = await scan(root);
    const rules = out.findings.map((f) => f.rule);
    expect(rules).toContain("install-script-shell");
    expect(rules).toContain("git-url-dependency");
    expect(rules).toContain("logged-secret");
    const owasp = new Set(out.findings.map((f) => f.owasp));
    expect(owasp.has("A03")).toBe(true);
    expect(owasp.has("A09")).toBe(true);
  });

  it("does not treat registry resolution URLs in package-lock as git deps", async () => {
    const root = resolve(here, "scan-target");
    const out = await scan(root);
    expect(out.findings.some((f) => f.file === "package-lock.json")).toBe(false);
  });
});
