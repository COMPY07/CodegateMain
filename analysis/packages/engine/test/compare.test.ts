// Policy parity tests.
// Channel mismatch.

import { describe, it, expect } from "vitest";
import type { SemanticIR, SnapshotId } from "@vibegate/contracts";
import { compare } from "../src/index.js";
import { blk, deleteEffect, fn, nid, span, sym, tenantGuard } from "./ir-builder.js";

// Two-channel module.
function twoChannel(): SemanticIR {
  return {
    schemaVersion: 1,
    snapshot: "snap" as SnapshotId,
    functions: [fn("restDel"), fn("actionDel")],
    entrypoints: [
      {
        nodeId: nid("ep_rest"),
        kind: "route_handler",
        method: "DELETE",
        path: "/api/projects/:id",
        handler: sym("restDel"),
        externallyReachable: true,
        span: span("route.ts"),
      },
      {
        nodeId: nid("ep_action"),
        kind: "server_action",
        handler: sym("actionDel"),
        externallyReachable: true,
        span: span("actions.ts"),
      },
    ],
    effects: [
      { ...deleteEffect("restDel"), nodeId: nid("effect_rest"), block: blk("b0") },
      { ...deleteEffect("actionDel"), nodeId: nid("effect_action"), block: blk("b0") },
    ],
    guards: [tenantGuard("restDel")],
    principalSources: [
      {
        nodeId: nid("principal"),
        tenantClaim: {
          kind: "field",
          base: { kind: "symbol", symbolId: sym("session") },
          path: ["user", "tenantId"],
        },
        span: span("auth.ts"),
      },
    ],
    resources: [{ name: "Project", tenantColumn: "tenantId" }],
    externalPolicies: [],
    callEdges: [],
    analyzedDefenses: ["prismaExtensions","externalPolicies","migrations","wrappers","middleware"],
  };
}

describe("policy parity", () => {
  // Channels disagree.
  it("REST guarded, action unguarded => parity broken", () => {
    const out = compare(twoChannel(), "Project", "DB_DELETE");
    expect(out.parityHolds).toBe(false);
    const byChannel = Object.fromEntries(
      out.channels.map((c) => [c.channel, c.verdict]),
    );
    expect(byChannel["route_handler"]).toBe("REFUTED");
    expect(byChannel["server_action"]).toBe("SUPPORTED");
  });
});
