// State proof tests.
// Effect requires state.

import { describe, it, expect } from "vitest";
import type {
  GuardIR,
  SecurityProveInput,
  SemanticIR,
  SnapshotId,
} from "@vibegate/contracts";
import { analyze } from "../src/index.js";
import { blk, fn, nid, span, sym } from "./ir-builder.js";

// Refund effect module.
function refundModule(withStateGuard: boolean): SemanticIR {
  const guards: GuardIR[] = withStateGuard
    ? [
        {
          nodeId: nid("guard_state"),
          predicate: {
            left: { kind: "field", base: { kind: "symbol", symbolId: sym("order") }, path: ["paymentState"] },
            op: "EQ",
            right: { kind: "literal", value: "PAID" },
            evidence: { span: span("route.ts"), note: "paid check" },
          },
          inFunction: sym("refund"),
          block: blk("b0"),
          establishes: "resource_state",
        },
      ]
    : [];
  return {
    schemaVersion: 1,
    snapshot: "snap" as SnapshotId,
    functions: [fn("refund")],
    entrypoints: [
      {
        nodeId: nid("ep_refund"),
        kind: "route_handler",
        method: "POST",
        path: "/api/orders/:id/refund",
        handler: sym("refund"),
        externallyReachable: true,
        span: span("route.ts"),
      },
    ],
    effects: [
      {
        nodeId: nid("effect_refund"),
        effectKind: "STATE_TRANSITION",
        resource: "Order",
        selector: { kind: "field", base: { kind: "symbol", symbolId: sym("params") }, path: ["id"] },
        inFunction: sym("refund"),
        block: blk("b0"),
        span: span("route.ts"),
      },
    ],
    guards,
    principalSources: [],
    resources: [{ name: "Order" }],
    externalPolicies: [],
    callEdges: [],
    analyzedDefenses: ["prismaExtensions","externalPolicies","migrations","wrappers","middleware"],
  };
}

// State proof input.
function stateProof(): SecurityProveInput {
  return {
    proof: {
      claim: "EXISTS_VIOLATING_PATH",
      template: "EFFECT_REQUIRES_STATE",
      attacker: { principalType: "authenticated_user", constraints: [] },
      entrypoint: { nodeId: "ep_refund" },
      attackerControl: [],
      targetEffect: { kind: "STATE_TRANSITION", resource: "Order" },
      requiredInvariants: [],
      requiredState: { field: "paymentState", value: "PAID" },
      analysisScope: {
        buildProfile: "production",
        includeMiddleware: true,
        includeOrmExtensions: true,
        includeDatabasePolicies: true,
        maximumCallDepth: 12,
      },
    },
    snapshot: { root: ".", snapshotId: "snap" },
  };
}

describe("effect requires state", () => {
  // Missing state check.
  it("refund without paid check => SUPPORTED", () => {
    expect(analyze(refundModule(false), stateProof()).result.verdict).toBe(
      "SUPPORTED",
    );
  });

  // State check present.
  it("refund guarded by paid check => REFUTED", () => {
    expect(analyze(refundModule(true), stateProof()).result.verdict).toBe(
      "REFUTED",
    );
  });
});
