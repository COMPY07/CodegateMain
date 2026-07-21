// MCP smoke test.
// Real transport.

import { describe, it, expect } from "vitest";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const here = dirname(fileURLToPath(import.meta.url));
const serverPath = resolve(here, "../dist/server.js");
const e1Root = resolve(
  here,
  "../../frontend/test/e2e/e1-id-only",
);

// Standard proof body.
function proofBody(entrypointId: string) {
  return {
    claim: "EXISTS_VIOLATING_PATH",
    template: "EFFECT_REQUIRES_RELATION",
    attacker: { principalType: "authenticated_user", constraints: [] },
    entrypoint: { nodeId: entrypointId },
    attackerControl: [
      {
        value: {
          kind: "field",
          base: { kind: "symbol", symbolId: "sym_eb3001bd261ba479" },
          path: ["id"],
        },
        semanticRole: "resource_identifier",
      },
    ],
    targetEffect: { kind: "DB_DELETE", resource: "Project" },
    requiredInvariants: [
      { kind: "RELATION_ESTABLISHED", predicate: "same tenant" },
    ],
    analysisScope: {
      buildProfile: "production",
      includeMiddleware: true,
      includeOrmExtensions: true,
      includeDatabasePolicies: true,
      maximumCallDepth: 12,
    },
  };
}

describe("mcp smoke", () => {
  it("security_prove over E1 => SUPPORTED", async () => {
    const transport = new StdioClientTransport({
      command: "node",
      args: [serverPath],
      env: {
        VIBEGATE_ROOT: e1Root,
        ...(process.env["PATH"] ? { PATH: process.env["PATH"] } : {}),
      },
    });
    const client = new Client({ name: "test", version: "0.0.0" });
    await client.connect(transport);

    const tools = await client.listTools();
    expect(tools.tools.map((t) => t.name).sort()).toEqual(
      [
        "security_evidence",
        "security_index",
        "security_inventory",
        "security_prove",
        "security_scan",
        "security_slice",
      ].sort(),
    );
    const proveTool = tools.tools.find((t) => t.name === "security_prove");
    const proofSchema = proveTool?.inputSchema.properties?.["proof"] as
      | { type?: string }
      | undefined;
    expect(proofSchema?.type).toBe("object");

    // Inventory tool works.
    expect(tools.tools.map((t) => t.name)).toContain("security_inventory");
    const inv = await client.callTool({
      name: "security_inventory",
      arguments: { snapshot: { root: e1Root, snapshotId: "snap" } },
    });
    const invOut = inv.structuredContent as {
      entrypoints: { nodeId: string }[];
      effects: { effectKind: string }[];
    };
    expect(invOut.entrypoints.length).toBeGreaterThan(0);
    const entrypointId = invOut.entrypoints[0]!.nodeId;

    const res = await client.callTool({
      name: "security_prove",
      arguments: {
        proof: proofBody(entrypointId),
        snapshot: { root: e1Root, snapshotId: "snap" },
      },
    });

    const structured = res.structuredContent as {
      result: { verdict: string };
    };
    expect(structured.result.verdict).toBe("SUPPORTED");
    expect(invOut.effects.some((e) => e.effectKind === "DB_DELETE")).toBe(true);

    // Evidence tool works.
    const ev = await client.callTool({
      name: "security_evidence",
      arguments: {
        proof: proofBody(entrypointId),
        snapshot: { root: e1Root, snapshotId: "snap" },
      },
    });
    const evOut = ev.structuredContent as {
      verdict: string;
      witnessPaths: unknown[];
    };
    expect(evOut.verdict).toBe("SUPPORTED");
    expect(evOut.witnessPaths.length).toBeGreaterThan(0);

    // Slice tool works.
    expect(tools.tools.map((t) => t.name)).toContain("security_slice");
    const sl = await client.callTool({
      name: "security_slice",
      arguments: {
        proof: proofBody(entrypointId),
        snapshot: { root: e1Root, snapshotId: "snap" },
      },
    });
    const slOut = sl.structuredContent as {
      slices: { functions: string[]; resource: string }[];
      pathCoverage: string;
    };
    expect(slOut.slices.length).toBeGreaterThan(0);
    expect(slOut.slices[0]!.resource).toBe("Project");

    await client.close();
  }, 20000);
});
