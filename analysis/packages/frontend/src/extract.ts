// Frontend extractor.
// Source to IR.

import ts from "typescript";
import type {
  BlockId,
  CallEdgeIR,
  EffectIR,
  EffectKind,
  EntrypointIR,
  ExternalPolicyIR,
  FunctionIR,
  GuardIR,
  NodeId,
  PrincipalSourceIR,
  ResourceIR,
  SemanticIR,
  SnapshotId,
  SourceSpan,
  SymbolId,
  ValueRef,
} from "@vibegate/contracts";
import { mintBlockId, mintNodeId, mintSymbolId } from "./symbol-id.js";
import { buildFunctionCfg } from "./cfg-build.js";

// HTTP method names.
const METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE"]);

// Write method map.
const WRITE_METHODS: ReadonlyMap<string, EffectKind> = new Map([
  ["delete", "DB_DELETE"],
  ["deleteMany", "DB_DELETE"],
  ["update", "DB_UPDATE"],
  ["updateMany", "DB_UPDATE"],
  ["create", "DB_CREATE"],
  ["createMany", "DB_CREATE"],
  ["upsert", "DB_UPDATE"],
]);

// Model to resource.
function toResource(model: string): string {
  return model.charAt(0).toUpperCase() + model.slice(1);
}

// Prisma call shape.
// Object-arg write call.
function isPrismaWrite(
  method: string,
  call: ts.CallExpression,
): boolean {
  if (!WRITE_METHODS.has(method)) return false;
  const arg = call.arguments[0];
  // Options object expected.
  return arg !== undefined && ts.isObjectLiteralExpression(arg);
}

// Span from node.
function spanOf(sf: ts.SourceFile, node: ts.Node): SourceSpan {
  return {
    file: sf.fileName,
    start: node.getStart(sf),
    end: node.getEnd(),
  };
}

// Build field ref.
function fieldRef(base: ValueRef, ...path: string[]): ValueRef {
  return { kind: "field", base, path };
}

// Symbol ref.
function symRef(id: SymbolId): ValueRef {
  return { kind: "symbol", symbolId: id };
}

// Property chain text.
function chain(expr: ts.Expression): string[] {
  const out: string[] = [];
  let cur: ts.Expression = expr;
  while (ts.isPropertyAccessExpression(cur)) {
    out.unshift(cur.name.text);
    cur = cur.expression;
  }
  if (ts.isIdentifier(cur)) out.unshift(cur.text);
  return out;
}

// Extraction result.
export interface ExtractResult {
  readonly ir: SemanticIR;
}

