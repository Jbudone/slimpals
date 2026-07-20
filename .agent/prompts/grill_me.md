# Intake Interview Protocol

This file documents the intake philosophy. The actual interview is run via the `/grill-me` skill.

## Rules (from `/grill-me`)
- Ask questions **one at a time**
- Provide your **recommended answer** for each question, based on codebase exploration
- If a question can be answered by reading the code, read the code instead of asking
- Explore the relevant schema, routes, and components before starting the interview

## Scope for this project

Focus the interview on:

1. **Scope** — What exactly does this feature do? What triggers it? What does it NOT do? Which existing screens or routes are affected?

2. **Data & State Impact** — New DB tables or columns? Reads from existing tables? Changes to Svelte stores? Session-persistent vs ephemeral?

3. **Technical Constraints** — Performance targets, responsive breakpoints, auth/role requirements, real-time (WebSocket/SSE), external API dependencies?

4. **Edge Cases** — Empty state, network failure, unauthorized access, degraded mode?

5. **Acceptance** — 3–5 specific testable criteria, step-by-step happy path?

## What NOT to ask about (answer from code)
- Which files exist — read the filesystem
- Current schema shape — read `shared/schema.ts`
- Existing route structure — read `server/routes/`
- Component patterns — read `src/components/`
- Test patterns — read `tests/`
