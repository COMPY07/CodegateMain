// Tool API.
// MCP surface.

import type { Proof } from "./proof-ir.js";
import type { EvidenceResult } from "./evidence-result.js";

// Frozen names.
export const SERVER_NAME = "vibegate";
export const SECURITY_PROVE_TOOL = "security_prove";
export const SECURITY_INVENTORY_TOOL = "security_inventory";
export const SECURITY_INDEX_TOOL = "security_index";
export const SECURITY_COMPARE_TOOL = "security_compare";
export const SECURITY_EVIDENCE_TOOL = "security_evidence";
export const SECURITY_SCAN_TOOL = "security_scan";
export const SECURITY_SLICE_TOOL = "security_slice";

// Reserved future.
export const RESERVED_TOOLS = ["security_variants"] as const;

// Snapshot reference.
export interface SnapshotRef {
  readonly root: string;
  readonly snapshotId: string;
}

// Inventory input.
export interface SecurityInventoryInput {
  readonly snapshot: SnapshotRef;
}

// Effect summary.
export interface EffectSummary {
  readonly nodeId: string;
  readonly effectKind: string;
  readonly resource: string;
  readonly inFunction: string;
}

// Entrypoint summary.
export interface EntrypointSummary {
  readonly nodeId: string;
  readonly kind: string;
  readonly method?: string;
  readonly path?: string;
}

// Inventory output.
export interface SecurityInventoryOutput {
  readonly entrypoints: readonly EntrypointSummary[];
  readonly effects: readonly EffectSummary[];
  readonly resources: readonly string[];
  readonly unresolvedCallEdges: number;
  readonly engine: { readonly name: "vibegate"; readonly version: string };
}

// Index output.
export interface SecurityIndexOutput {
  readonly snapshotId: string;
  readonly functionCount: number;
  readonly entrypointCount: number;
  readonly effectCount: number;
  readonly engine: { readonly name: "vibegate"; readonly version: string };
}

// Compare input.
export interface SecurityCompareInput {
  readonly snapshot: SnapshotRef;
  readonly resource: string;
  readonly effectKind: string;
}

// One channel result.
export interface ChannelVerdict {
  readonly channel: string;
  readonly entrypoint: string;
  readonly verdict: string;
}

// Compare output.
export interface SecurityCompareOutput {
  readonly resource: string;
  readonly channels: readonly ChannelVerdict[];
  readonly parityHolds: boolean;
  readonly engine: { readonly name: "vibegate"; readonly version: string };
}

// Tool input.
export interface SecurityProveInput {
  readonly proof: Proof;
  readonly snapshot: SnapshotRef;
}

// Tool output.
export interface SecurityProveOutput {
  readonly result: EvidenceResult;
  readonly engine: {
    readonly name: "vibegate";
    readonly version: string;
  };
}

// Deterministic handler.
export type SecurityProveHandler = (
  input: SecurityProveInput,
) => Promise<SecurityProveOutput>;

// Evidence input.
export interface SecurityEvidenceInput {
  readonly proof: Proof;
  readonly snapshot: SnapshotRef;
}

// Path step detail.
export interface EvidenceStep {
  readonly file: string;
  readonly start: number;
  readonly end: number;
  readonly note: string;
}

// Path evidence.
export interface PathEvidence {
  readonly pathId: string;
  readonly steps: readonly EvidenceStep[];
  readonly unestablished: readonly string[];
}

// Evidence output.
export interface SecurityEvidenceOutput {
  readonly verdict: string;
  readonly witnessPaths: readonly PathEvidence[];
  readonly candidatePaths: readonly PathEvidence[];
  readonly checkedDefenses: readonly string[];
  readonly unresolvedBoundaries: readonly string[];
  readonly engine: { readonly name: "vibegate"; readonly version: string };
}

// Scan input.
export interface SecurityScanInput {
  readonly snapshot: SnapshotRef;
}

// Rule finding.
export interface ScanFinding {
  readonly rule: string;
  readonly owasp: string;
  readonly severity: "HIGH" | "MEDIUM" | "LOW";
  readonly file: string;
  readonly line: number;
  readonly message: string;
}

// Scan output.
export interface SecurityScanOutput {
  readonly findings: readonly ScanFinding[];
  readonly filesScanned: number;
  readonly engine: { readonly name: "vibegate"; readonly version: string };
}

// Slice input.
export interface SecuritySliceInput {
  readonly proof: Proof;
  readonly snapshot: SnapshotRef;
}

// One call-path slice.
export interface CallSlice {
  readonly pathId: string;
  readonly entrypoint: string;
  readonly functions: readonly string[];
  readonly effect: string;
  readonly resource: string;
  readonly hasUnresolved: boolean;
}

// Slice output.
export interface SecuritySliceOutput {
  readonly slices: readonly CallSlice[];
  readonly pathCoverage: string;
  readonly unresolvedCallEdges: number;
  readonly engine: { readonly name: "vibegate"; readonly version: string };
}
