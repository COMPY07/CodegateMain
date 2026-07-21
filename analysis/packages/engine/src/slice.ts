// Call-path slicing.
// Reaches an effect.

import type {
  SecuritySliceInput,
  SecuritySliceOutput,
  SemanticIR,
} from "@vibegate/contracts";
import { enumeratePaths } from "./analysis/paths.js";

// Engine version.
const ENGINE_VERSION = "0.1.0";

// Slice reaching paths.
export function slice(
  ir: SemanticIR,
  input: SecuritySliceInput,
): SecuritySliceOutput {
  const { paths, coverage } = enumeratePaths(ir, input.proof);
  const slices = paths.map((p) => {
    const entrypoint = p.pathId.split(":")[0] ?? "";
    return {
      pathId: p.pathId,
      entrypoint,
      functions: p.functions.map((f) => `${f}`),
      effect: `${p.effect.nodeId}`,
      resource: p.effect.resource,
      hasUnresolved: p.hasUnresolved,
    };
  });
  return {
    slices,
    pathCoverage: coverage.status,
    unresolvedCallEdges: coverage.unresolvedCallEdges,
    engine: { name: "vibegate", version: ENGINE_VERSION },
  };
}
