// MCP server.
// Stdio transport.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  SECURITY_EVIDENCE_TOOL,
  SECURITY_INDEX_TOOL,
  SECURITY_INVENTORY_TOOL,
  SECURITY_PROVE_TOOL,
  SECURITY_SCAN_TOOL,
  SECURITY_SLICE_TOOL,
  SERVER_NAME,
  type SecurityInventoryInput,
  type SecurityProveHandler,
  type SecurityScanInput,
} from "@vibegate/contracts";
import {
  createHandler,
  inventory,
  index,
  slice,
  expandEvidence,
} from "@vibegate/engine";
import { loadIr, loadIrFrom } from "./load-ir.js";
import { scan } from "./scan.js";
import { parseInput, checkOutput, InputError } from "./validate.js";

// Stderr logger.
function log(msg: string): void {
  process.stderr.write(`[vibegate] ${msg}\n`);
}

// Boundary input shape.
const inputShape = {
  // Keep the generated Ajv contract as the semantic validator, but advertise an
  // object at the MCP boundary. `unknown` produced an untyped tool schema and some
  // clients serialized an otherwise valid Proof as a JSON string.
  proof: z.looseObject({}),
  snapshot: z.object({ root: z.string(), snapshotId: z.string() }),
};

// Build the harness.
const handler: SecurityProveHandler = createHandler(loadIr);

// Register and connect.
export async function main(): Promise<void> {
  // Sandbox root required.
  if (!process.env["VIBEGATE_ROOT"]) {
    log("fatal VIBEGATE_ROOT unset");
    process.exit(1);
  }
  const server = new McpServer({ name: SERVER_NAME, version: "0.1.0" });

  server.registerTool(
    SECURITY_PROVE_TOOL,
    {
      title: "Security prove",
      description:
        "Evaluate a security proof obligation over a repository snapshot.",
      inputSchema: inputShape,
    },
    async (args: unknown) => {
      try {
        const input = parseInput(args);
        const output = checkOutput(await handler(input));
        return {
          content: [{ type: "text", text: JSON.stringify(output) }],
          structuredContent: output as unknown as Record<string, unknown>,
        };
      } catch (err) {
        const message = err instanceof InputError ? err.message : String(err);
        log(`error ${message}`);
        return {
          content: [{ type: "text", text: `Error: ${message}` }],
          isError: true,
        };
      }
    },
  );

  // Snapshot-only shape.
  const snapshotShape = {
    snapshot: z.object({ root: z.string(), snapshotId: z.string() }),
  };

  server.registerTool(
    SECURITY_INVENTORY_TOOL,
    {
      title: "Security inventory",
      description: "List external entrypoints and sensitive effects.",
      inputSchema: snapshotShape,
    },
    async (args: unknown) => {
      const input = args as SecurityInventoryInput;
      const ir = await loadIrFrom(input.snapshot.root, input.snapshot.snapshotId);
      const output = inventory(ir);
      return {
        content: [{ type: "text", text: JSON.stringify(output) }],
        structuredContent: output as unknown as Record<string, unknown>,
      };
    },
  );

  server.registerTool(
    SECURITY_INDEX_TOOL,
    {
      title: "Security index",
      description: "Load a repository and summarize the snapshot.",
      inputSchema: snapshotShape,
    },
    async (args: unknown) => {
      const input = args as SecurityInventoryInput;
      const ir = await loadIrFrom(input.snapshot.root, input.snapshot.snapshotId);
      const output = index(ir);
      return {
        content: [{ type: "text", text: JSON.stringify(output) }],
        structuredContent: output as unknown as Record<string, unknown>,
      };
    },
  );

  server.registerTool(
    SECURITY_EVIDENCE_TOOL,
    {
      title: "Security evidence",
      description: "Expand a proof result into path-level source evidence.",
      inputSchema: inputShape,
    },
    async (args: unknown) => {
      try {
        const input = parseInput(args);
        const output = await handler(input);
        const evidence = expandEvidence(output.result);
        return {
          content: [{ type: "text", text: JSON.stringify(evidence) }],
          structuredContent: evidence as unknown as Record<string, unknown>,
        };
      } catch (err) {
        const message = err instanceof InputError ? err.message : String(err);
        log(`error ${message}`);
        return {
          content: [{ type: "text", text: `Error: ${message}` }],
          isError: true,
        };
      }
    },
  );

  server.registerTool(
    SECURITY_SLICE_TOOL,
    {
      title: "Security slice",
      description: "List call-path slices reaching a target effect.",
      inputSchema: inputShape,
    },
    async (args: unknown) => {
      try {
        const input = parseInput(args);
        const ir = await loadIrFrom(
          input.snapshot.root,
          input.snapshot.snapshotId,
        );
        const output = slice(ir, input);
        return {
          content: [{ type: "text", text: JSON.stringify(output) }],
          structuredContent: output as unknown as Record<string, unknown>,
        };
      } catch (err) {
        const message = err instanceof InputError ? err.message : String(err);
        log(`error ${message}`);
        return {
          content: [{ type: "text", text: `Error: ${message}` }],
          isError: true,
        };
      }
    },
  );

  server.registerTool(
    SECURITY_SCAN_TOOL,
    {
      title: "Security scan",
      description: "Rule-based scan for misconfiguration and secrets.",
      inputSchema: snapshotShape,
    },
    async (args: unknown) => {
      const input = args as SecurityScanInput;
      const output = await scan(input.snapshot.root);
      return {
        content: [{ type: "text", text: JSON.stringify(output) }],
        structuredContent: output as unknown as Record<string, unknown>,
      };
    },
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
  log("connected stdio");
}

process.on("uncaughtException", (err) => {
  log(`uncaught ${String(err)}`);
  process.exit(1);
});

void main();
