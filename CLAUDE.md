# CLAUDE.md

## Critical Rules

1. **NEVER commit or push without explicit instruction** — make file changes freely, but `git commit` and `git push` each require the user to explicitly ask for that specific action. Do not anticipate, chain, or assume the next step. Pattern-matching on previous flows is not permission.
2. **No code comments** — no `//`, no `/* */`, no JSDoc `/** */`. Use self-documenting names. When editing existing code, remove stray comments rather than preserve them.
3. **No AI attribution in commits** — no `Co-Authored-By`, no `Generated with`, nothing.
4. **No `console.log()`** — use the project pino `logger` from `src/logger.ts`.
5. **Interfaces in model/schema files only** — never define inline in routers/handlers.
6. **DRY** — search for existing implementations before writing new code. Reuse and enhance, never duplicate.
7. **Consumer-agnostic copy** — admin UI, README and OpenAPI text must not privilege any one consumer (NGX, MailMan, HQ) over the others. They are equal first-class consumers of this mock.

## Project Overview

- **Purpose**: Standalone reference mock of the Ramblers Salesforce member API (nbarrett/ngx-ramblers#209). Shared dev fixture for NGX, MailMan and HQ.
- **Architecture**: Node 20 + Express + Mongoose (MongoDB) + ExcelJS, with a vanilla TypeScript admin SPA bundled by esbuild.
- **Repository**: https://github.com/nbarrett/ramblers-salesforce-mock
- **Backend**: `src/` (TypeScript only, never `.js`)
- **Admin client**: `src/admin/client/` bundled to `public/admin.js`
- **Static admin shell**: `public/admin.html`, `public/admin.css`
- **Database models**: `src/db/models/`
- **Insight Hub ingest**: `src/ingest/` (xlsx parser/writer, column map, synthetic generator)
- **Public API**: `src/api/` (member router, OpenAPI spec, mappers)

## Code Style

- **Double quotes** always, never single quotes
- **No "get" prefixes** on methods (`tenant()` not `getTenant()`)
- **`undefined` for absence** in this repo (matches existing ParsedMember/SyntheticOptions shape — do not switch to `null` mid-file)
- **`T[]` not `Array<T>`**
- **Immutable operations** — prefer `map`/`reduce`/`filter` over mutation
- **Structured branching** — prefer `if/else if/else` over scattered early returns where it aids readability; early returns are fine for guard clauses
- **UK English** in commits, README, admin copy ("centralised", "colour", "behaviour")
- **Minimal changes** — keep patches targeted and scoped

## Bans

| Banned | Use instead |
|--------|------------|
| `console.log/warn/error` | `logger` from `src/logger.ts` (`logger.info({ ... }, "msg")`) |
| Inline comments (`//`, `/* */`, `/** */`) | Self-documenting code |
| `any` (without justification) | Concrete types or `unknown` + narrowing |
| Re-implementing existing helpers | Search `src/` first |
| `^` / `~` ranges in `package.json` | Pin every dependency to an exact version. The lockfile is authoritative; `package.json` should agree |

## Git Workflow

- **Conventional commits**: `<type>(<scope>): <description>` (feat, fix, refactor, test, docs, style, build, ci)
- **Commit message style**: paragraph-style body explaining the root cause and supporting fixes; no bullet-only summaries; no AI attribution trailers
- **100% trunk-based — no PRs, no branches, no worktrees.** All work goes directly on `main` as plain commits to `origin/main`. Never run `git checkout -b`, never run `gh pr create`, never use a worktree unilaterally. Issues are the unit of work — reference them on the subject line as `(#N)`; multiple related fixes belong in one commit, not a stack
- **No literal `\n`** in commit messages — use real newlines or multiple `-m` flags
- **Hook setup**: `pnpm setup:hooks` (one-off, sets `core.hooksPath` to `.githooks/`). The hooks enforce no-AI-attribution on `commit-msg`, lint on `pre-commit`, and lint/typecheck/test on `pre-push`. Stylistic prose preferences (words to avoid) live globally in `~/.claude/CLAUDE.md` and are not duplicated in this repo

## Amend vs New Commit

| Situation | Action |
|-----------|--------|
| Pre-commit hook blocked the commit | Fix, re-stage, `git commit --amend` |
| Pre-push hook blocked the push | Fix, re-stage, `git commit --amend` — commit never reached remote |
| Push succeeded but CI failed | New commit — original is already on remote |

## Error Handling

- No empty catch blocks — always log via `logger` or return a safe default
- Prefer small, targeted try/catch blocks; let `asyncHandler` surface anything else
- Public API errors use the shape `{ error: { code, message } }` (see `src/api/errors.ts`)

## Backend Patterns

- **Logger**: `import { logger } from "./logger.js"` (note the `.js` extension — this is an ESM project compiled from TS)
- **Async route handlers**: wrap with `asyncHandler` from `src/api/async-handler.ts`
- **Validation**: `zod` schemas at the route boundary; never trust unvalidated `req.body`
- **Mongoose models**: schema, indexes and the `Attrs` interface live together in `src/db/models/<thing>.model.ts`; export via `src/db/models/index.ts`
- **OpenAPI**: keep `src/api/openapi.ts` aligned with the actual route shapes — drift is a bug

## Admin Client Patterns

- Vanilla TypeScript, no framework. Bundled with Vite (`vite build` → `public/admin.js`) for prod; Vite middleware mode mounted in Express for dev gives true HMR on `:8080`
- DOM access via `document.querySelector` with explicit type assertions; keep selectors close to their handler
- Network calls via `fetch` with explicit JSON parsing; no global ajax helper unless one already exists in `src/admin/client/`
- Admin pages render from `src/admin/client/admin.html` (the authoritative HTML — Vite reads from this in dev and builds from it for prod) — keep new sections consistent with existing layout/spacing. `public/admin.html` is generated by `pnpm build:client` and gitignored

## Testing

- **Vitest** (`pnpm test`) — Mongo-backed integration tests use `mongodb-memory-server` patterns where applicable
- Add tests when fixing bugs that have a clear deterministic repro
- Synthetic data tests should cover edge counts (0, 1, large) and uniqueness invariants

## Commands

```bash
pnpm dev                   # tsx watch on src/server.ts (admin client gets Vite HMR)
pnpm build                 # server (esbuild) + client (vite build) + release-notes bundle
pnpm start                 # run dist/server.js
pnpm typecheck             # tsc --noEmit
pnpm lint                  # eslint src/ scripts/
pnpm test                  # vitest run
pnpm check:schema-drift    # detect drift between models and openapi
pnpm setup:hooks           # one-off — activate .githooks/ for this clone
```

`corepack enable` once on a fresh checkout activates the pnpm version pinned in `packageManager`.

## Mock-Specific Conventions

- **Insight Hub xlsx contract**: `src/ingest/columns.ts` and `xlsx-parser.ts` mirror the real Insight Hub `ExportAll.xlsx` exactly — column order, header text, and the worksheet name (`Full List`) are authoritative for downstream consumers (especially ngx-ramblers' `member-bulk-load.ts`). Cross-check against the local archive at `/Users/nick/Documents/Ramblers/Ramblers-ngx-ramblers/ramblers/salesforce-integration/ExportAll.xlsx` when changing the column set
- **Synthetic data uniqueness**: consumers may enforce unique indexes on member fields (e.g. ngx-ramblers' `(lastName, firstName, nameAlias)`). The synthetic generator must produce data that imports cleanly into those collections
- **Granular consent**: the three flags (`groupMarketingConsent`, `areaMarketingConsent`, `otherMarketingConsent`) are part of the API contract but not the Insight Hub xlsx contract. Direct ingest preserves them; xlsx round-trip drops them by design
- **Tenant isolation**: every query must scope by `tenantCode`. `assertOwnsTenant` enforces operator-to-tenant binding for write paths
