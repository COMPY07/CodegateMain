// External policy.
// Types only.

import type { EvidenceRef, ValueRef } from "./primitives.js";

// Policy source.
export type ExternalPolicyKind =
  | "PRISMA_EXTENSION"
  | "DATABASE_RLS"
  | "MIDDLEWARE"
  | "SERVICE_WRAPPER";

// Resolution state.
// Observed, not judged.
export type ExternalPolicyStatus =
  | "DECLARED_BUT_UNAVAILABLE"
  | "RESOLVED"
  | "RESOLVED_NOT_APPLICABLE";

// Prisma four conditions.
export interface PrismaExtensionFacts {
  readonly exactClientUsed: boolean;
  readonly appliesToTargetEffect: boolean;
  readonly addsRequiredRelation: boolean;
  readonly noBypassingPath: boolean;
}

// Row-policy observed facts.
export interface RlsFacts {
  readonly tableMatches: boolean;
  readonly tenantPredicatePresent: boolean;
  readonly forceApplied: boolean;
  readonly noBypassingPath: boolean;
}

// Policy record.
// Facts, not verdict.
export interface ExternalPolicyIR {
  readonly kind: ExternalPolicyKind;
  readonly resource: string;
  readonly status: ExternalPolicyStatus;
  readonly clientRef?: ValueRef;
  readonly prismaFacts?: PrismaExtensionFacts;
  readonly rlsFacts?: RlsFacts;
  readonly evidence: EvidenceRef;
}

// Defense outcome.
export type DefenseVerdict = "BLOCKING" | "NON_BLOCKING" | "UNRESOLVED";

// Defense mechanism.
// Evidence of proven.
export type DefenseKind =
  | "PARAMETERIZATION"
  | "CONTEXT_SANITIZER"
  | "ALLOWLIST"
  | "BLOCKING_GUARD"
  | "EXTERNAL_POLICY";

// Defense candidate.
export interface DefenseCandidate {
  readonly kind: DefenseKind;
  readonly verdict: DefenseVerdict;
  readonly evidence: readonly EvidenceRef[];
  readonly rationale: string;
}

// Boundary reason.
export type UnresolvedReason =
  | "EXTERNAL_POLICY_DECLARED"
  | "UNRESOLVED_PRISMA_CLIENT"
  | "UNRESOLVED_CALL_EDGE"
  | "UNRESOLVED_MIDDLEWARE_MATCHER"
  | "DYNAMIC_DISPATCH"
  | "REQUESTED_ENTRYPOINT_NOT_FOUND"
  | "AMBIGUOUS_GUARD_SOURCE";

// Unresolved boundary.
export interface UnresolvedBoundary {
  readonly reason: UnresolvedReason;
  readonly resource?: string;
  readonly critical: boolean;
  readonly evidence: readonly EvidenceRef[];
  readonly rationale: string;
}
