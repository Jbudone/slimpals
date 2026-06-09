# SlimPals — Product Requirements Document

## Problem Statement

A small group of friends and family (2–10 people) want to lose weight and build healthier habits together, but existing fitness apps are either too generic, too solo-focused, or too clinical. There is no app that combines daily habit accountability, AI-powered food coaching with a personalized voice, social sharing with real reactions from people you know, and addictive gamification — all tailored to a tight-knit group rather than a mass audience.

---

## Solution

SlimPals is a private, invite-only social fitness app for a small friend/family group. It gives every user a daily ritual: check in, log food via photo, track weight, and tend to a virtual pet companion that reflects their consistency. The group shares a live weight graph, reacts to each other's posts, competes in micro-tournaments, and receives AI-generated coaching in a personality they chose. Monthly and weekly AI-curated challenges keep the content fresh without manual curation. Gamification (streaks, badges, pet evolution, tournaments) makes showing up every day feel rewarding rather than obligatory.

---

## User Stories

### Authentication & Onboarding

1. As a new user, I want to register using an invite code from a friend, so that the app stays private to our group.
2. As an admin, I want to generate invite codes and revoke them, so that I control who can join.
3. As a returning user, I want to log in with email and password and have my session persist, so that I don't have to re-authenticate every visit.
4. As a user, I want to be redirected to the dashboard immediately after logging in, so that I can start my daily check-in without extra steps.
5. As a user, I want to log out from any page, so that I can secure my account on a shared device.

### Weight Tracking

6. As a user, I want to log my weight manually from the weight tracker page, so that I can record my progress each day.
7. As a user, I want to see my own weight history as a trend line on a D3 chart, so that I can visualize my progress over time.
8. As a user, I want to see all friends' weight trajectories overlaid on a shared graph, so that I can compare our journeys together.
9. As a user, I want to hover over the group graph and see each person's name and weight delta in a tooltip, so that I can quickly understand who is making progress.
10. As a user, I want to set a target weight and target date, so that a personal goal line appears on my graph showing where I need to be.
11. As a user, I want to toggle between "My Journey Only" and "Compare with Friends" views, so that I can focus on my own data when I need privacy.
12. As a user in Simple view mode, I want the graph to show a clean trend line with milestone markers, so that the data feels encouraging rather than overwhelming.
13. As a user in Technical view mode, I want the graph to show moving averages, BMI curve, rate-of-loss regression, and confidence intervals, so that I can engage with the science behind my progress.
14. As a user, I want to import weight data from an Apple Health XML export, so that I don't have to manually re-enter historical data.

### Food Photo AI Coaching

15. As a user, I want to upload a photo of my meal and receive an AI analysis within seconds, so that I get instant feedback on what I'm eating.
16. As a user, I want the AI to identify the food in my photo and estimate macronutrients, so that I understand the nutritional content without manual lookup.
17. As a user, I want the AI coaching response delivered in my chosen personality (Sarge, Coach Sam, The Roaster, Sensei, or Bro), so that the feedback feels personal and entertaining.
18. As a user, I want the AI to suggest healthier alternatives to my meal, so that I learn what I could eat instead.
19. As a user, I want the option to receive an AI-edited version of my food photo showing a healthier swap, so that I can visualize what a better choice looks like.
20. As a user, I want to tag my meal as breakfast, lunch, dinner, or snack, so that my food log is organized by meal type.
21. As a user, I want to share my food analysis to the social feed, so that my friends can see what I'm eating and react.
22. As a user, I want to view my full food log history, so that I can review past meals and see patterns.

### Coach Personalities

23. As a user, I want to select a coach personality in Settings, so that all AI responses match the tone I find most motivating.
24. As a user, I want to switch my coach personality at any time, so that I can change my experience without losing my data.
25. As a user, I want my coach's tone to subtly adapt over time based on my history, so that the coaching feels increasingly personal.

### Daily Check-ins & Streaks

