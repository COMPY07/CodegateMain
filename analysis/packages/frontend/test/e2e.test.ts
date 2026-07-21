// E2E pipeline.
// Source to verdict.

import { describe, it, expect } from "vitest";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  ExternalPolicyIR,
  SecurityProveInput,
  Verdict,
} from "@vibegate/contracts";
import { analyze } from "@vibegate/engine";
import { extractProgram, clientId } from "../src/index.js";

const here = dirname(fileURLToPath(import.meta.url));

// Scope to entrypoint.
function alignEntrypoint(
  input: SecurityProveInput,
  nodeId: string | undefined,
): void {
  if (nodeId) {
    (input.proof.entrypoint as { nodeId: string }).nodeId = nodeId;
  }
}

// Route file path.
function routeFile(dir: string): string {
  return resolve(here, "e2e", dir, "app/api/projects/[id]/route.ts");
}

// Standard proof.
function proof(): SecurityProveInput {
  return {
    proof: {
      claim: "EXISTS_VIOLATING_PATH",
      template: "EFFECT_REQUIRES_RELATION",
      attacker: { principalType: "authenticated_user", constraints: [] },
      entrypoint: { nodeId: "ep_delete" },
      attackerControl: [
        {
          value: {
            kind: "field",
            base: { kind: "symbol", symbolId: "params" as never },
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
    },
    snapshot: { root: ".", snapshotId: "snap" },
  };
}

// Run full pipeline.
function runPipeline(
  dir: string,
  policies: ExternalPolicyIR[],
  extraFiles: readonly string[] = [],
): Verdict {
  const files = [
    routeFile(dir),
    ...extraFiles.map((f) => resolve(here, "e2e", dir, f)),
  ];
  const ir = extractProgram(files, policies, "snap");
  const input = proof();
  alignEntrypoint(input, ir.entrypoints[0]?.nodeId);
  // Align attacker control.
  const effect = ir.effects[0];
  if (effect) {
    (input.proof.attackerControl as unknown[])[0] = {
      value: effect.selector,
      semanticRole: "resource_identifier",
    };
    // Align target effect.
    (input.proof.targetEffect as { kind: string; resource: string }).kind =
      effect.effectKind;
    (input.proof.targetEffect as { kind: string; resource: string }).resource =
      effect.resource;
  }
  return analyze(ir, input).result.verdict;
}

describe("E2E source pipeline", () => {
  // E1 vulnerable.
  it("E1 id-only delete => SUPPORTED", () => {
    expect(runPipeline("e1-id-only", [])).toBe("SUPPORTED");
  });

  it("JavaScript route id-only delete => SUPPORTED", () => {
    const file = resolve(
      here,
      "e2e/ejs1-id-only/app/api/projects/[id]/route.js",
    );
    const ir = extractProgram([file], [], "snap-js");
    const input = proof();
    alignEntrypoint(input, ir.entrypoints[0]?.nodeId);
    const effect = ir.effects[0]!;
    (input.proof.attackerControl as unknown[])[0] = {
      value: effect.selector,
      semanticRole: "resource_identifier",
    };
    (input.proof.targetEffect as { kind: string; resource: string }).kind =
      effect.effectKind;
    (input.proof.targetEffect as { kind: string; resource: string }).resource =
      effect.resource;
    expect(analyze(ir, input).result.verdict).toBe("SUPPORTED");
  });

  // E2 inline scope.
  it("E2 inline tenant delete => REFUTED", () => {
    expect(runPipeline("e2-inline-tenant", [])).toBe("REFUTED");
  });

  // E3 scoped extension.
  it("E3 exact prisma extension => REFUTED", () => {
    const client = { kind: "symbol", symbolId: clientId("scopedClient") } as const;
    const policies: ExternalPolicyIR[] = [
      {
        kind: "PRISMA_EXTENSION",
        resource: "Project",
        status: "RESOLVED",
        clientRef: client,
        prismaFacts: {
          exactClientUsed: true,
          appliesToTargetEffect: true,
          addsRequiredRelation: true,
          noBypassingPath: true,
        },
        evidence: { span: { file: "db-scoped.ts", start: 0, end: 1 }, note: "ext" },
      },
    ];
    expect(runPipeline("e3-extension", policies)).toBe("REFUTED");
  });

  // E4 unresolved client.
  it("E4 unresolved client => INCONCLUSIVE", () => {
    expect(runPipeline("e4-unresolved-client", [])).toBe("INCONCLUSIVE");
  });

  // E11 unresolved call.
  it("E11 unresolved project call => INCONCLUSIVE", () => {
    expect(runPipeline("e11-unresolved-call", [])).toBe("INCONCLUSIVE");
  });

  // E5 interprocedural.
  it("E5 route -> service -> prisma => SUPPORTED", () => {
    expect(
      runPipeline("e5-interprocedural", [], ["lib/project-service.ts"]),
    ).toBe("SUPPORTED");
  });

  // E6 fail-open.
  it("E6 guard swallowed by catch => SUPPORTED", () => {
    expect(runPipeline("e6-fail-open", [])).toBe("SUPPORTED");
  });

  // E7 fails closed.
  it("E7 guard throws unguarded => REFUTED", () => {
    expect(runPipeline("e7-guarded-throw", [])).toBe("REFUTED");
  });
});

// Interpreter proof.
function interpreterProof(
  kind: "RAW_SQL_EXECUTE" | "HTML_RENDER",
  resource: string,
): SecurityProveInput {
  return {
    proof: {
      claim: "EXISTS_VIOLATING_PATH",
      template: "DATA_REACHES_INTERPRETER",
      attacker: { principalType: "anonymous", constraints: [] },
      entrypoint: { nodeId: "x" },
      attackerControl: [],
      targetEffect: { kind, resource },
      requiredInvariants: [{ kind: "BLOCKING_GUARD", predicate: "safe syntax" }],
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

// Run interpreter pipeline.
function runInterpreter(
  file: string,
  kind: "RAW_SQL_EXECUTE" | "HTML_RENDER",
  resource: string,
): Verdict {
  const abs = resolve(here, "e2e", file);
  const ir = extractProgram([abs], [], "snap");
  const input = interpreterProof(kind, resource);
  alignEntrypoint(input, ir.entrypoints[0]?.nodeId);
  return analyze(ir, input).result.verdict;
}

describe("E2E interpreter pipeline", () => {
  // ES1 sqli vulnerable.
  it("ES1 queryRawUnsafe tainted => SUPPORTED", () => {
    expect(
      runInterpreter(
        "es1-sqli-unsafe/app/api/search/route.ts",
        "RAW_SQL_EXECUTE",
        "Database",
      ),
    ).toBe("SUPPORTED");
  });

  // ES2 sqli safe.
  it("ES2 queryRaw parameterized => REFUTED", () => {
    expect(
      runInterpreter(
        "es2-sqli-safe/app/api/search/route.ts",
        "RAW_SQL_EXECUTE",
        "Database",
      ),
    ).toBe("REFUTED");
  });

  // ES3 xss vulnerable.
  it("ES3 dangerouslySetInnerHTML tainted => SUPPORTED", () => {
    expect(
      runInterpreter(
        "es3-xss-unsafe/app/posts/[id]/page.tsx",
        "HTML_RENDER",
        "Response",
      ),
    ).toBe("SUPPORTED");
  });

  // ES4 xss safe.
  it("ES4 sanitized html => REFUTED", () => {
    expect(
      runInterpreter(
        "es4-xss-safe/app/posts/[id]/page.tsx",
        "HTML_RENDER",
        "Response",
      ),
    ).toBe("REFUTED");
  });

  // Unknown wrapper.
  it("ES5 unknown sanitizer wrapper => INCONCLUSIVE", () => {
    expect(
      runInterpreter(
        "es5-xss-unknown-wrapper/app/posts/[id]/page.tsx",
        "HTML_RENDER",
        "Response",
      ),
    ).toBe("INCONCLUSIVE");
  });
});

// Boundary proof.
function boundaryProof(): SecurityProveInput {
  return {
    proof: {
      claim: "EXISTS_VIOLATING_PATH",
      template: "BOUNDARY_PRESERVES_PROPERTY",
      attacker: { principalType: "anonymous", constraints: [] },
      entrypoint: { nodeId: "x" },
      attackerControl: [],
      targetEffect: { kind: "REDIRECT", resource: "Location" },
      requiredInvariants: [],
      allowlist: ["/home", "/dashboard"],
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

// Run redirect pipeline.
function runRedirect(file: string): Verdict {
  const abs = resolve(here, "e2e", file);
  const ir = extractProgram([abs], [], "snap");
  const input = boundaryProof();
  alignEntrypoint(input, ir.entrypoints[0]?.nodeId);
  return analyze(ir, input).result.verdict;
}

describe("open redirect pipeline", () => {
  // ER1 tainted destination.
  it("ER1 tainted redirect => SUPPORTED", () => {
    expect(runRedirect("er1-redirect-unsafe/app/api/go/route.ts")).toBe(
      "SUPPORTED",
    );
  });

  // ER2 allowlisted.
  it("ER2 allowlisted redirect => REFUTED", () => {
    expect(runRedirect("er2-redirect-safe/app/api/go/route.ts")).toBe(
      "REFUTED",
    );
  });
});

describe("metamorphic invariance", () => {
  // Renamed keeps verdict.
  it("E8 renamed/aliased/branched == E1 => SUPPORTED", () => {
    expect(runPipeline("e8-renamed", [])).toBe("SUPPORTED");
  });

  // Wrapped keeps verdict.
  it("E5 service wrapper == E1 => SUPPORTED", () => {
    expect(
      runPipeline("e5-interprocedural", [], ["lib/project-service.ts"]),
    ).toBe("SUPPORTED");
  });

  // Early-return dominance.
  it("E9 early-return guard => REFUTED", () => {
    expect(runPipeline("e9-early-return", [])).toBe("REFUTED");
  });

  // Else branch bypass.
  it("E10 else-branch bypass => SUPPORTED", () => {
    expect(runPipeline("e10-else-bypass", [])).toBe("SUPPORTED");
  });
});

describe("write CRUD coverage", () => {
  // Update without scope.
  it("E12 update idor => SUPPORTED", () => {
    expect(runPipeline("e12-update-idor", [])).toBe("SUPPORTED");
  });

  // Update tenant scoped.
  it("E13 update scoped => REFUTED", () => {
    expect(runPipeline("e13-update-scoped", [])).toBe("REFUTED");
  });
});

// Verdict at entrypoint.
function verdictAt(
  files: readonly string[],
  handlerMatch: string,
): Verdict {
  const ir = extractProgram(files, [], "snap");
  const entry = ir.entrypoints.find((e) =>
    e.span.file.includes(handlerMatch),
  );
  const effect = ir.effects.find((f) => f.inFunction === entry?.handler);
  const input = proof();
  alignEntrypoint(input, entry?.nodeId);
  if (effect) {
    (input.proof.attackerControl as unknown[])[0] = {
      value: effect.selector,
      semanticRole: "resource_identifier",
    };
  }
  return analyze(ir, input).result.verdict;
}

describe("symbol resolution", () => {
  const safe = resolve(
    here,
    "e2e/e14-name-collision/safe/app/api/projects/[id]/route.ts",
  );
  const unsafe = resolve(
    here,
    "e2e/e14-name-collision/unsafe/app/api/projects/[id]/route.ts",
  );

  // Same-name helpers distinct.
  it("E14 collision keeps safe REFUTED", () => {
    expect(verdictAt([safe, unsafe], "/safe/")).toBe("REFUTED");
  });

  // Same-name helpers distinct.
  it("E14 collision keeps unsafe SUPPORTED", () => {
    expect(verdictAt([safe, unsafe], "/unsafe/")).toBe("SUPPORTED");
  });
});

describe("interprocedural value flow", () => {
  // Session tenant passed.
  it("E15 tenant passthrough => REFUTED", () => {
    expect(
      runPipeline("e15-tenant-passthrough", [], ["lib/svc.ts"]),
    ).toBe("REFUTED");
  });

  // Attacker tenant passed.
  it("E16 forged tenant => SUPPORTED", () => {
    expect(
      runPipeline("e16-tenant-forged", [], ["lib/svc.ts"]),
    ).toBe("SUPPORTED");
  });
});

describe("conservative verdicts", () => {
  // Data tenant unsafe.
  it("E17 data.tenantId => SUPPORTED", () => {
    expect(runPipeline("e17-data-tenant", [])).toBe("SUPPORTED");
  });

  // Unreachable delete excluded.
  it("E18 unreachable delete => INCONCLUSIVE", () => {
    expect(runPipeline("e18-unreachable", [])).toBe("INCONCLUSIVE");
  });

  // Missing entrypoint inconclusive.
  it("missing entrypoint => INCONCLUSIVE", () => {
    const ir = extractProgram(
      [routeFile("e1-id-only")],
      [],
      "snap",
    );
    const input = proof();
    alignEntrypoint(input, "ep_absent");
    const effect = ir.effects[0]!;
    (input.proof.attackerControl as unknown[])[0] = {
      value: effect.selector,
      semanticRole: "resource_identifier",
    };
    expect(analyze(ir, input).result.verdict).toBe("INCONCLUSIVE");
  });

  // Differing caller sources.
  it("E19 divergent tenant callers => INCONCLUSIVE", () => {
    const svc = resolve(here, "e2e/e19-shared-helper/lib/svc.ts");
    const safe = resolve(
      here,
      "e2e/e19-shared-helper/safe/app/api/projects/[id]/route.ts",
    );
    const unsafe = resolve(
      here,
      "e2e/e19-shared-helper/unsafe/app/api/projects/[id]/route.ts",
    );
    expect(verdictAt([safe, unsafe, svc], "/safe/")).toBe("INCONCLUSIVE");
  });

  // Extension unknown.
  it("E20 unknown extension => INCONCLUSIVE", () => {
    expect(runPipeline("e20-unknown-extension", [])).toBe("INCONCLUSIVE");
  });

  // Middleware unknown.
  it("E21 unknown middleware => INCONCLUSIVE", () => {
    expect(
      runPipeline("e21-unknown-middleware", [], ["middleware.ts"]),
    ).toBe("INCONCLUSIVE");
  });

  // Helper unreachable.
  it("E22 unreachable helper => INCONCLUSIVE", () => {
    expect(
      runPipeline("e22-unreachable-helper", [], ["lib/svc.ts"]),
    ).toBe("INCONCLUSIVE");
  });

  // Guard effect-bound.
  it("E23 unrelated scoped effect => SUPPORTED", () => {
    expect(runPipeline("e23-effect-bound-guard", [])).toBe("SUPPORTED");
  });
});

// Webhook proof.
function webhookProof(): SecurityProveInput {
  return {
    proof: {
      claim: "EXISTS_VIOLATING_PATH",
      template: "WEBHOOK_SIGNATURE_REQUIRED",
      attacker: { principalType: "anonymous", constraints: [] },
      entrypoint: { nodeId: "x" },
      attackerControl: [],
      targetEffect: { kind: "DB_DELETE", resource: "Project" },
      requiredInvariants: [],
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

// Run webhook pipeline.
function runWebhook(file: string): Verdict {
  const abs = resolve(here, "e2e", file);
  const ir = extractProgram([abs], [], "snap");
  const input = webhookProof();
  alignEntrypoint(input, ir.entrypoints[0]?.nodeId);
  return analyze(ir, input).result.verdict;
}

describe("E2E webhook pipeline", () => {
  // Unsigned webhook.
  it("EW1 no signature check => SUPPORTED", () => {
    expect(
      runWebhook("ew1-webhook-unsigned/app/api/webhook/route.ts"),
    ).toBe("SUPPORTED");
  });

  // Signed webhook.
  it("EW2 signature verified => REFUTED", () => {
    expect(
      runWebhook("ew2-webhook-signed/app/api/webhook/route.ts"),
    ).toBe("REFUTED");
  });
});
