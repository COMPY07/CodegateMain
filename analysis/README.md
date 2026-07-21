# VibeGate Static Evidence Engine

A deterministic static-analysis harness that a security-audit agent (e.g. Claude
Code) invokes over MCP. It answers a typed security proof-obligation about a web
codebase and returns evidence — not a hint.

```
Next.js / Prisma source
        │
        ▼  TypeScript Compiler API
Semantic IR
        │
        ▼  CFG / value-flow / relation analysis
Proof Engine  (PathProof[] → verdict)
        │
        ▼
Evidence Result  (SUPPORTED / REFUTED / INCONCLUSIVE)
```

## Verdict semantics

The verdict is a contract, not a score. The asymmetry is load-bearing:

- **SUPPORTED** — there **exists** at least one externally-reachable, fully
  interpreted path to the effect on which the required relation is not
  established and no defense blocks it.
- **REFUTED** — path enumeration is **COMPLETE** and **every** effect-reaching
  path is protected by an applicable blocking policy or guard.
- **INCONCLUSIVE** — neither can be proven: a reachable path exists but a policy
  that could apply to it is unresolved, or path enumeration is partial.

A false SUPPORTED and a false REFUTED are the only unacceptable outcomes. When
in doubt the engine returns INCONCLUSIVE with evidenced boundaries.

## Packages

| Package | Role |
| --- | --- |
| `@vibegate/contracts` | Pure TypeScript types (single source of truth). JSON Schema is generated, never hand-written. |
| `@vibegate/frontend` | TS Compiler API → Semantic IR. Entrypoints, effects, guards, call edges. |
| `@vibegate/engine` | Interprocedural call graph, CFG, dominators, value-flow, the single `rollupVerdict`. |
| `@vibegate/mcp-server` | Six MCP tools over stdio, sandbox-confined file access. |
| `@vibegate/cli` | `vibegate <repo-path>` runs an audit from the shell. |

## Proof templates

One template-agnostic verdict engine covers many vulnerability classes; each
template only differs in how it populates a path's `propertyResults`.

| Template | Property | Covers |
| --- | --- | --- |
| `EFFECT_REQUIRES_RELATION` | `SAME_TENANT` / `OWNS` | IDOR, cross-tenant access |
| `DATA_REACHES_INTERPRETER` | `INPUT_CANNOT_CONTROL_INTERPRETER_SYNTAX`, `OUTPUT_SAFE_FOR_CONTEXT` | SQL injection, XSS |
| `BOUNDARY_PRESERVES_PROPERTY` | `DESTINATION_CONSTRAINED` | open redirect |
| `EFFECT_REQUIRES_STATE` | resource state | unauthorized state transitions |
| `EXCEPTION_FAILS_CLOSED` | `AUTHORIZATION_FAILS_CLOSED` | guards swallowed by try/catch |
| `POLICY_PARITY` | per-channel verdict diff | REST vs Server Action mismatch |

## MCP tools

`security_index`, `security_inventory`, `security_prove`, `security_evidence`,
`security_slice`, and a rule-based `security_scan` (hardcoded secrets, weak
hashing, insecure cookies, disabled TLS). The frozen names are `vibegate`
(server) and `security_prove` (tool); host display names may differ.

## Contracts are the source of truth

TypeScript types in `packages/contracts/src` are authoritative. JSON Schema is
generated from them (`pnpm gen:schema`) and committed. CI regenerates and fails
on drift. Runtime validation (Ajv) happens only at the MCP boundary and when
loading fixtures.

## Running

```
pnpm install
pnpm verify                       # typecheck + build + schema drift + lint + test
node packages/cli/dist/cli.js <repo-path>   # audit a repository
```

The CLI inventories a repository's attack surface and runs the relation proof
against every delete effect, exiting non-zero when a SUPPORTED finding exists.

## Using from Claude Code

The server is registered in `.mcp.json` at the repo root. The tool surfaces to
the agent as `security_prove`. The harness stores no API keys — the agent runs
on its own credentials.