26. As a user, I want to complete a daily check-in by logging at least one thing (weight, food, or mood), so that my streak counter advances.
27. As a user, I want to see my current check-in streak prominently on the dashboard, so that I feel motivated to maintain it.
28. As a user, I want a one-day grace period if I miss a check-in, so that a single bad day doesn't reset my streak.
29. As a user, I want to earn badges and pet XP at 7, 30, and 100-day streaks, so that long-term consistency is meaningfully rewarded.
30. As a user, I want to see today's check-in status at a glance on the dashboard, so that I know immediately if I still need to log something today.

### Badges

31. As a user, I want to earn badges for streak milestones, so that consistency is visibly recognized.
32. As a user, I want to earn badges for weight loss milestones (−5 lbs, −10 lbs, etc.), so that reaching goals feels like an achievement.
33. As a user, I want to earn badges for food logging consistency, so that building the habit is rewarded.
34. As a user, I want to earn badges for completing monthly challenges, so that finishing big goals is celebrated.
35. As a user, I want to earn badges for social interactions (first share, first reaction), so that engaging with the community is encouraged.
36. As a user, I want to earn badges for winning tournaments, so that competitive effort is recognized.
37. As a user, I want to browse the full badge catalog with locked and earned badges shown, so that I can see what I'm working toward.

### Pet Companion

38. As a user, I want to have a pet companion (dragon, bear, cat, bunny, or phoenix) assigned to my account, so that I have a gamification avatar to care for.
39. As a user, I want my pet to gain XP from daily check-ins, badge unlocks, and challenge completions, so that consistent activity grows my pet.
40. As a user, I want my pet to level up from 1–50 and evolve at levels 10, 25, and 50, so that long-term progress changes my pet visually.
41. As a user, I want my pet to go on a daily AI-generated adventure and return with flavor text, so that the pet page feels alive every day.
42. As a user, I want my pet to occasionally bring back reward items from adventures, so that there is a surprise element to daily engagement.
43. As a user, I want to equip items on my pet to change its appearance, so that I can personalize my companion.
44. As a user, I want to see my pet's XP bar, level, and evolution stage on the pet page, so that I understand how close I am to the next milestone.

### Monthly Challenges

45. As a user, I want to see the current month's themed challenge (e.g., "Jungle Expedition — July") with 10–20 AI-generated sub-tasks, so that there is always fresh content to engage with.
46. As a user, I want to opt into the monthly challenge, so that only willing participants are tracked.
47. As a user, I want to check off individual sub-tasks in a Kanban/checklist view, so that I can track granular progress.
48. As a user, I want to see a visual progress bar for my challenge completion, so that I'm motivated to finish.
49. As a user, I want my pet to play an animated celebration when I complete the monthly challenge, so that the achievement feels satisfying.
50. As a user, I want to earn a major badge and large pet XP reward upon completing the monthly challenge, so that finishing is meaningfully rewarded.

### Weekly Sprints

51. As a user, I want to see 5–7 lighter tasks generated fresh each Monday, so that there is a weekly rhythm of smaller goals.
52. As a user, I want my weekly sprint tasks to be tailored to my recent activity, so that they feel relevant and achievable.
53. As a user, I want weekly sprints tracked separately from monthly challenges, so that I can pursue both simultaneously without confusion.

### Micro-Tournaments

54. As a user, I want to create a tournament with a name, type (weight loss %, step count, check-in streak, food challenge rating), goal value, and end date, so that I can organize friendly competitions.
55. As a user, I want to invite specific friends to my tournament by username, so that participation is opt-in.
56. As a tournament participant, I want to see a live leaderboard, so that I can track standings throughout the competition.
57. As a tournament winner, I want to receive a special badge and an AI-generated victory message in my coach's voice, so that winning feels personal and celebrated.
58. As a user, I want to see all active and past tournaments I'm part of, so that I can follow ongoing competitions and review results.

### Social Feed

59. As a user, I want to see a chronological feed of friends' posts (food photos, badges earned, weight updates, shared AI messages, challenge completions), so that I stay connected to the group's progress.
60. As a user, I want to react to posts with ❤️ 😂 💪 🔥 😭, so that I can quickly acknowledge my friends' efforts.
61. As a user, I want to toggle reactions on and off with a single click, so that reacting feels effortless.
62. As a user, I want to control what gets auto-shared vs. what requires manual sharing, so that I have privacy control over my activity.
63. As a user, I want to manually share any food log, milestone, or weight update to the feed, so that I can choose when to celebrate with the group.

