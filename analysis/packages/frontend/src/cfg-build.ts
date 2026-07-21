// CFG builder.
// Structured blocks.

import ts from "typescript";
import type { BasicBlockIR, BlockId } from "@vibegate/contracts";
import { mintBlockId } from "./symbol-id.js";

// Build outcome.
export interface CfgResult {
  readonly entry: BlockId;
  readonly blocks: readonly BasicBlockIR[];
  readonly nodeBlock: ReadonlyMap<ts.Node, BlockId>;
}

// Mutable block.
interface MutBlock {
  id: BlockId;
  successors: BlockId[];
  kind: "return" | "branch" | "goto" | "throw";
}

// Build function CFG.
export function buildFunctionCfg(fnName: string, fn: ts.Node): CfgResult {
  let counter = 0;
  const blocks: MutBlock[] = [];
  const nodeBlock = new Map<ts.Node, BlockId>();

  const fresh = (): BlockId => mintBlockId(fnName, counter++);
  const open = (id: BlockId): MutBlock => {
    const b: MutBlock = { id, successors: [], kind: "goto" };
    blocks.push(b);
    return b;
  };

  // Stamp subtree here.
  const stampInto = (node: ts.Node, block: BlockId): void => {
    nodeBlock.set(node, block);
    ts.forEachChild(node, (c) => stampInto(c, block));
  };

  // Emit statement list.
  // Returns exit block.
  const emitList = (
    stmts: readonly ts.Statement[],
    entry: MutBlock,
  ): MutBlock | null => {
    let cur: MutBlock | null = entry;
    for (const stmt of stmts) {
      if (!cur) {
        // Unreachable tail.
        cur = open(fresh());
      }
      cur = emitStatement(stmt, cur);
    }
    return cur;
  };

  // Emit one statement.
  // Null means terminates.
  const emitStatement = (
    stmt: ts.Statement,
    cur: MutBlock,
  ): MutBlock | null => {
    if (ts.isBlock(stmt)) {
      return emitList(stmt.statements, cur);
    }
    if (ts.isIfStatement(stmt)) {
      return emitIf(stmt, cur);
    }
    if (ts.isTryStatement(stmt)) {
      return emitTry(stmt, cur);
    }
    if (ts.isReturnStatement(stmt)) {
      stampInto(stmt, cur.id);
      cur.kind = "return";
      return null;
    }
    if (ts.isThrowStatement(stmt)) {
      stampInto(stmt, cur.id);
      cur.kind = "throw";
      return null;
    }
    // Plain statement stays.
    stampInto(stmt, cur.id);
    return cur;
  };

  // Emit if/else.
  const emitIf = (stmt: ts.IfStatement, cur: MutBlock): MutBlock | null => {
    // Condition owns branch.
    stampInto(stmt.expression, cur.id);
    cur.kind = "branch";

    const thenBlk = open(fresh());
    cur.successors.push(thenBlk.id);
    const thenExit = emitStatement(stmt.thenStatement, thenBlk);

    let elseExit: MutBlock | null;
    if (stmt.elseStatement) {
      const elseBlk = open(fresh());
      cur.successors.push(elseBlk.id);
      elseExit = emitStatement(stmt.elseStatement, elseBlk);
    } else {
      elseExit = cur;
    }

    // Both terminated.
    if (!thenExit && !elseExit) return null;

    const join = open(fresh());
    if (thenExit) thenExit.successors.push(join.id);
    if (elseExit) {
      if (elseExit === cur) cur.successors.push(join.id);
      else elseExit.successors.push(join.id);
    }
    return join;
  };

  // Emit try/catch.
  const emitTry = (stmt: ts.TryStatement, cur: MutBlock): MutBlock | null => {
    cur.kind = "branch";
    const tryBlk = open(fresh());
    cur.successors.push(tryBlk.id);
    const tryExit = emitList(stmt.tryBlock.statements, tryBlk);

    let catchExit: MutBlock | null = null;
    let hasCatch = false;
    if (stmt.catchClause) {
      hasCatch = true;
      const catchBlk = open(fresh());
      // Exception edge exists.
      cur.successors.push(catchBlk.id);
      catchExit = emitList(stmt.catchClause.block.statements, catchBlk);
    }

    // Merge non-terminated.
    let after: MutBlock | null;
    if (!tryExit && (!hasCatch || !catchExit)) {
      after = null;
    } else {
      const join = open(fresh());
      if (tryExit) tryExit.successors.push(join.id);
      if (catchExit) catchExit.successors.push(join.id);
      after = join;
    }

    // Finally always runs.
    if (stmt.finallyBlock) {
      const finBlk = after ?? open(fresh());
      if (!after) cur.successors.push(finBlk.id);
      return emitList(stmt.finallyBlock.statements, finBlk);
    }
    return after;
  };

  const entry = open(fresh());
  const body = getBody(fn);
  const stmts = body ? body.statements : [];
  const exit = emitList(stmts, entry);
  if (exit) exit.kind = "return";

  const out: BasicBlockIR[] = blocks.map((b) => ({
    id: b.id,
    operations: [],
    terminator: { kind: b.kind, successors: b.successors },
  }));
  return { entry: entry.id, blocks: out, nodeBlock };
}

// Function body block.
function getBody(fn: ts.Node): ts.Block | undefined {
  if (
    (ts.isFunctionDeclaration(fn) ||
      ts.isFunctionExpression(fn) ||
      ts.isArrowFunction(fn) ||
      ts.isMethodDeclaration(fn)) &&
    fn.body &&
    ts.isBlock(fn.body)
  ) {
    return fn.body;
  }
  return undefined;
}
