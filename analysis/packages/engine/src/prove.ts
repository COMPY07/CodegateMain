// Prove orchestrator.
// Deterministic pure.

import type {
  AnalysisCoverage,
  CounterevidenceCoverage,
  SecurityProveHandler,
  SecurityProveInput,
  SecurityProveOutput,
  SemanticIR,
} from "@vibegate/contracts";
import { enumeratePaths } from "./analysis/paths.js";
import { buildPathProofs } from "./analysis/relation.js";
import { rollupVerdict } from "./verdict.js";

// Engine version.
const ENGINE_VERSION = "0.1.0";

// Honest search coverage.
// Reflects analyzed sources.
function counterevidenceCoverage(ir: SemanticIR): CounterevidenceCoverage {
  const analyzed = ir.analyzedDefenses;
  const state = (k: string): "COMPLETE" | "NOT_RUN" =>
    analyzed.includes(k) ? "COMPLETE" : "NOT_RUN";
  return {
    prismaExtensions: state("prismaExtensions"),
    externalPolicies: state("externalPolicies"),
    migrations: state("migrations"),
    middleware: state("middleware"),
    wrappers: state("wrappers"),
  };
}

// Analyze one snapshot.
export function analyze(
  ir: SemanticIR,
  input: SecurityProveInput,
): SecurityProveOutput {
  const {
    paths,
    coverage: pathEnumeration,
    boundaries,
  } = enumeratePaths(ir, input.proof);
  const pathProofs = buildPathProofs(ir, input.proof, paths);
  const coverage: AnalysisCoverage = {
    pathEnumeration,
    counterevidence: counterevidenceCoverage(ir),
  };
  const result = rollupVerdict(pathProofs, coverage, boundaries);
  return {
    result,
    engine: { name: "vibegate", version: ENGINE_VERSION },
  };
}

// IR loader injected.
export type IrLoader = (input: SecurityProveInput) => Promise<SemanticIR>;

// Build handler.
export function createHandler(loadIr: IrLoader): SecurityProveHandler {
  return async (input) => {
    const ir = await loadIr(input);
    return analyze(ir, input);
  };
}