### Weekly Inspirational Messages

64. As a user, I want to receive a weekly AI-generated inspirational message every Monday on my dashboard, so that the start of each week feels intentional.
65. As a user, I want my weekly inspiration to be written in my chosen coach personality, so that it feels consistent with the rest of my experience.
66. As a user, I want the message to reference my actual stats from the previous week, so that it feels specific to me rather than generic.

### Themes & View Modes

67. As a user, I want to choose from 6 themes (midnight, forest, sunset, ocean, light, neon) in Settings, so that the app matches my aesthetic preference.
68. As a user, I want my theme choice to persist across sessions, so that I never have to re-select it.
69. As a user, I want to toggle between Simple and Technical view modes, so that I can match the app's data density to my preference.
70. As a user, I want the app to default to dark mode (midnight theme), so that it's easy on the eyes without any configuration.

### Settings & Profile

71. As a user, I want to update my display name and avatar in Settings, so that the group recognizes me in the feed.
72. As a user, I want to see and share my personal invite code in Settings, so that I can invite new people to the group.
73. As a user, I want to see all invite codes I've generated and their used/unused status, so that I can track who I've invited.

### Admin

74. As an admin, I want to view all users in a management panel, so that I can see who has joined the app.
75. As an admin, I want to revoke invite codes, so that I can prevent unauthorized registrations.

---

## Implementation Decisions

### Monorepo Structure
- Single root `package.json` with one shared `node_modules`. Frontend (`src/`), backend (`server/`), and shared types (`shared/`) coexist in the same repo. Biome handles unified linting and formatting across all layers.

### Frontend
- Svelte 5 with Runes API only (`$state`, `$derived`, `$effect`). No Svelte stores. Page.js handles client-side routing. D3.js renders all charts as SVG. Tailwind v4 with CSS custom properties drives theming — six named themes defined as token sets, switched by setting a `data-theme` attribute on the root element.

### Backend
- Express with TypeScript. All route inputs validated with Zod before touching business logic. Auth middleware guards all `/api/*` routes except `/api/auth/*`. Better Auth manages sessions via HTTP-only cookies.

### Database
- MySQL running in Docker Compose for local dev and production. Drizzle ORM for schema definition and migrations. Dreamhost managed MySQL is a drop-in swap via `DATABASE_URL` env var.

### Auth
- Better Auth handles session management. Registration is gated by a valid, unused invite code from the `invites` table. The first admin user is seeded via env var or a one-time seed script. Invite codes have an expiry timestamp.

### AI Integration
- All AI calls are encapsulated behind a single `AIService` class with a stable interface. Prompts live as separate TypeScript files per use case. Coach personality system prompts are injected at call time based on the user's `coach_personality` setting. Per-user rate limiting is enforced at the route level to control Gemini API costs.

### Image Storage
- A `StorageService` abstraction with two concrete implementations: `LocalStorageService` (dev + v1) and `BunnyCDNStorageService` (production swap-in). The active implementation is selected via `STORAGE_PROVIDER` env var. No other code is aware of which provider is active.

### Gamification Plugin System
- The pet companion is implemented as a `PetCompanionPlugin` conforming to a `GamificationPlugin` interface. This interface exposes hooks (`onCheckin`, `onBadgeEarned`, `onChallengeCompleted`) and a dashboard widget component. Future gamification systems (avatar, city-builder) implement the same interface without changing core logic.

### Schema Decisions
- `food_logs.ai_analysis` is a JSON column storing the full Gemini response (macros, rating, coach message, suggestions).
- `challenges.tasks` is a JSON array of sub-task objects with stable IDs.
- `user_challenges.completed_tasks` is a JSON array of completed task IDs, diffed against `challenges.tasks` to compute progress.
- `pet_companions.current_adventure` is a JSON column storing the latest AI-generated adventure snippet and any reward earned.
- `reactions.emoji` is an enum constrained to the five supported emoji.

