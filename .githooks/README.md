# Git Hooks

Centralised hooks that enforce the standards in `CLAUDE.md`.

## Installation

```bash
pnpm setup:hooks
```

Equivalent to: `git config core.hooksPath .githooks`.

## Hooks

### commit-msg
Rejects any commit whose message contains AI attribution markers (`Co-Authored-By: Claude`, `🤖 Generated with`, `noreply@anthropic.com`, etc.). Enforces the "no AI attribution" rule.

(Stylistic prose preferences — words to avoid in commits, prose, etc. — live globally in `~/.claude/CLAUDE.md`. The hook deliberately does not duplicate that list; preferences are stored once.)

### pre-commit
Runs `eslint` against the staged `.ts` files under `src/` and `scripts/`. Skips silently when no relevant files are staged. Fast — no test run.

### pre-push
Runs the full check sequence:
1. `pnpm typecheck`
2. `pnpm lint`
3. `pnpm test`

Blocks the push if any step fails.

## Bypassing (not recommended)

`git commit --no-verify` / `git push --no-verify` bypasses the hooks but violates project standards. Don't.
