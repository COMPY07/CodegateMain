// Contract primitives.
// Single home.

// Frontend symbol id.
export type SymbolId = string & { readonly __brand: "SymbolId" };

// Structural node id.
export type NodeId = string & { readonly __brand: "NodeId" };

// Snapshot digest.
export type SnapshotId = string & { readonly __brand: "SnapshotId" };

// Basic-block id.
export type BlockId = string & { readonly __brand: "BlockId" };

// Path id.
export type PathId = string & { readonly __brand: "PathId" };

// Canonical effects.
export type EffectKind =
  | "DB_READ"
  | "DB_CREATE"
  | "DB_UPDATE"
  | "DB_DELETE"
  | "RAW_SQL_EXECUTE"
  | "HTML_RENDER"
  | "OUTBOUND_REQUEST"
  | "COMMAND_EXECUTE"
  | "TOKEN_ISSUE"
  | "REDIRECT";

// Declaration kind.
export type DeclKind =
  | "function"
  | "method"
  | "variable"
  | "parameter"
  | "property"
  | "class"
  | "import"
  | "type"
  | "unknown";

// Byte-offset span.
export interface SourceSpan {
  readonly file: string;
  readonly start: number;
  readonly end: number;
}

// Evidence pointer.
export interface EvidenceRef {
  readonly span: SourceSpan;
  readonly note: string;
}

// Symbol operand.
export interface ValueRefSymbol {
  readonly kind: "symbol";
  readonly symbolId: SymbolId;
}

// Field access.
export interface ValueRefField {
  readonly kind: "field";
  readonly base: ValueRef;
  readonly path: readonly string[];
}

// Literal operand.
export interface ValueRefLiteral {
  readonly kind: "literal";
  readonly value: string | number | boolean | null;
}

// Recursive operand.
export type ValueRef = ValueRefSymbol | ValueRefField | ValueRefLiteral;

// Obligation tri-state.
export type ObligationStatus = "PROVEN" | "NOT_ESTABLISHED" | "UNKNOWN";

// Coverage tri-state.
export type CoverageStatus = "COMPLETE" | "PARTIAL" | "NOT_RUN";
