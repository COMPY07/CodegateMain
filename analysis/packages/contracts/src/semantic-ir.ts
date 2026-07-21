// Semantic IR.
// Structure only.

import type {
  BlockId,
  EffectKind,
  EvidenceRef,
  NodeId,
  SnapshotId,
  SourceSpan,
  SymbolId,
  ValueRef,
} from "./primitives.js";
import type { ExternalPolicyIR } from "./external-policy.js";

export type { ExternalPolicyIR };

// Relation operator.
export type RelationOp = "EQ" | "NEQ" | "IN" | "NIN";

// Relation predicate.
export interface RelationPredicate {
  readonly left: ValueRef;
  readonly op: RelationOp;
  readonly right: ValueRef;
  readonly evidence: EvidenceRef;
}

// Operation node.
export interface OperationIR {
  readonly nodeId: NodeId;
  readonly kind: "call" | "assign" | "guard" | "effect";
  readonly span: SourceSpan;
  readonly effectId?: NodeId;
  readonly guard?: RelationPredicate;
}

// Block terminator.
export interface TerminatorIR {
  readonly kind: "return" | "branch" | "goto" | "throw";
  readonly successors: readonly BlockId[];
  readonly condition?: RelationPredicate;
}

// Basic block.
export interface BasicBlockIR {
  readonly id: BlockId;
  readonly operations: readonly OperationIR[];
  readonly terminator: TerminatorIR;
}

// Function body.
export interface FunctionIR {
  readonly symbolId: SymbolId;
  readonly entryBlock: BlockId;
  readonly blocks: readonly BasicBlockIR[];
}

// Route or action.
export interface EntrypointIR {
  readonly nodeId: NodeId;
  readonly kind: "route_handler" | "server_action";
  readonly method?: string;
  readonly path?: string;
  readonly handler: SymbolId;
  readonly externallyReachable: boolean;
  readonly span: SourceSpan;
}

// Interpreter safety.
export type InterpreterSafety =
  | "PARAMETERIZED"
  | "TAINTED"
  | "CONSTANT"
  | "SANITIZED"
  | "UNKNOWN";

// Sensitive effect.
export interface EffectIR {
  readonly nodeId: NodeId;
  readonly effectKind: EffectKind;
  readonly resource: string;
  readonly selector: ValueRef;
  readonly clientSymbol?: ValueRef;
  readonly inFunction: SymbolId;
  readonly block: BlockId;
  readonly span: SourceSpan;
  readonly interpreterSafety?: InterpreterSafety;
  readonly interpreterContext?: "SQL" | "HTML_BODY" | "SHELL";
}

// Guard establishment.
export interface GuardIR {
  readonly nodeId: NodeId;
  readonly predicate: RelationPredicate;
  readonly inFunction: SymbolId;
  readonly block: BlockId;
  readonly establishes:
    | "authentication"
    | "resource_relation"
    | "resource_state"
    | "signature_verified";
  readonly failOpen?: boolean;
  readonly boundParam?: number;
  readonly targetEffectId?: NodeId;
}

// Principal source.
export interface PrincipalSourceIR {
  readonly nodeId: NodeId;
  readonly tenantClaim: ValueRef;
  readonly span: SourceSpan;
}

// Resource model.
export interface ResourceIR {
  readonly name: string;
  readonly tenantColumn?: string;
  readonly ownerColumn?: string;
}

// Call resolution.
export type CallResolution =
  | "DIRECT"
  | "IMPORTED"
  | "METHOD"
  | "UNRESOLVED";

// Interprocedural edge.
export interface CallEdgeIR {
  readonly caller: SymbolId;
  readonly callee?: SymbolId;
  readonly resolution: CallResolution;
  readonly block: BlockId;
  readonly argFlows: readonly ArgFlow[];
  readonly span: SourceSpan;
}

// Argument binding.
export interface ArgFlow {
  readonly argIndex: number;
  readonly value: ValueRef;
}

// Whole module.
export interface SemanticIR {
  readonly schemaVersion: 1;
  readonly snapshot: SnapshotId;
  readonly functions: readonly FunctionIR[];
  readonly entrypoints: readonly EntrypointIR[];
  readonly effects: readonly EffectIR[];
  readonly guards: readonly GuardIR[];
  readonly principalSources: readonly PrincipalSourceIR[];
  readonly resources: readonly ResourceIR[];
  readonly externalPolicies: readonly ExternalPolicyIR[];
  readonly callEdges: readonly CallEdgeIR[];
  readonly analyzedDefenses: readonly string[];
}
