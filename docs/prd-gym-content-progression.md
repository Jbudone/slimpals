# PRD: Gym Content Progression Ladder

## Problem Statement

Today's gym progression is small and short: 25 fixed upgrades across 5 hardcoded categories (`cardio`/`weights`/`amenities`/`decor`/`staff`), maxing out around level 5 (1500 XP). Both `gymUpgradesCatalog.category` and `gymNpcs.role` are MySQL enums, so adding any genuinely new content type — a boxing room, a hero NPC — requires a schema migration, not just a content addition. This can't support months of progression that keeps feeling like a big deal.

## Solution

Convert the category/role columns from hardcoded enums to open, validated content types, then build out a long tier ladder — named eras spanning a gym's growth from something tiny to something significant — introducing new room/activity categories (boxing, lagree, swimming, punching bags), a staff-and-business-growth track (more employees, then offices), periodic rotating "hero" NPCs (influencers who visit for a limited time, not permanent fixtures), and a recurring in-gym events/classes system. This directly extends the gym-progression-testing work (`docs/prd-gym-progression-testing.md`, issues #60–#63) — that tool's 4 checkpoints (Day 1/7/30/90) are a first pass; this ladder will need more/later checkpoints once it exists.

## Decisions made while scoping this

1. **Hero/influencer NPCs are periodic, rotating visitors, not permanent fixtures** — a famous trainer visits for a limited window, then leaves. Their rarity is the point; a permanent hero would just become another background NPC over time.
2. **"Offices" are business-growth rooms** on the same track as staff growth (reception → manager's office → ownership suite) — a cosmetic/status signal that the gym itself is growing as a business, not a separate member-facing feature.

## User Stories

1. As a user, I want my gym to keep unlocking meaningfully new things for months, not plateau after a few weeks.
2. As a user, I want occasional special/rare content (a visiting hero) that feels different from routine unlocks.
3. As a user, I want to eventually see genuinely different activities in my gym (boxing, swimming, classes), not just more of the same equipment.
4. As a developer, I want adding a new room/activity/NPC type to be a content addition (a catalog row), not a schema migration.

## Implementation Decisions

- **Foundation — open-ended content types**: convert `gymUpgradesCatalog.category` (`server/db/schema.ts:213`) and `gymNpcs.role` (`server/db/schema.ts:240`) from `mysqlEnum` to validated `varchar` + a TypeScript-level allowlist (extendable without a migration each time). Existing 5 categories and 4 roles stay valid values under the new scheme — this is a storage-layer change, not a content change.
- **Long-term tier ladder**: define substantially more XP thresholds than today's 5, grouped into named eras (e.g. Tiny Startup Gym → Neighborhood Regular → Local Hotspot → City Destination → Flagship/Landmark — exact names/count to be finalized in that issue, not locked here). Extends the existing `computeLevel(xp) = floor(sqrt(xp/50))` curve with real catalog content at much higher thresholds rather than replacing the formula.
- **New room/activity categories**: boxing, lagree, swimming, punching bags added as new `gymUpgradesCatalog` categories once the foundation lands — seeded with a small proof set (not exhaustive equipment authoring) per category.
- **Staff & business growth track**: more staff-category NPCs and upgrades (additional trainers, front desk, manager, cleaning staff) plus the new "offices" room progression, on the same unlock track, gated by the new tier ladder.
- **Hero/influencer system**: new scheduling concept distinct from a regular NPC's daily schedule — a hero has an arrival/departure *window* (visits for a limited real-world time span, not a daily recurring slot), special dialog/hype framing, and disappears afterward. This is new simulation behavior, likely a new table (a "guest NPC" or "hero visit" concept) rather than reusing `gymNpcs`' permanent-roster shape as-is.
- **In-gym events/classes**: a genuinely new, recurring (not one-off like heroes) concept — scheduled classes (e.g. "6pm boxing class") that draw NPC attendance and visibly affect crowd/activity level. Needs new schema (an events/class-schedule table) and new simulation logic layered on top of the existing hour-based crowd system. Depends on the new room categories existing (a class needs a room to be held in).

## Testing Decisions

- Foundation (enum→varchar): existing tests referencing category/role values (`tests/gym/*.test.ts`) must keep passing unchanged — this should be invisible at the data-shape level, only the validation layer changes.
- Tier ladder: unit tests asserting the XP curve produces monotonically more unlocks at higher XP with no gaps or inconsistent states, extending the coverage from issue #61.
- Hero NPCs / events: unit tests on the new scheduling/window logic (a hero is present only within its visit window; a class only occurs at its scheduled time); visual verification via screenshot per CLAUDE.md's canvas-testing guidance for how these render.

## Out of Scope

- Authoring the *full* content set (dozens of boxing/swimming equipment items, many hero personalities, many class types) — each content-category issue below ships a small proof set; broad content authoring is an ongoing content pipeline, not a single slice.
- Finalizing exact era names/count/XP thresholds — proposed directionally here, finalized in the tier-ladder issue itself.

## Further Notes

Originally tracked as GitHub issues #64–#69; after a granularity review, #66 and #67 were closed and re-split:

| Issue | Title | Blocked by |
|---|---|---|
| #64 | Open-ended categories/roles foundation (unchanged) | — |
| #65 | Long-term progression tier ladder (unchanged) | #64 |
| #112 | New gym category: boxing | #64, #65 |
| #113 | New gym category: lagree | #64, #65 |
| #114 | New gym category: swimming | #64, #65 |
| #115 | New gym category: punching bags | #64, #65 |
| #116 | Staff growth track | #64, #65 |
| #117 | Offices business-growth track | #64, #65 |
| #68 | Hero/influencer NPCs (unchanged) | #64, #65 |
| #69 | In-gym events/classes system (unchanged) | #64, #65, #112 |

Cross-references issue #109–#111 (progression state derivation, formerly #61) and #62 (checkpoint slider), which will need more/later named checkpoints once this ladder exists — noted on #62 directly rather than reopening it now.
