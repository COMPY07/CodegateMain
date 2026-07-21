// Security property.
// Template neutral.

import type { EvidenceRef } from "./primitives.js";

// Interpreter kind.
export type InterpreterKind = "SQL" | "SHELL" | "TEMPLATE";

// Output context.
export type OutputContext =
  | "HTML_BODY"
  | "HTML_ATTRIBUTE"
  | "URL"
  | "SCRIPT";

// Required property.
// Self-describing union.
export type RequiredSecurityProperty =
  | { readonly kind: "SAME_TENANT" }
  | { readonly kind: "OWNS" }
  | {
      readonly kind: "INPUT_CANNOT_CONTROL_INTERPRETER_SYNTAX";
      readonly interpreter: InterpreterKind;
    }
  | {
      readonly kind: "OUTPUT_SAFE_FOR_CONTEXT";
      readonly context: OutputContext;
    }
  | {
      readonly kind: "RESOURCE_STATE";
      readonly field: string;
      readonly requiredValue: string;
    }
  | {
      readonly kind: "DESTINATION_CONSTRAINED";
      readonly allowlist: readonly string[];
    }
  | { readonly kind: "AUTHORIZATION_FAILS_CLOSED" }
  | { readonly kind: "SIGNATURE_VERIFIED" };

// Property status.
export type PropertyStatus = "PROVEN" | "NOT_ESTABLISHED" | "UNKNOWN";

// Per-property result.
export interface PropertyResult {
  readonly property: RequiredSecurityProperty;
  readonly status: PropertyStatus;
  readonly evidence: readonly EvidenceRef[];
}
