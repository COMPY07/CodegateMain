// Relation analysis.
// Per-path facts.

import type {
  DefenseCandidate,
  EffectIR,
  EvidenceRef,
  ExternalPolicyIR,
  ObligationStatus,
  PathProof,
  PrincipalSourceIR,
  Proof,
  PropertyResult,
  RequiredSecurityProperty,
  SemanticIR,
  SymbolId,
  UnresolvedBoundary,
  ValueRef,
} from "@vibegate/contracts";
import { clientResolved, sameClient, valueRefEqual } from "./value-flow.js";

// One effect path.
export interface EffectPath {
  readonly pathId: string;
  readonly effect: EffectIR;
  readonly guardBlocks: readonly string[];
  readonly relationOnPath: boolean;
  readonly bypassesExtension: boolean;
  readonly functions: readonly SymbolId[];
  readonly hasUnresolved: boolean;
}

// Extension applicability.
// Four conditions.
function extensionFacts(
  policy: ExternalPolicyIR,
  effect: EffectIR,
  path: EffectPath,
): DefenseCandidate {
  const evidence: EvidenceRef[] = [policy.evidence];
  const facts = policy.prismaFacts;
  const exactClient =
    (facts?.exactClientUsed ?? false) &&
    sameClient(policy.clientRef, effect.clientSymbol);
  const applies = facts?.appliesToTargetEffect ?? false;
  const addsRelation = facts?.addsRequiredRelation ?? false;
  const noBypass = (facts?.noBypassingPath ?? false) && !path.bypassesExtension;
  const allFour = exactClient && applies && addsRelation && noBypass;
  return {
    kind: "EXTERNAL_POLICY",
    verdict: allFour ? "BLOCKING" : "NON_BLOCKING",
    evidence,
    rationale: allFour
      ? "extension scopes tenant"
      : "extension not applicable",
  };
}

// Row policy applicability.
// Facts drive verdict.
function rowPolicyFacts(
  policy: ExternalPolicyIR,
  path: EffectPath,
): DefenseCandidate {
  const facts = policy.rlsFacts;
  const noBypass = (facts?.noBypassingPath ?? false) && !path.bypassesExtension;
  const blocking =
    (facts?.tableMatches ?? false) &&
    (facts?.tenantPredicatePresent ?? false) &&
    (facts?.forceApplied ?? false) &&
    noBypass;
  return {
    kind: "EXTERNAL_POLICY",
    verdict: blocking ? "BLOCKING" : "NON_BLOCKING",
    evidence: [policy.evidence],
    rationale: blocking ? "row policy scopes tenant" : "row policy not applicable",
  };
}

// Resolve principal claim.
function principalClaim(ir: SemanticIR): PrincipalSourceIR | undefined {
  return ir.principalSources[0];
}

// Ambiguous guard source.
// Callers disagree.
function ambiguousBoundGuard(
  ir: SemanticIR,
  fnId: SymbolId,
): boolean {
  const claim = ir.principalSources[0]?.tenantClaim;
  if (!claim) return false;
  for (const g of ir.guards) {
    if (g.inFunction !== fnId) continue;
    if (g.establishes !== "resource_relation") continue;
    if (g.boundParam === undefined) continue;
    const callers = ir.callEdges.filter((e) => e.callee === fnId);
    let anyHold = false;
    let anyFail = false;
    for (const edge of callers) {
      const flow = edge.argFlows.find((a) => a.argIndex === g.boundParam);
      if (flow !== undefined && valueRefEqual(flow.value, claim)) anyHold = true;
      else anyFail = true;
    }
    if (anyHold && anyFail) return true;
  }
  return false;
}

// Route param selector.
function selectorIsRouteParam(selector: ValueRef): boolean {
  if (selector.kind !== "field") return false;
  if (!selector.path.includes("id")) return false;
  return selector.base.kind === "symbol";
}

