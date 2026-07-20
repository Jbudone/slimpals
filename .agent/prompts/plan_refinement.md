# Plan Refinement: JIT Branch State Evaluation

Run this before scoping any issue. Validate the current codebase state against the slice assumptions — the code may have moved since the PRD was written.

## Step 1: Pull branch updates

```bash
git fetch origin
git status
git log --oneline origin/master..HEAD
```

Is the branch ahead of, behind, or diverged from master?

## Step 2: Diff analysis

```bash
git diff origin/master...HEAD --stat
```

For each file in the diff, note whether it's in the blast radius of this slice.

## Step 3: Validate slice assumptions against actual code

Since vertical slices touch multiple layers, check all of them:

**Schema layer** — Read `shared/schema.ts`. Does the current schema match what the slice expects to start from? Are any columns/tables the slice depends on missing or different?

**API layer** — Read the relevant files in `server/routes/`. Do route signatures and response shapes match what the slice assumes?

**UI layer** — Read the relevant `.svelte` files in `src/components/` and `src/pages/`. Do component props and store shapes match?

**Test layer** — Read analogous tests in `tests/`. What patterns are already established? What seams already exist?

## Step 4: Resolve discrepancies

For each assumption that doesn't match reality:
1. Document precisely: "Slice assumed X, current code shows Y."
2. Rewrite the affected task steps to target the actual current state.
3. Update `target_files` in `active_issue` to reflect verified actual paths.
4. Flag any components likely to regress from the changes.

## Step 5: Escalate if necessary

If the slice is entirely invalidated by upstream changes (e.g., the feature it builds on was restructured), stop and tell the user before scoping the issue. Don't guess at a path forward.

## Guardrails

- Never assume a file exists — use `ls` before referencing it.
- Never assume a function signature — use grep to verify.
- If a DB migration is pending (files in `drizzle/` not yet applied), flag it first.
