# @titanium-sdk/cj-module-lexer

## OVERVIEW
TypeScript port of `es-module-lexer`'s C state machine, retargeted at CommonJS `require()` calls. Walks source character-by-character with an open-token stack to find safe (statically-analyzable) and unsafe (dynamic) `require(...)` expressions — without parsing a full AST.

## STRUCTURE
```
src/
├── index.ts        # parseRequires(code, filename?) — single export, ~600 lines, state-machine driven
└── index.spec.ts   # vitest specs
```

## WHERE TO LOOK
| Task | File |
|------|------|
| Public API | `index.ts:43` `parseRequires` |
| Token state enum | `index.ts:28` `OpenTokenState` (Paren=odd, Brace=even) |
| Pre-allocated open-token stack | `index.ts:49` (size 1024) |
| Dynamic-specifier eval evaluation | `index.ts:621` (eslint-disabled `no-unsafe-return`) |
| Add a test case | `index.spec.ts` |

## CONVENTIONS
- File is a near-direct port of upstream `es-module-lexer/src/lexer.c`. The header comment cites the source commit (`d44ad4a`, `lexer.c#L845`). **Preserve algorithmic structure** when patching — variable names and control flow mirror the C original.
- Pre-allocated stack of 1024 entries is intentional. Do not replace with a growing array; the upstream perf assumption is fixed-size.
- This is the only place in the codebase where `eval()` and `eslint-disable @typescript-eslint/no-unsafe-return` / `no-unnecessary-condition` are tolerated. Both are scoped to dynamic-specifier evaluation (`index.ts:621`, `:629`).

## ANTI-PATTERNS
- Don't refactor toward a generic AST visitor — the entire point is avoiding a parser.
- Don't add ESM (`import`/`export`) detection. That belongs in upstream `es-module-lexer`. This package is CommonJS-only.

## NOTES
- The only package in the monorepo with a Vitest suite (`pnpm -F @titanium-sdk/cj-module-lexer test`).
- No external runtime dependencies — just the lexer.
