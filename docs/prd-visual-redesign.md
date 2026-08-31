# PRD: Visual Redesign (design-system overhaul + IA restructure)

## Problem Statement

The app has shipped 20 feature issues' worth of functionality with no shared visual language: colors are tokenized (6 `data-theme` palettes) but typography, spacing, radius, and shadows are hardcoded per-page, there's no icon library (raw emoji stand in), no shared component kit, and navigation is a flat 10-item text link bar. Reference mockups in `docs/look/` (8 screens x 2 palettes) define a cohesive new look: serif display headings over sans body text, line icons, a 4-item bottom tab bar, pill-shaped controls, card-based layouts, and a consolidated information architecture.

## Solution

Rebuild the app on a proper design-token system (color + type + space + radius + shadow) and a small shared UI kit, re-skin every screen to match the mockups, and restructure navigation from 10 flat routes into 4 tabs (**Today / Progress / Compete / Social**) with sub-navigation where the mockups show it (Weight/Food under Progress; Tournaments/Challenge/Badges/Gym under Compete).

## Decisions made while translating mockups to the real app

These weren't fully specified by the mockups alone — flagging the calls made so they can be redirected before issues go out:

1. **The two mockup palettes become the two flagship themes**, not a replacement of the existing 6-theme system. The dark mockup palette becomes the new `midnight` (replacing its current colors), the light one becomes a new `cream` theme. The other 4 existing themes (`forest`, `sunset`, `ocean`, `neon`) keep their identity but get their color tokens re-derived once the new spacing/type/shape tokens exist, so they don't look broken against the new component shapes — this is a small mechanical slice, not a redesign of 4 more palettes from scratch.
2. **Gym canvas placement** (mockups don't show it): the `Compete > Gym` sub-tab shows the upgrade/shop list exactly as mocked, plus a "Visit your gym" entry card that launches the existing Phaser canvas experience full-screen (all the NPC/animation work stays as-is, just re-skinned chrome around it). Additionally, the **Today** screen gets a new small "Gym activity" card — ambient notifications like "Marcus just hit a PR" or "2 pals are in the gym now," sourced from existing NPC/gym-sim state — so the living-world feel of the gym surfaces without requiring a full canvas visit every time. This is the "notifications list" the mockups don't have room for.
3. **Settings and Admin aren't in the 4-tab bar** (mockups don't show them either) — both move behind the avatar circle (top-right "AK") as a dropdown/menu: Settings always, Admin only when `isAdmin`. This is a net win for the admin-visibility requirement from `docs/admin-testing-requirements.md` — admin becomes reachable only through an explicit, distinct menu rather than sitting in the everyday nav.
4. **Reactions** — decided: keep the existing 5-emoji data model and schema untouched (❤️😂💪🔥😭, no migration), render each as an icon+label chip in the new pill style. The mockup's 3-reaction look ("Nice / Ha / Beast") was mockup shorthand, not a scope change.
5. **Global persistent streak indicator**: the flame+count pill currently only lives on the Dashboard card; mockups show it in the header on every screen. Promoting it to the new shared header is part of the nav-shell slice.

## User Stories

1. As a user, I want the app to feel visually cohesive and polished, so that it feels like a finished product rather than a prototype.
2. As a user, I want a bottom tab bar with the sections I actually use daily (Today, Progress, Compete, Social), so that navigation is faster than hunting through 10 top-nav links.
3. As a user, I want to see my streak at a glance from anywhere in the app, not just the dashboard.
4. As a user, I want ambient visibility into what's happening in my gym (NPCs, upgrades) without always opening the full canvas view.
5. As a returning user, I want my existing theme preference and data to keep working exactly as before — this is a re-skin, not a data migration.
6. As an admin, I want the admin area to be clearly, unmistakably an admin surface (ties to `docs/admin-testing-requirements.md` Part 1 §2).

## Implementation Decisions

- Extend `app.css`'s token system beyond color: add spacing, radius, shadow, and typography (font-family, sizes, weights) as CSS custom properties, so all 6 themes inherit shape/type changes automatically and only color needs per-theme authoring.
- Add a serif display font (self-hosted or Google Fonts) for headings/large numerals; keep a sans body face. Add an icon library (e.g. an SVG icon set) to replace emoji-as-icon usage in nav and inline glyphs — emoji stay only where they're semantically emoji (reactions, streak flame if kept as an emoji).
- Build a small shared component kit consumed by every page going forward: `Card`, `Button`, `Pill`/`SegmentedTabs`, `ProgressBar`, `Avatar`, `ReactionChip`. Existing ad-hoc per-page `.card`/`.badge` styles get migrated to these as each screen is redone — not a big-bang refactor.
- Replace the flat top-nav (`app.svelte`) with: a bottom tab bar (mobile-style, per mockups) for Today/Progress/Compete/Social, a shared header (logo, streak pill, avatar menu), and sub-tab pill groups within Progress and Compete for their respective child sections. Existing routes redirect into the new structure rather than being deleted outright where meaningful (e.g. `/weight` still works, rendering inside the Progress shell).
- No schema changes anticipated except possibly a new `users` preference if needed for the avatar-menu state — to be confirmed per-slice, not assumed up front.

## Testing Decisions

- This is almost entirely front-end/visual work — automated tests here are limited to: routing still resolves correctly, existing API contracts are unchanged, and any logic that moves (e.g. reaction rendering) keeps its existing test coverage passing.
- Primary verification is visual: each slice's completion criterion is "screenshot matches the corresponding mockup(s) in `docs/look/`, both palettes." Per CLAUDE.md, canvas-involving slices (the gym entry point) need screenshot comparison; DOM-only slices can be checked with a headless browser + Playwright/DOM inspection.
- This PRD deliberately doesn't duplicate `docs/admin-testing-requirements.md` — the admin-panel visual pass (item 6 above) is listed as a task here for sequencing, but its acceptance bar (unmistakable admin identity) is defined there.

## Out of Scope

- Any new product feature or scope change beyond what's needed to fit existing features into the new IA (e.g. reducing reactions to 3 types, redesigning badge-earning logic, changing tournament scoring).
- Rebuilding the Phaser canvas's internal rendering — only its surrounding chrome (GymUI/NpcDialog framing) gets re-skinned.
- Re-authoring the 4 legacy theme palettes' *content* — only re-deriving their existing colors against new shape/type tokens so they still render correctly.

## Further Notes

Originally tracked as GitHub issues #31–#41. Re-split into finer-grained issues after review (see `docs/admin-testing-requirements.md`-style granularity discussion) — current tracking:

| Original slice | Now tracked as |
|---|---|
| Foundation (#31, closed) | #70 (design tokens), #71 (font + icons), #72 (UI kit + proof screen) |
| Nav shell (#32, closed) | #73 (bottom tab bar), #74 (header + streak pill), #75 (avatar menu) |
| Today screen (#33, closed) | #76 (core redesign), #77 (gym activity card) |
| Progress screen (#34, closed) | #78 (Weight tab), #79 (Food tab) |
| Compete: Tournaments | #35 (unchanged) |
| Compete: Challenge | #36 (unchanged) |
| Compete: Badges | #37 (unchanged) |
| Compete: Gym (#38, closed) | #80 (upgrade list), #81 (canvas entry point) |
| Social | #39 (unchanged) |
| Legacy theme re-derivation | #40 (unchanged) |
| Admin panel visual pass | #41 (unchanged) |