### Apple Health Import
- v1: XML file upload only. Server parses the Apple Health export format server-side, extracts weight entries and step counts, and maps them to `weight_entries`. The user sees a confirmation of how many entries were imported. Fitbit and Garmin require OAuth app registration and are deferred to v2.

### Weekly Inspiration Generation
- A scheduled endpoint (or cron job) runs each Sunday and calls `AIService.generateWeeklyInspiration` for each active user. The result is stored in `weekly_inspirations` and surfaced on the dashboard the following Monday.

---

## Testing Decisions

### What makes a good test
- Tests assert on externally observable behavior: HTTP response status codes, response body shape, database state after an operation, and rendered DOM content. Tests must not assert on internal implementation details such as which functions were called, internal state shape, or module structure. A test should remain valid through a refactor that preserves behavior.

### Seams (highest to lowest)

**REST API layer (primary seam):** All server-side features are tested as HTTP integration tests against a real test database. A test spins up the Express app and issues real HTTP requests. This is the highest reliable seam — it validates routing, middleware, Zod validation, business logic, and DB writes in one pass.

**AIService boundary:** The `AIService` interface is the only thing mocked in server tests. All other server code runs real. This means AI-dependent features (food analysis, pet adventures, weekly inspiration, challenge generation) are tested with a stub that returns deterministic fixture responses, keeping tests fast and free of API costs.

**StorageService boundary:** `StorageService` is mocked at its interface in tests that involve image upload paths. The real `LocalStorageService` is tested separately in isolation.

**Svelte component behavior (browser seam):** Key user flows (auth, food upload, weight graph render, social reactions, theme switching) are tested with Playwright against the running app. Tests assert on rendered DOM and network calls, not component internals.

### Modules to test
- Auth routes (registration with valid/invalid invite codes, login, logout, session persistence)
- Weight routes (log entry, history retrieval, social graph endpoint)
- Food routes (upload triggering AI analysis, log history)
- Check-in routes (streak increment, grace period logic, today's status)
- Challenge routes (join, task completion, progress calculation)
- Gamification routes (XP award on check-in, badge unlock, pet level-up)
- Social routes (feed retrieval, post sharing, reaction toggle)
- Tournament routes (create, join, leaderboard ordering)
- Invitation routes (generate, use, expiry enforcement)
- Theme/view mode persistence (PATCH /api/users/me + verify DB write)

### Prior art
- No existing tests in the codebase (greenfield). The patterns above establish the conventions for the project.

---

## Out of Scope

- **Fitbit / Garmin integration** — deferred to v2; these require OAuth app registration with each provider.
- **Native mobile app** — v1 is a mobile-responsive web app only; HealthKit direct sync (without XML export) requires a native iOS app.
- **Real-time push notifications** — the social feed is pull-based in v1; WebSocket or push notification support is deferred.
- **In-app messaging / comments** — reactions are the only social interaction in v1; threaded comments are deferred.
- **Additional gamification plugins** (AvatarPlugin, CityBuilderPlugin) — the interface is defined but only `PetCompanionPlugin` is implemented in v1.
- **Fitbit/Garmin step count sync** — step counts can be entered manually or imported via Apple Health export only.
- **Public/shareable profile pages** — the app is invite-only and all content is visible only to group members.
- **Payment / subscription system** — v1 is self-hosted with no monetization layer.

---

## Further Notes

- **Deployment target:** Docker Compose on a cloud VM running Express (serving both API and the static Svelte build) + MySQL. Nginx as reverse proxy with Certbot for TLS. BunnyCDN account is already provisioned for when the image storage swap is needed.
- **Gemini API key** is configured via `GEMINI_API_KEY` env var. Rate limiting per user per AI endpoint is enforced server-side to control costs.
- **Build phases** are structured across six weeks: Foundation → Core Tracking → Gamification → Social → Polish → Deployment. The plan.md file contains the full week-by-week breakdown.
- **Theme system** relies entirely on CSS custom properties toggled via `data-theme`. No JavaScript theme logic beyond setting that attribute and saving the preference to the user's profile.