// Extract one file.
export function extractProgram(
  files: readonly string[],
  policies: readonly ExternalPolicyIR[],
  snapshot: string,
): SemanticIR {
  const program = ts.createProgram(files, {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    jsx: ts.JsxEmit.Preserve,
    allowJs: true,
    noEmit: true,
    skipLibCheck: true,
  });
  const checker = program.getTypeChecker();

  const functions: FunctionIR[] = [];
  const entrypoints: EntrypointIR[] = [];
  const effects: EffectIR[] = [];
  const guards: GuardIR[] = [];
  const principalSources: PrincipalSourceIR[] = [];
  const callEdges: CallEdgeIR[] = [];

  // Name to symbol.
  const byName = new Map<string, SymbolId>();
  // Declaration to symbol.
  const bySymbol = new Map<ts.Symbol, SymbolId>();
  // Library-imported names.
  const libNames = new Set<string>();

  // Index all functions.
  const decls: {
    sf: ts.SourceFile;
    name: string;
    node: FnLike;
    sym: SymbolId;
  }[] = [];
  for (const file of files) {
    const sf = program.getSourceFile(file);
    if (!sf) continue;
    collectLibImports(sf, libNames);
    for (const d of functionDecls(sf)) {
      const sym = mintSymbolId(sf.fileName, d.name, d.node.getStart(sf));
      byName.set(d.name, sym);
      const declSym = declaredSymbol(checker, d.node, d.name);
      if (declSym) bySymbol.set(declSym, sym);
      decls.push({ sf, name: d.name, node: d.node, sym });
    }
  }

  // Extract per function.
  for (const d of decls) {
    const { sf, name, node, sym } = d;
    const cfg = buildFunctionCfg(name, node);
    const entryBlk = cfg.entry;
    const blockOf = (n: ts.Node): BlockId =>
      cfg.nodeBlock.get(n) ?? entryBlk;

    functions.push({
      symbolId: sym,
      entryBlock: entryBlk,
      blocks: cfg.blocks,
    });

    effects.push(...collectEffects(sf, node, sym, entryBlk, blockOf));
    guards.push(...collectGuards(sf, node, sym, entryBlk, blockOf));
    const principal = collectPrincipal(sf, node);
    if (principal) principalSources.push(principal);
    callEdges.push(
      ...collectCallEdges(sf, node, sym, blockOf, {
        checker,
        byName,
        bySymbol,
        libNames,
      }),
    );

    // Route handler entrypoint.
    if (METHODS.has(name) && isRouteFile(sf.fileName)) {
      entrypoints.push({
        nodeId: mintNodeId("ep", sf.fileName, node.getStart(sf)),
        kind: "route_handler",
        method: name,
        path: routePath(sf.fileName),
        handler: sym,
        externallyReachable: true,
        span: spanOf(sf, node),
      });
    }

    // Server action entrypoint.
    if (isServerAction(sf, node)) {
      entrypoints.push({
        nodeId: mintNodeId("sa", sf.fileName, node.getStart(sf)),
        kind: "server_action",
        handler: sym,
        externallyReachable: true,
        span: spanOf(sf, node),
      });
    }

    // Page render entrypoint.
    if (isPageFile(sf.fileName) && isExported(node)) {
      entrypoints.push({
        nodeId: mintNodeId("pg", sf.fileName, node.getStart(sf)),
        kind: "route_handler",
        method: "GET",
        path: routePath(sf.fileName),
        handler: sym,
        externallyReachable: true,
        span: spanOf(sf, node),
      });
    }
  }

  return {
    schemaVersion: 1,
    snapshot: snapshot as SnapshotId,
    functions,
    entrypoints,
    effects,
    guards,
    principalSources,
    resources: resourcesFromEffects(effects),
    externalPolicies: policies,
    callEdges,
    analyzedDefenses: analyzedDefenseKinds(program, files),
  };
}

// Resources from effects.
function resourcesFromEffects(
  effects: readonly EffectIR[],
): ResourceIR[] {
  const names = new Set<string>();
  for (const e of effects) {
    if (e.effectKind.startsWith("DB_")) names.add(e.resource);
  }
  return [...names].map((name) => ({ name, tenantColumn: "tenantId" }));
}

// Function-like node.
type FnLike =
  | ts.FunctionDeclaration
  | ts.FunctionExpression
  | ts.ArrowFunction
  | ts.MethodDeclaration;

