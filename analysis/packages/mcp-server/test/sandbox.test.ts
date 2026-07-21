// Sandbox tests.
// Path confinement.

import { describe, it, expect, afterEach } from "vitest";
import { confineRoot, SandboxError } from "../src/sandbox.js";

afterEach(() => {
  delete process.env["VIBEGATE_ROOT"];
});

describe("repository sandbox", () => {
  // No pin passes.
  it("no pin returns resolved path", () => {
    expect(confineRoot("/tmp/x")).toBe("/tmp/x");
  });

  // Inside pin allowed.
  it("path inside pin allowed", () => {
    process.env["VIBEGATE_ROOT"] = "/srv/app";
    expect(confineRoot("src")).toBe("/srv/app/src");
  });

  // Escape rejected.
  it("path escaping pin rejected", () => {
    process.env["VIBEGATE_ROOT"] = "/srv/app";
    expect(() => confineRoot("../../etc")).toThrow(SandboxError);
  });

  // Absolute escape rejected.
  it("absolute path escaping pin rejected", () => {
    process.env["VIBEGATE_ROOT"] = "/srv/app";
    expect(() => confineRoot("/etc/passwd")).toThrow(SandboxError);
  });
});