// Build per-path proofs.
export function buildPathProofs(
  ir: SemanticIR,
  proof: Proof,
  paths: readonly EffectPath[],
): readonly PathProof[] {
  const principal = principalClaim(ir);
  return paths.map((path) => {
    const effect = path.effect;
    const entryFn = path.functions[0] ?? effect.inFunction;
    const entrypoint = ir.entrypoints.find((e) => e.handler === entryFn);
    const entrypointReachable: ObligationStatus =
      entrypoint?.externallyReachable ? "PROVEN" : "NOT_ESTABLISHED";

    const taintDriven =
      proof.template === "DATA_REACHES_INTERPRETER" ||
      proof.template === "BOUNDARY_PRESERVES_PROPERTY";
    const controlled = taintDriven
      ? effect.interpreterSafety === "TAINTED"
      : proof.attackerControl.some((c) =>
          valueRefEqual(c.value, effect.selector),
        ) || selectorIsRouteParam(effect.selector);
    const attackerControlsSelector: ObligationStatus = controlled
      ? "PROVEN"
      : "NOT_ESTABLISHED";

    const effectReachable: ObligationStatus = "PROVEN";

    // Template property status.
    const relationProven = path.relationOnPath || hasBlockingPolicy(ir, effect, path);
    const propertyResults: PropertyResult[] = templateProperty(
      proof,
      ir,
      effect,
      relationProven,
    );

    const defenses: DefenseCandidate[] = [];
    const unresolved: UnresolvedBoundary[] = [];

    // Ambiguous tenant source.
    if (path.functions.some((f) => ambiguousBoundGuard(ir, f))) {
      unresolved.push({
        reason: "AMBIGUOUS_GUARD_SOURCE",
        resource: effect.resource,
        critical: true,
        evidence: [{ span: effect.span, note: "callers disagree" }],
        rationale: "tenant source varies by caller",
      });
    }

    // Unresolved call boundary.
    if (path.hasUnresolved) {
      unresolved.push({
        reason: "UNRESOLVED_CALL_EDGE",
        resource: effect.resource,
        critical: true,
        evidence: [{ span: effect.span, note: "unresolved call" }],
        rationale: "call edge unresolved",
      });
    }

    // Unresolved client boundary.
    if (effect.clientSymbol && !clientResolved(effect.clientSymbol)) {
      unresolved.push({
        reason: "UNRESOLVED_PRISMA_CLIENT",
        resource: effect.resource,
        critical: true,
        evidence: [{ span: effect.span, note: "client unresolved" }],
        rationale: "cannot resolve client",
      });
    }

    // External policy defenses.
    for (const policy of ir.externalPolicies) {
      if (policy.resource !== effect.resource) continue;
      if (policy.status === "DECLARED_BUT_UNAVAILABLE") {
        unresolved.push({
          reason: "EXTERNAL_POLICY_DECLARED",
          resource: policy.resource,
          critical: true,
          evidence: [policy.evidence],
          rationale: "policy unavailable",
        });
        continue;
      }
      if (policy.status === "RESOLVED_NOT_APPLICABLE") continue;
      if (policy.kind === "PRISMA_EXTENSION") {
        defenses.push(extensionFacts(policy, effect, path));
      } else {
        defenses.push(rowPolicyFacts(policy, path));
      }
    }

    // Inline relation defense.
    if (path.relationOnPath && principal) {
      defenses.push({
        kind: "BLOCKING_GUARD",
        verdict: "BLOCKING",
        evidence: [{ span: effect.span, note: "inline tenant scope" }],
        rationale: "selector bound to tenant",
      });
    }

    const sourcePath: EvidenceRef[] = [
      ...(entrypoint ? [{ span: entrypoint.span, note: "entrypoint" }] : []),
      { span: effect.span, note: "effect" },
    ];

    return {
      pathId: path.pathId as PathProof["pathId"],
      entrypointReachable,
      attackerControlsSelector,
      effectReachable,
      propertyResults,
      defenses,
      unresolved,
      sourcePath,
    };
  });
}

// Interpreter safety property.
// Property by template.
function templateProperty(
  proof: Proof,
  ir: SemanticIR,
  effect: EffectIR,
  relationProven: boolean,
): PropertyResult[] {
  if (proof.template === "DATA_REACHES_INTERPRETER") {
    return interpreterProperty(effect);
  }
  if (proof.template === "EFFECT_REQUIRES_STATE") {
    return stateProperty(proof, ir, effect);
  }
  if (proof.template === "BOUNDARY_PRESERVES_PROPERTY") {
    return destinationProperty(proof, effect);
  }
  if (proof.template === "EXCEPTION_FAILS_CLOSED") {
    return authFailsClosedProperty(ir, effect);
  }
  if (proof.template === "WEBHOOK_SIGNATURE_REQUIRED") {
    return signatureProperty(ir, effect);
  }
  return [
    {
      property: { kind: "SAME_TENANT" },
      status: relationProven ? "PROVEN" : "NOT_ESTABLISHED",
      evidence: [{ span: effect.span, note: "tenant property" }],
    },
  ];
}