// Collect function decls.
function functionDecls(
  sf: ts.SourceFile,
): { name: string; node: FnLike }[] {
  const out: { name: string; node: FnLike }[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isFunctionDeclaration(node) && node.name) {
      out.push({ name: node.name.text, node });
    } else if (
      ts.isVariableStatement(node)
    ) {
      for (const decl of node.declarationList.declarations) {
        if (
          ts.isIdentifier(decl.name) &&
          decl.initializer &&
          (ts.isArrowFunction(decl.initializer) ||
            ts.isFunctionExpression(decl.initializer))
        ) {
          out.push({ name: decl.name.text, node: decl.initializer });
        }
      }
    } else if (ts.isMethodDeclaration(node) && ts.isIdentifier(node.name)) {
      out.push({ name: node.name.text, node });
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

// Route file check.
function isRouteFile(file: string): boolean {
  return /route\.[jt]sx?$/.test(file);
}

// Page file check.
function isPageFile(file: string): boolean {
  return /page\.[jt]sx?$/.test(file);
}

// Exported function.
function isExported(node: FnLike): boolean {
  let cur: ts.Node | undefined = node;
  while (cur) {
    const mods = ts.canHaveModifiers(cur) ? ts.getModifiers(cur) : undefined;
    if (mods?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) return true;
    cur = cur.parent;
  }
  return false;
}

// Server action detection.
function isServerAction(sf: ts.SourceFile, fn: FnLike): boolean {
  const first = sf.statements[0];
  if (
    first &&
    ts.isExpressionStatement(first) &&
    ts.isStringLiteral(first.expression) &&
    first.expression.text === "use server"
  ) {
    return true;
  }
  const body = fn.body;
  if (body && ts.isBlock(body)) {
    const s0 = body.statements[0];
    if (
      s0 &&
      ts.isExpressionStatement(s0) &&
      ts.isStringLiteral(s0.expression) &&
      s0.expression.text === "use server"
    ) {
      return true;
    }
  }
  return false;
}

// Known library calls.
const KNOWN_LIBS = new Set([
  "auth",
  "getServerSession",
  "requireSession",
  "requireRole",
  "redirect",
  "notFound",
  "revalidatePath",
  "console",
]);

// Call resolution context.
interface CallContext {
  readonly checker: ts.TypeChecker;
  readonly byName: ReadonlyMap<string, SymbolId>;
  readonly bySymbol: ReadonlyMap<ts.Symbol, SymbolId>;
  readonly libNames: ReadonlySet<string>;
}

// Declaring symbol of.
function declaredSymbol(
  checker: ts.TypeChecker,
  node: ts.Node,
  _name: string,
): ts.Symbol | undefined {
  // Named function declaration.
  if (ts.isFunctionDeclaration(node) && node.name) {
    return checker.getSymbolAtLocation(node.name);
  }
  // Variable-bound function.
  let cur: ts.Node | undefined = node.parent;
  while (cur) {
    if (ts.isVariableDeclaration(cur) && ts.isIdentifier(cur.name)) {
      return checker.getSymbolAtLocation(cur.name);
    }
    cur = cur.parent;
  }
  return undefined;
}

// Resolve call target.
function resolveCallee(
  ctx: CallContext,
  callee: ts.Identifier,
): SymbolId | undefined {
  // Prefer real declaration.
  let sym = ctx.checker.getSymbolAtLocation(callee);
  if (sym && sym.flags & ts.SymbolFlags.Alias) {
    sym = ctx.checker.getAliasedSymbol(sym);
  }
  if (sym) {
    const mapped = ctx.bySymbol.get(sym);
    if (mapped) return mapped;
  }
  // Name fallback last.
  return ctx.byName.get(callee.text);
}

// Collect call edges.
function collectCallEdges(
  sf: ts.SourceFile,
  fn: FnLike,
  caller: SymbolId,
  blockOf: (n: ts.Node) => BlockId,
  ctx: CallContext,
): CallEdgeIR[] {
  const out: CallEdgeIR[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      const name = node.expression.text;
      const callee = resolveCallee(ctx, node.expression);
      const flows = node.arguments.map((a, i) => ({
        argIndex: i,
        value: argValueRef(sf, a),
      }));
      if (callee) {
        // Resolved project call.
        out.push({
          caller,
          callee,
          resolution: "DIRECT",
          block: blockOf(node),
          argFlows: flows,
          span: spanOf(sf, node),
        });
      } else if (!KNOWN_LIBS.has(name) && !ctx.libNames.has(name)) {
        // Unresolved project call.
        out.push({
          caller,
          resolution: "UNRESOLVED",
          block: blockOf(node),
          argFlows: flows,
          span: spanOf(sf, node),
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(fn);
  return out;
}

// Completed defense searches.
// Real searches only.
function analyzedDefenseKinds(
  program: ts.Program,
  files: readonly string[],
): string[] {
  const kinds: string[] = [];
  // No extends found.
  let sawExtends = false;
  for (const file of files) {
    const sf = program.getSourceFile(file);
    if (sf && /\$extends\b/.test(sf.text)) sawExtends = true;
  }
  if (!sawExtends) kinds.push("prismaExtensions");
  // Sidecar always consulted.
  kinds.push("externalPolicies");
  // No middleware file.
  if (!files.some((f) => /middleware\.tsx?$/.test(f))) {
    kinds.push("middleware");
  }
  return kinds;
}

// Library import names.
function collectLibImports(
  sf: ts.SourceFile,
  libNames: Set<string>,
): void {
  for (const stmt of sf.statements) {
    if (!ts.isImportDeclaration(stmt)) continue;
    const spec = stmt.moduleSpecifier;
    if (!ts.isStringLiteral(spec)) continue;
    const bare = !spec.text.startsWith(".");
    const bindings = stmt.importClause?.namedBindings;
    if (bindings && ts.isNamedImports(bindings)) {
      for (const el of bindings.elements) {
        // Bare or known.
        const origin = el.propertyName?.text ?? el.name.text;
        if (bare || KNOWN_LIBS.has(origin)) libNames.add(el.name.text);
      }
    }
    const dflt = stmt.importClause?.name;
    if (dflt && bare) libNames.add(dflt.text);
  }
}

// Argument value ref.
function argValueRef(sf: ts.SourceFile, arg: ts.Expression): ValueRef {
  if (ts.isIdentifier(arg)) {
    return symRef(mintSymbolId(sf.fileName, arg.text, 0));
  }
  if (ts.isPropertyAccessExpression(arg)) {
    const parts = chain(arg);
    const root = parts[0] ?? "unknown";
    return fieldRef(symRef(mintSymbolId(sf.fileName, root, 0)), ...parts.slice(1));
  }
  return { kind: "literal", value: null };
}

// Route path guess.
function routePath(file: string): string {
  const m = file.match(/app(\/.*)\/route\.[jt]sx?$/);
  if (!m) return "/";
  return m[1]!.replace(/\[(\w+)\]/g, ":$1");
}

// Find delete effects.
function collectEffects(
  sf: ts.SourceFile,
  fn: FnLike,
  fnSym: SymbolId,
  _entryBlk: BlockId,
  blockOf: (n: ts.Node) => BlockId,
): EffectIR[] {
  const out: EffectIR[] = [];
  const visit = (node: ts.Node): void => {
    const block = blockOf(node);
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const method = node.expression.name.text;
      const parts = chain(node.expression);
      const kind = WRITE_METHODS.get(method);
      // client.<model>.<write>
      if (kind && parts.length >= 3 && isPrismaWrite(method, node)) {
        const clientRoot = parts[0]!;
        const model = parts[parts.length - 2]!;
        const clientSym = mintSymbolId(sf.fileName, clientRoot, node.getStart(sf));
        const selector = extractSelector(sf, node);
        out.push({
          nodeId: mintNodeId("effect", sf.fileName, node.getStart(sf)),
          effectKind: kind,
          resource: toResource(model),
          selector,
          clientSymbol: resolveClient(sf, fn, clientRoot, clientSym),
          inFunction: fnSym,
          block,
          span: spanOf(sf, node),
        });
      }
      // Raw SQL unsafe.
      if (RAW_UNSAFE.has(method)) {
        out.push(rawSqlEffect(sf, node, fnSym, block, "call"));
      }
    }
    // Raw SQL tagged.
    if (
      ts.isTaggedTemplateExpression(node) &&
      ts.isPropertyAccessExpression(node.tag) &&
      RAW_TAGGED.has(node.tag.name.text)
    ) {
      out.push(rawSqlEffect(sf, node, fnSym, block, "tagged"));
    }
    // HTML render sink.
    if (
      ts.isJsxAttribute(node) &&
      node.name.getText(sf) === "dangerouslySetInnerHTML"
    ) {
      out.push(htmlEffect(sf, node, fn, fnSym, block));
    }
    // Redirect sink.
    if (ts.isCallExpression(node) && isRedirectCall(sf, node)) {
      out.push(redirectEffect(sf, node, fn, fnSym, block));
    }
    ts.forEachChild(node, visit);
  };
  visit(fn);
  return out;
}

// Redirect call check.
function isRedirectCall(sf: ts.SourceFile, node: ts.CallExpression): boolean {
  if (ts.isIdentifier(node.expression)) {
    return node.expression.text === "redirect";
  }
  if (ts.isPropertyAccessExpression(node.expression)) {
    return node.expression.name.text === "redirect";
  }
  return false;
}

// Redirect effect.
function redirectEffect(
  sf: ts.SourceFile,
  node: ts.CallExpression,
  fn: FnLike,
  fnSym: SymbolId,
  block: BlockId,
): EffectIR {
  const arg = node.arguments[0];
  const constant = arg ? ts.isStringLiteral(arg) : false;
  const bodyText = fn.body ? fn.body.getText(sf) : "";
  const allowlisted =
    /allow|whitelist|isSafe|startsWith|includes\(/.test(bodyText);
  const tainted = /searchParams|params\.|req\.|request\.|body|query/.test(
    bodyText,
  );
  const safety = constant
    ? "CONSTANT"
    : allowlisted
      ? "SANITIZED"
      : tainted
        ? "TAINTED"
        : "UNKNOWN";
  return {
    nodeId: mintNodeId("redirect", sf.fileName, node.getStart(sf)),
    effectKind: "REDIRECT",
    resource: "Location",
    selector: symRef(mintSymbolId(sf.fileName, "url", 0)),
    inFunction: fnSym,
    block,
    span: spanOf(sf, node),
    interpreterSafety: safety,
  };
}

// Raw sink methods.
const RAW_UNSAFE = new Set(["$queryRawUnsafe", "$executeRawUnsafe"]);
const RAW_TAGGED = new Set(["$queryRaw", "$executeRaw"]);

// Signature verify names.
const SIG_VERIFY = /verifySignature|constructEvent|verifyWebhook|createHmac/;

// Raw SQL effect.
function rawSqlEffect(
  sf: ts.SourceFile,
  node: ts.CallExpression | ts.TaggedTemplateExpression,
  fnSym: SymbolId,
  block: BlockId,
  form: "call" | "tagged",
): EffectIR {
  const safety =
    form === "tagged"
      ? "PARAMETERIZED"
      : rawArgSafety(sf, (node as ts.CallExpression).arguments[0]);
  return {
    nodeId: mintNodeId("sql", sf.fileName, node.getStart(sf)),
    effectKind: "RAW_SQL_EXECUTE",
    resource: "Database",
    selector: symRef(mintSymbolId(sf.fileName, "query", 0)),
    inFunction: fnSym,
    block,
    span: spanOf(sf, node),
    interpreterSafety: safety,
    interpreterContext: "SQL",
  };
}

// Argument taint safety.
function rawArgSafety(
  sf: ts.SourceFile,
  arg: ts.Expression | undefined,
): "TAINTED" | "CONSTANT" | "UNKNOWN" {
  if (!arg) return "UNKNOWN";
  if (ts.isStringLiteral(arg)) return "CONSTANT";
  if (ts.isNoSubstitutionTemplateLiteral(arg)) return "CONSTANT";
  // Interpolation is dynamic.
  if (ts.isTemplateExpression(arg)) return "TAINTED";
  // Concatenation is dynamic.
  if (ts.isBinaryExpression(arg)) {
    return ts.isStringLiteral(arg.left) && ts.isStringLiteral(arg.right)
      ? "CONSTANT"
      : "TAINTED";
  }
  return "UNKNOWN";
}

// Sanitizer names.
const SANITIZERS = new Set([
  "sanitize",
  "sanitizeHtml",
  "DOMPurify.sanitize",
  "purify",
  "escapeHtml",
]);

// Taint source names.
const TAINT_SOURCE = /params|searchParams|req\.|props|data|content|body/;

// Html sink expression.
// The __html value.
function htmlValueExpr(
  node: ts.JsxAttribute,
): ts.Expression | undefined {
  const init = node.initializer;
  if (!init || !ts.isJsxExpression(init) || !init.expression) return undefined;
  const obj = init.expression;
  if (!ts.isObjectLiteralExpression(obj)) return undefined;
  for (const p of obj.properties) {
    if (ts.isPropertyAssignment(p) && p.name.getText() === "__html") {
      return p.initializer;
    }
  }
  return undefined;
}

// Declared variable value.
// One-hop back only.
function localBinding(
  fn: FnLike,
  name: string,
): ts.Expression | undefined {
  let found: ts.Expression | undefined;
  const visit = (n: ts.Node): void => {
    if (
      ts.isVariableDeclaration(n) &&
      ts.isIdentifier(n.name) &&
      n.name.text === name &&
      n.initializer
    ) {
      found = n.initializer;
    }
    ts.forEachChild(n, visit);
  };
  if (fn.body) visit(fn.body);
  return found;
}

// Sink value safety.
function htmlSafety(
  sf: ts.SourceFile,
  value: ts.Expression | undefined,
  fn: FnLike,
): "SANITIZED" | "TAINTED" | "UNKNOWN" {
  if (!value) return "UNKNOWN";
  if (ts.isCallExpression(value)) {
    return SANITIZERS.has(value.expression.getText(sf))
      ? "SANITIZED"
      : "UNKNOWN";
  }
  // Trace one binding.
  if (ts.isIdentifier(value)) {
    const bound = localBinding(fn, value.text);
    if (bound && bound !== value) return htmlSafety(sf, bound, fn);
  }
  if (TAINT_SOURCE.test(value.getText(sf))) return "TAINTED";
  return "UNKNOWN";
}

// HTML render effect.
function htmlEffect(
  sf: ts.SourceFile,
  node: ts.JsxAttribute,
  fn: FnLike,
  fnSym: SymbolId,
  block: BlockId,
): EffectIR {
  const value = htmlValueExpr(node);
  const safety = htmlSafety(sf, value, fn);
  return {
    nodeId: mintNodeId("html", sf.fileName, node.getStart(sf)),
    effectKind: "HTML_RENDER",
    resource: "Response",
    selector: symRef(mintSymbolId(sf.fileName, "html", 0)),
    inFunction: fnSym,
    block,
    span: spanOf(sf, node),
    interpreterSafety: safety,
    interpreterContext: "HTML_BODY",
  };
}

// Selector from where.
function extractSelector(sf: ts.SourceFile, call: ts.CallExpression): ValueRef {
  const arg = call.arguments[0];
  const paramsId = mintSymbolId(sf.fileName, "params", call.getStart(sf));
  const base = fieldRef(symRef(paramsId), "id");
  if (arg && ts.isObjectLiteralExpression(arg)) {
    for (const p of arg.properties) {
      if (ts.isPropertyAssignment(p) && p.name.getText(sf) === "where") {
        return base;
      }
    }
  }
  return base;
}

// Resolve client symbol.
function resolveClient(
  sf: ts.SourceFile,
  fn: FnLike,
  clientRoot: string,
  fallback: SymbolId,
): ValueRef {
  // Dynamic lookup unresolved.
  if (dynamicClient(fn, clientRoot)) {
    return fieldRef(symRef(fallback), "get");
  }
  // Name-stable client id.
  return symRef(clientId(clientRoot));
}

// Name-stable client id.
export function clientId(name: string): SymbolId {
  return `client_${name}` as SymbolId;
}

// Dynamic client check.
function dynamicClient(fn: FnLike, clientRoot: string): boolean {
  let dynamic = false;
  const visit = (node: ts.Node): void => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === clientRoot &&
      node.initializer &&
      ts.isCallExpression(node.initializer)
    ) {
      dynamic = true;
    }
    ts.forEachChild(node, visit);
  };
  visit(fn);
  return dynamic;
}

// Parameter index of.
function paramIndex(fn: FnLike, name: string): number | undefined {
  for (let i = 0; i < fn.parameters.length; i++) {
    const p = fn.parameters[i]!;
    if (ts.isIdentifier(p.name) && p.name.text === name) return i;
  }
  return undefined;
}

// Tenant scope shape.
interface TenantScope {
  readonly boundParam?: number;
  readonly targetEffectId: NodeId;
}

// Owning write.
function owningWhereCall(
  sf: ts.SourceFile,
  node: ts.Node,
): ts.CallExpression | undefined {
  // Owning object literal.
  const owner = node.parent;
  if (!owner || !ts.isObjectLiteralExpression(owner)) return undefined;
  // Its property key.
  const keyed = owner.parent;
  if (!keyed || !ts.isPropertyAssignment(keyed)) return undefined;
  if (keyed.name.getText(sf) !== "where") return undefined;
  // Where in options.
  const options = keyed.parent;
  if (!options || !ts.isObjectLiteralExpression(options)) return undefined;
  const call = options.parent;
  if (!call || !ts.isCallExpression(call)) return undefined;
  if (!ts.isPropertyAccessExpression(call.expression)) return undefined;
  const method = call.expression.name.text;
  const parts = chain(call.expression);
  if (!WRITE_METHODS.has(method) || parts.length < 3) return undefined;
  return call;
}

// Tenant scope here.
// Where-clause tenant key.
function tenantScopeAt(
  sf: ts.SourceFile,
  node: ts.Node,
  fn: FnLike,
): TenantScope | undefined {
  const call = owningWhereCall(sf, node);
  if (!call) return undefined;
  const targetEffectId = mintNodeId("effect", sf.fileName, call.getStart(sf));
  // Explicit tenant value.
  if (ts.isPropertyAssignment(node) && node.name.getText(sf) === "tenantId") {
    const init = node.initializer;
    const text = init.getText(sf);
    if (text.includes("session") && text.includes("tenantId")) {
      return { targetEffectId };
    }
    // Value is parameter.
    if (ts.isIdentifier(init)) {
      const idx = paramIndex(fn, init.text);
      if (idx !== undefined) return { boundParam: idx, targetEffectId };
    }
    return undefined;
  }
  // Shorthand tenant key.
  if (
    ts.isShorthandPropertyAssignment(node) &&
    node.name.text === "tenantId"
  ) {
    const idx = paramIndex(fn, "tenantId");
    if (idx !== undefined) return { boundParam: idx, targetEffectId };
  }
  return undefined;
}

// Detect tenant guard.
function collectGuards(
  sf: ts.SourceFile,
  fn: FnLike,
  fnSym: SymbolId,
  _entryBlk: BlockId,
  blockOf: (n: ts.Node) => BlockId,
): GuardIR[] {
  const out: GuardIR[] = [];
  const visit = (node: ts.Node, inSwallow: boolean): void => {
    const block = blockOf(node);
    // Track swallowing try.
    let childSwallow = inSwallow;
    if (ts.isTryStatement(node) && node.catchClause) {
      if (!catchReRaises(node.catchClause.block)) childSwallow = true;
    }
    // Tenant scope present.
    const tenantScope = tenantScopeAt(sf, node, fn);
    if (tenantScope) {
      const paramsId = mintSymbolId(sf.fileName, "params", 0);
      const sessionId = mintSymbolId(sf.fileName, "session", 0);
      out.push({
        nodeId: mintNodeId("guard", sf.fileName, node.getStart(sf)),
        predicate: {
          left: fieldRef(symRef(paramsId), "tenantId"),
          op: "EQ",
          right: fieldRef(symRef(sessionId), "user", "tenantId"),
          evidence: { span: spanOf(sf, node), note: "inline tenant" },
        },
        inFunction: fnSym,
        block,
        establishes: "resource_relation",
        targetEffectId: tenantScope.targetEffectId,
        ...(tenantScope.boundParam !== undefined
          ? { boundParam: tenantScope.boundParam }
          : {}),
      });
    }
    // Explicit tenant throw.
    if (ts.isIfStatement(node) && throwsOnTenantMismatch(sf, node)) {
      const sessionId = mintSymbolId(sf.fileName, "session", 0);
      const resId = mintSymbolId(sf.fileName, "resource", 0);
      out.push({
        nodeId: mintNodeId("guard", sf.fileName, node.getStart(sf)),
        predicate: {
          left: fieldRef(symRef(resId), "tenantId"),
          op: "EQ",
          right: fieldRef(symRef(sessionId), "user", "tenantId"),
          evidence: { span: spanOf(sf, node), note: "tenant throw" },
        },
        inFunction: fnSym,
        block,
        establishes: "resource_relation",
        failOpen: childSwallow,
      });
    }
    // Signature verify call.
    if (
      ts.isCallExpression(node) &&
      SIG_VERIFY.test(node.expression.getText(sf))
    ) {
      const sigId = mintSymbolId(sf.fileName, "signature", 0);
      out.push({
        nodeId: mintNodeId("sig", sf.fileName, node.getStart(sf)),
        predicate: {
          left: symRef(sigId),
          op: "EQ",
          right: { kind: "literal", value: true },
          evidence: { span: spanOf(sf, node), note: "signature verify" },
        },
        inFunction: fnSym,
        block,
        establishes: "signature_verified",
        failOpen: childSwallow,
      });
    }
    ts.forEachChild(node, (c) => visit(c, childSwallow));
  };
  visit(fn, false);
  return out;
}

// Throws on mismatch.
function throwsOnTenantMismatch(
  sf: ts.SourceFile,
  node: ts.IfStatement,
): boolean {
  const cond = node.expression.getText(sf);
  if (!cond.includes("tenantId")) return false;
  // Else is ambiguous.
  if (node.elseStatement) return false;
  // Guard rejects mismatch.
  if (!condRejectsMismatch(node.expression)) return false;
  return thenExits(node.thenStatement);
}

// Then branch exits.
function thenExits(then: ts.Statement): boolean {
  let exits = false;
  const scan = (n: ts.Node): void => {
    if (ts.isThrowStatement(n) || ts.isReturnStatement(n)) exits = true;
    ts.forEachChild(n, scan);
  };
  scan(then);
  return exits;
}

// Condition tests inequality.
// Exit means violation.
function condRejectsMismatch(expr: ts.Expression): boolean {
  let e: ts.Expression = expr;
  while (ts.isParenthesizedExpression(e)) e = e.expression;
  if (ts.isPrefixUnaryExpression(e)) {
    // Negated equality rejects.
    return (
      e.operator === ts.SyntaxKind.ExclamationToken &&
      isEqualityCheck(e.operand)
    );
  }
  if (ts.isBinaryExpression(e)) {
    const op = e.operatorToken.kind;
    return (
      op === ts.SyntaxKind.ExclamationEqualsEqualsToken ||
      op === ts.SyntaxKind.ExclamationEqualsToken
    );
  }
  return false;
}

// Equality comparison shape.
function isEqualityCheck(expr: ts.Expression): boolean {
  let e: ts.Expression = expr;
  while (ts.isParenthesizedExpression(e)) e = e.expression;
  if (!ts.isBinaryExpression(e)) return false;
  const op = e.operatorToken.kind;
  return (
    op === ts.SyntaxKind.EqualsEqualsEqualsToken ||
    op === ts.SyntaxKind.EqualsEqualsToken
  );
}

// Catch re-raises.
function catchReRaises(block: ts.Block): boolean {
  let reraises = false;
  const scan = (n: ts.Node): void => {
    if (ts.isThrowStatement(n) || ts.isReturnStatement(n)) reraises = true;
    ts.forEachChild(n, scan);
  };
  scan(block);
  return reraises;
}

// Detect session use.
function collectPrincipal(
  sf: ts.SourceFile,
  fn: FnLike,
): PrincipalSourceIR | undefined {
  let found = false;
  const visit = (node: ts.Node): void => {
    if (ts.isIdentifier(node) && node.text === "session") found = true;
    ts.forEachChild(node, visit);
  };
  visit(fn);
  if (!found) return undefined;
  const sessionId = mintSymbolId(sf.fileName, "session", 0);
  return {
    nodeId: mintNodeId("principal", sf.fileName, 0) as NodeId,
    tenantClaim: fieldRef(symRef(sessionId), "user", "tenantId"),
    span: spanOf(sf, fn),
  };
}
