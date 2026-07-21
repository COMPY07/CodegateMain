// Proof IR.
// Agent authored.

import type { EffectKind, SymbolId, ValueRef } from "./primitives.js";

// Proof template.
export type ProofTemplate =
  | "EFFECT_REQUIRES_RELATION"
  | "DATA_REACHES_INTERPRETER"
  | "EFFECT_REQUIRES_STATE"
  | "BOUNDARY_PRESERVES_PROPERTY"
  | "EXCEPTION_FAILS_CLOSED"
  | "WEBHOOK_SIGNATURE_REQUIRED"
  | "POLICY_PARITY";

// Claimed principal.
export interface Attacker {
  readonly principalType: "authenticated_user" | "anonymous";
  readonly constraints: readonly string[];
}

// Entrypoint reference.
export interface EntrypointRef {
  readonly nodeId: string;
}

// Controlled input.
export interface AttackerControl {
  readonly value: ValueRef;
  readonly semanticRole: "resource_identifier" | "query_fragment" | "redirect_target";
}

// Effect target.
export interface TargetEffect {
  readonly kind: EffectKind;
  readonly resource: string;
}

// Required relation.
export interface RequiredInvariant {
  readonly kind: "RELATION_ESTABLISHED" | "BLOCKING_GUARD";
  readonly left?: ValueRef;
  readonly op?: "EQ" | "NEQ";
  readonly right?: ValueRef;
  readonly predicate?: string;
}

// Analysis scope.
export interface AnalysisScope {
  readonly buildProfile: "production" | "development";
  readonly includeMiddleware: boolean;
  readonly includeOrmExtensions: boolean;
  readonly includeDatabasePolicies: boolean;
  readonly maximumCallDepth: number;
}

// Relation proof.
export interface EffectRequiresRelationProof {
  readonly claim: "EXISTS_VIOLATING_PATH";
  readonly template: "EFFECT_REQUIRES_RELATION";
  readonly attacker: Attacker;
  readonly entrypoint: EntrypointRef;
  readonly attackerControl: readonly AttackerControl[];
  readonly targetEffect: TargetEffect;
  readonly requiredInvariants: readonly RequiredInvariant[];
  readonly analysisScope: AnalysisScope;
  readonly subjectSymbol?: SymbolId;
}

// Interpreter proof.
export interface DataReachesInterpreterProof {
  readonly claim: "EXISTS_VIOLATING_PATH";
  readonly template: "DATA_REACHES_INTERPRETER";
  readonly attacker: Attacker;
  readonly entrypoint: EntrypointRef;
  readonly attackerControl: readonly AttackerControl[];
  readonly targetEffect: TargetEffect;
  readonly requiredInvariants: readonly RequiredInvariant[];
  readonly analysisScope: AnalysisScope;
  readonly subjectSymbol?: SymbolId;
}

// State proof.
export interface EffectRequiresStateProof {
  readonly claim: "EXISTS_VIOLATING_PATH";
  readonly template: "EFFECT_REQUIRES_STATE";
  readonly attacker: Attacker;
  readonly entrypoint: EntrypointRef;
  readonly attackerControl: readonly AttackerControl[];
  readonly targetEffect: TargetEffect;
  readonly requiredInvariants: readonly RequiredInvariant[];
  readonly requiredState: { readonly field: string; readonly value: string };
  readonly analysisScope: AnalysisScope;
  readonly subjectSymbol?: SymbolId;
}

// Boundary proof.
export interface BoundaryPreservesPropertyProof {
  readonly claim: "EXISTS_VIOLATING_PATH";
  readonly template: "BOUNDARY_PRESERVES_PROPERTY";
  readonly attacker: Attacker;
  readonly entrypoint: EntrypointRef;
  readonly attackerControl: readonly AttackerControl[];
  readonly targetEffect: TargetEffect;
  readonly requiredInvariants: readonly RequiredInvariant[];
  readonly allowlist: readonly string[];
  readonly analysisScope: AnalysisScope;
  readonly subjectSymbol?: SymbolId;
}

// Fail-closed proof.
export interface ExceptionFailsClosedProof {
  readonly claim: "EXISTS_VIOLATING_PATH";
  readonly template: "EXCEPTION_FAILS_CLOSED";
  readonly attacker: Attacker;
  readonly entrypoint: EntrypointRef;
  readonly attackerControl: readonly AttackerControl[];
  readonly targetEffect: TargetEffect;
  readonly requiredInvariants: readonly RequiredInvariant[];
  readonly analysisScope: AnalysisScope;
  readonly subjectSymbol?: SymbolId;
}

// Webhook signature proof.
export interface WebhookSignatureProof {
  readonly claim: "EXISTS_VIOLATING_PATH";
  readonly template: "WEBHOOK_SIGNATURE_REQUIRED";
  readonly attacker: Attacker;
  readonly entrypoint: EntrypointRef;
  readonly attackerControl: readonly AttackerControl[];
  readonly targetEffect: TargetEffect;
  readonly requiredInvariants: readonly RequiredInvariant[];
  readonly analysisScope: AnalysisScope;
  readonly subjectSymbol?: SymbolId;
}

// Proof union.
export type Proof =
  | EffectRequiresRelationProof
  | DataReachesInterpreterProof
  | EffectRequiresStateProof
  | BoundaryPreservesPropertyProof
  | ExceptionFailsClosedProof
  | WebhookSignatureProof;
