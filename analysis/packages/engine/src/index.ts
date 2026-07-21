// Engine surface.

export { rollupVerdict } from "./verdict.js";
export { analyze, createHandler } from "./prove.js";
export type { IrLoader } from "./prove.js";
export { inventory, index } from "./inventory.js";
export { compare } from "./compare.js";
export { slice } from "./slice.js";
export { expandEvidence } from "./evidence.js";
export { enumeratePaths } from "./analysis/paths.js";
export { buildPathProofs } from "./analysis/relation.js";
export type { EffectPath } from "./analysis/relation.js";
export { buildCfg, dominators, dominates } from "./analysis/cfg.js";
export { valueRefEqual } from "./analysis/value-flow.js";