// State guard property.
function stateProperty(
  proof: Extract<Proof, { template: "EFFECT_REQUIRES_STATE" }>,
  ir: SemanticIR,
  effect: EffectIR,
): PropertyResult[] {
  const proven = ir.guards.some(
    (g) =>
      g.inFunction === effect.inFunction &&
      g.establishes === "resource_state" &&
      !g.failOpen,
  );
  return [
    {
      property: {
        kind: "RESOURCE_STATE",
        field: proof.requiredState.field,
        requiredValue: proof.requiredState.value,
      },
      status: proven ? "PROVEN" : "NOT_ESTABLISHED",
      evidence: [{ span: effect.span, note: "state property" }],
    },
  ];
}

// Authorization fails closed.
function authFailsClosedProperty(
  ir: SemanticIR,
  effect: EffectIR,
): PropertyResult[] {
  const authGuards = ir.guards.filter(
    (g) =>
      g.inFunction === effect.inFunction &&
      (g.establishes === "authentication" ||
        g.establishes === "resource_relation"),
  );
  let status: PropertyResult["status"];
  if (authGuards.length === 0) status = "UNKNOWN";
  else if (authGuards.some((g) => g.failOpen)) status = "NOT_ESTABLISHED";
  else status = "PROVEN";
  return [
    {
      property: { kind: "AUTHORIZATION_FAILS_CLOSED" },
      status,
      evidence: [{ span: effect.span, note: "authorization guard" }],
    },
  ];
}

// Signature verified.
function signatureProperty(
  ir: SemanticIR,
  effect: EffectIR,
): PropertyResult[] {
  const sigGuards = ir.guards.filter(
    (g) =>
      g.inFunction === effect.inFunction &&
      g.establishes === "signature_verified",
  );
  let status: PropertyResult["status"];
  if (sigGuards.length === 0) status = "NOT_ESTABLISHED";
  else if (sigGuards.some((g) => g.failOpen)) status = "NOT_ESTABLISHED";
  else status = "PROVEN";
  return [
    {
      property: { kind: "SIGNATURE_VERIFIED" },
      status,
      evidence: [{ span: effect.span, note: "signature guard" }],
    },
  ];
}

// Redirect destination safe.
function destinationProperty(
  proof: Extract<Proof, { template: "BOUNDARY_PRESERVES_PROPERTY" }>,
  effect: EffectIR,
): PropertyResult[] {
  const safety = effect.interpreterSafety;
  let status: PropertyResult["status"];
  if (safety === "TAINTED") status = "NOT_ESTABLISHED";
  else if (safety === "SANITIZED" || safety === "CONSTANT") status = "PROVEN";
  else status = "UNKNOWN";
  return [
    {
      property: {
        kind: "DESTINATION_CONSTRAINED",
        allowlist: proof.allowlist,
      },
      status,
      evidence: [{ span: effect.span, note: "destination safety" }],
    },
  ];
}

// SQL or HTML.
function interpreterProperty(effect: EffectIR): PropertyResult[] {
  const ctx = effect.interpreterContext;
  const safety = effect.interpreterSafety;
  const property: RequiredSecurityProperty =
    ctx === "HTML_BODY"
      ? { kind: "OUTPUT_SAFE_FOR_CONTEXT", context: "HTML_BODY" }
      : {
          kind: "INPUT_CANNOT_CONTROL_INTERPRETER_SYNTAX",
          interpreter: ctx === "SHELL" ? "SHELL" : "SQL",
        };
  let status: PropertyResult["status"];
  if (safety === "TAINTED") status = "NOT_ESTABLISHED";
  else if (
    safety === "PARAMETERIZED" ||
    safety === "CONSTANT" ||
    safety === "SANITIZED"
  )
    status = "PROVEN";
  else status = "UNKNOWN";
  return [
    {
      property,
      status,
      evidence: [{ span: effect.span, note: "interpreter safety" }],
    },
  ];
}

// Applicable blocking policy.
function hasBlockingPolicy(
  ir: SemanticIR,
  effect: EffectIR,
  path: EffectPath,
): boolean {
  for (const policy of ir.externalPolicies) {
    if (policy.resource !== effect.resource) continue;
    if (policy.status !== "RESOLVED") continue;
    const candidate =
      policy.kind === "PRISMA_EXTENSION"
        ? extensionFacts(policy, effect, path)
        : rowPolicyFacts(policy, path);
    if (candidate.verdict === "BLOCKING") return true;
  }
  return false;
}
