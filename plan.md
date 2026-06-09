# SlimPals — Implementation Plan

SlimPals is a social weight loss & fitness gamification app for a small group of friends and family (2–10 users). It combines daily habit tracking, AI-powered food coaching, a virtual pet companion, social sharing with reactions, micro-tournaments, and rich data visualization — all in one highly personalized, addictive daily experience.

---

## Tech Stack Summary

| Layer | Technology |
|---|---|
| Frontend | Svelte 5 (Runes API), Vite, TypeScript |
| Styling | Tailwind v4 + native CSS theming (CSS custom properties) |
| Routing | Page.js (minimal SPA router) |
| Charts | D3.js (full control, SVG-based) |
| Backend | Express + TypeScript |
| Database | MySQL + Drizzle ORM (Docker Compose in prod; Dreamhost MySQL as fallback) |
| Auth | Better Auth (session-based, invite-only) |
| AI | Google Gemini Flash (vision + text) |
| Image Storage | Local disk (dev + v1); BunnyCDN swap-in for production (abstraction layer ready) |
| Linting/Format | Biome (strict TypeScript + Svelte) |
| Fitness Sync | Apple Health (HealthKit — iOS only; manual entry as universal fallback) |
| State | Svelte 5 Runes only ($state, $derived, $effect) |
| API Protocol | REST (Express routes + Zod validation) |
| Monorepo | Single root package.json, one node_modules |

---

## Monorepo Structure

```
slimpals/
├── package.json              # Root — all deps here
├── biome.json                # Unified linting + formatting
├── tsconfig.json             # Root TS config
├── vite.config.ts            # Svelte 5 SPA
├── index.html                # SPA entry
│
├── src/                      # Svelte 5 frontend
│   ├── main.ts               # App entry
│   ├── app.svelte            # Root component
│   ├── router.ts             # Page.js route definitions
│   ├── lib/
│   │   ├── api.ts            # Typed fetch wrapper
│   │   ├── auth.ts           # Better Auth client
│   │   ├── d3/               # D3 chart components
│   │   └── stores/           # Rune-based global state
│   ├── components/           # Reusable UI components
│   ├── pages/                # Route-level page components
│   └── styles/               # Tailwind + CSS theme tokens
│
├── server/                   # Express backend
│   ├── index.ts              # Server entry
│   ├── routes/               # Express routers
│   ├── middleware/           # Auth guards, error handling
│   ├── services/             # Business logic
│   │   ├── ai/               # Gemini integration
│   │   ├── gamification/     # Streaks, badges, pet logic
│   │   └── challenges/       # Challenge engine
│   └── db/
│       ├── schema.ts         # Drizzle schema
│       ├── migrations/       # Drizzle migrations
│       └── index.ts          # DB connection
│
└── shared/                   # Shared TypeScript types + Zod schemas
    ├── types.ts
    └── schemas.ts
```

---

## Database Schema (MySQL + Drizzle)

### Core Tables

#### `users`
- `id`, `email`, `name`, `avatar_url`
- `invite_code_used`, `invite_code` (generated for sharing)
- `coach_personality` (enum: `drill_sergeant | friendly | roaster | anime_sensei | bro`)
- `view_mode` (enum: `simple | technical`)
- `theme` (string — CSS theme name)
- `created_at`, `updated_at`

#### `sessions` (Better Auth managed)

#### `weight_entries`
- `id`, `user_id`, `weight_kg`, `source` (enum: `manual | apple_health | fitbit | garmin`)
- `note`, `recorded_at`

#### `food_logs`
- `id`, `user_id`, `photo_url` (BunnyCDN URL)
- `ai_analysis` (JSON — nutrients, rating, coach response, roast)
- `ai_edited_photo_url` (BunnyCDN URL — optional)
- `meal_type` (enum: `breakfast | lunch | dinner | snack`)
- `logged_at`, `is_shared`

#### `challenges`
- `id`, `title`, `description`, `month`, `year`
- `theme` (string — e.g. "Jungle Expedition")
- `ai_generated` (bool)
- `tasks` (JSON array of 10–20 sub-tasks)

#### `user_challenges`
- `id`, `user_id`, `challenge_id`
- `completed_tasks` (JSON — checked task IDs)
- `completed_at`

#### `daily_checkins`
- `id`, `user_id`, `date`
- `goals_completed` (JSON), `mood`, `notes`
- `streak_count`

#### `badges`
- `id`, `key` (unique string), `name`, `description`, `icon_url`, `tier`

#### `user_badges`
- `id`, `user_id`, `badge_id`, `earned_at`

#### `pet_companions`
- `id`, `user_id`, `name`, `type` (enum: `dragon | bear | cat | bunny | phoenix`)
- `level`, `xp`, `evolution_stage`
- `equipped_items` (JSON), `last_adventure_at`
- `current_adventure` (JSON — story snippet)

#### `pet_items` (catalog)
- `id`, `name`, `description`, `icon_url`, `rarity`, `unlock_condition`

#### `user_pet_items`
- `id`, `user_id`, `item_id`, `acquired_at`

#### `tournaments`
- `id`, `name`, `creator_id`, `start_date`, `end_date`
- `type` (enum: `weight_loss | step_count | streak | food_challenge`)
- `goal_value`, `reward_description`

#### `tournament_participants`
- `id`, `tournament_id`, `user_id`, `joined_at`, `completed`

#### `social_posts`
- `id`, `user_id`, `type` (enum: `food_photo | ai_message | milestone | weight_update`)
- `content` (JSON — varies by type)
- `created_at`

#### `reactions`
- `id`, `post_id`, `user_id`, `emoji` (enum: `❤️ | 😂 | 💪 | 🔥 | 😭`)

#### `weekly_inspirations`
- `id`, `user_id`, `week_start`, `message`, `generated_at`

#### `invites`
- `id`, `code` (unique), `created_by_user_id`, `used_by_user_id`, `created_at`, `expires_at`

---

## Feature Modules

### 1. Authentication (Better Auth + Invite Codes)
- Better Auth handles session management (cookie-based)
- Registration requires a valid invite code
- First user (admin) is seeded manually or via env var
- Admin dashboard to view/revoke invites

### 2. Weight Tracking + Unified Social Graph
- Users log weight manually or via Apple Health export (JSON/CSV import)
- Main social graph: D3.js multi-line chart showing all friends' weight trajectories overlaid
- Each user gets their own color, with hover tooltips showing name + delta
- Personal goal line (target weight, target date) overlaid on graph
- Toggle: "Compare with friends" / "My Journey Only"
- View modes: **Simple** (clean trend line, milestone markers) vs **Technical** (moving averages, BMI curve, rate-of-loss regression, confidence intervals)

### 3. Food Photo AI Coaching
- User uploads photo → sent to Gemini Flash vision
- AI returns:
  - Food identification + estimated macros
  - Personalized coaching response in user's chosen personality
  - Optional: humorous roast or funny observation
  - Healthier alternative suggestions
  - Optional: AI-edited version of the photo showing healthier swap
- Results stored in `food_logs`, shareable to social feed

### 4. Coach Personalities (Pluggable)
Personalities are stored as system prompt templates. New ones can be added by adding a new entry in a `PERSONALITIES` config map.

| ID | Name | Vibe |
|---|---|---|
| `drill_sergeant` | Sarge | Tough, loud, military metaphors |
| `friendly` | Coach Sam | Warm, encouraging, celebratory |
| `roaster` | The Roaster | Brutally funny, sharp wit |
| `anime_sensei` | Sensei | Philosophical, dramatic, epic |
| `bro` | Bro | Gym-bro hype energy, all caps sometimes |

- Personalities evolve: AI tracks user's history and subtly adapts tone over time
- Users can switch personality anytime in Settings

### 5. Gamification System

#### Daily Check-ins
- Log at least 1 thing per day (weight, food, mood) = check-in complete
- Streak tracker (days in a row)
- Streak frozen for 1 day grace if missed (prevents harsh punishment for casual users)
- At 7/30/100 day streaks: badge + pet XP reward

#### Badges
A catalog of ~50 badges covering:
- Streak milestones
- Weight loss milestones (-5lbs, -10lbs, etc.)
- Food logging consistency
- Challenge completions
- Social interactions (first share, first reaction)
- Tournament wins

#### Pet Companion (Pluggable Gamification System)
- Each user has one pet; can unlock additional pet types
- Pet gains XP from: daily check-ins, challenge completions, badge unlocks
- Pet levels up (1–50), evolves at levels 10, 25, 50
- Each day the pet goes on a short "adventure" and returns with flavor text + occasionally a reward item
- Items can be "equipped" to the pet (visual changes to avatar)
- Pet adventures are AI-generated (Gemini Flash) — short, funny, themed story snippets
- Pet system is wrapped in a `GamificationPlugin` interface so other systems (e.g. avatar, city-builder) can be swapped in

### 6. Monthly Challenges (AI-Curated)
- Each month gets a themed challenge (e.g., "Jungle Expedition — July")
- AI generates 10–20 specific, actionable sub-tasks based on the theme
  - e.g., "Eat a vegetable you've never tried", "Walk 5,000 steps 3 days in a row"
- Users opt in and can check off tasks in a Kanban/checklist view
- Progress shown as a visual progress bar + pet animated celebration on completion
- Monthly challenge completion = major badge + large pet XP reward

### 7. Weekly Sprints
- 5–7 tasks per week, lighter than monthly challenges
- Regenerated each Monday by AI, tailored to user's recent activity
- Tracked separately from monthly challenges

### 8. Micro-Tournaments
- Any user can create a tournament: name, type, goal, end date
- Invite specific friends by username
- Leaderboard visible to participants
- Winner gets a special badge + AI-generated "victory message" in their coach's voice
- Tournament types: weight loss %, step count, check-in streak, food challenge rating

### 9. Social Feed
- Posts from friends appear in a chronological feed
- Post types: food photo, milestone (badge earned), weight update (opt-in), shared AI message, challenge completion
- Reactions: ❤️ 😂 💪 🔥 😭 (emoji reactions, click to toggle)
- Users can control what gets auto-shared vs. what requires manual sharing

### 10. Themes & View Modes
- **Dark mode by default**, light mode toggle
- CSS custom properties drive theming (colors, fonts, border radius, etc.)
- 6 built-in themes at launch:
  - `midnight` (default dark — deep navy/purple)
  - `forest` (earthy greens)
  - `sunset` (warm oranges/pinks)
  - `ocean` (teal/blue)
  - `light` (clean white/grey)
  - `neon` (high contrast cyberpunk)
- View mode per-user: **Simple** (friendly, minimal, big numbers) vs **Technical** (dense graphs, macros, science notes)
- Theme + view mode saved to user profile in DB

### 11. Weekly Inspirational Messages
- Cron job (or scheduled endpoint) generates a weekly message per user on Sunday
- Uses Gemini Flash: "Given this user's week — [stats summary] — write an inspirational message in [personality] style"
- Displayed prominently on the dashboard on Monday

### 12. Apple Health Import
- For v1: users export Apple Health data as XML/JSON, upload via the app
- Server parses the file, extracts weight entries and step counts
- Maps to `weight_entries` and optionally `daily_stats`
- Shows confirmation of what was imported
- Fitbit/Garmin deferred to v2 (they require OAuth app registration)

---

## API Routes (Express REST)

```
POST   /api/auth/*            → Better Auth handlers
GET    /api/users/me          → Current user profile
PATCH  /api/users/me          → Update profile, theme, coach, view mode

GET    /api/weight            → User's weight history
POST   /api/weight            → Log new weight entry
GET    /api/weight/social     → All friends' weight data (for group graph)

POST   /api/food/analyze      → Upload photo → Gemini analysis
GET    /api/food/logs         → User's food log history

GET    /api/challenges/current → Current month's challenge
POST   /api/challenges/:id/join
PATCH  /api/challenges/:id/tasks → Check off tasks

GET    /api/checkins/today    → Today's check-in status
POST   /api/checkins          → Submit daily check-in

GET    /api/gamification/status → Pet, XP, badges, streaks
GET    /api/gamification/pet  → Pet details + adventure
GET    /api/badges            → All badge catalog
GET    /api/badges/mine       → Earned badges

GET    /api/social/feed       → Friend activity feed
POST   /api/social/share      → Share a post
POST   /api/social/react      → Add/remove reaction

GET    /api/tournaments        → Active tournaments
POST   /api/tournaments        → Create tournament
POST   /api/tournaments/:id/join
GET    /api/tournaments/:id/leaderboard

GET    /api/inspiration/weekly → This week's message

GET    /api/invites            → User's invite codes
POST   /api/invites            → Generate new invite code

POST   /api/health/import     → Apple Health file import
```

---

## Frontend Pages

| Route | Page | Description |
|---|---|---|
| `/` | Dashboard | Daily check-in, pet status, streaks, weekly inspiration |
| `/weight` | Weight Tracker | Personal + social D3 graph, log entry |
| `/food` | Food Log | Upload photo, AI analysis results, log history |
| `/challenges` | Challenges | Monthly + weekly challenge boards |
| `/social` | Social Feed | Friend activity, reactions, sharing |
| `/pet` | Pet Companion | Pet details, items, adventure story |
| `/tournaments` | Tournaments | Active + past, leaderboard, create |
| `/badges` | Badge Collection | Earned + locked badges |
| `/settings` | Settings | Profile, coach personality, theme, view mode, invites |
| `/admin` | Admin | User management (admin only) |

---

## AI Integration Architecture

All AI calls go through a single `AIService` class in `server/services/ai/`:

```typescript
class AIService {
  analyzeFood(imageUrl: string, userId: string): Promise<FoodAnalysis>
  generateCoachMessage(context: CoachContext): Promise<string>
  generateWeeklyInspiration(userStats: UserStats): Promise<string>
  generatePetAdventure(pet: Pet, recentActivity: Activity[]): Promise<string>
  generateMonthlyChallenges(theme: string, userProfiles: UserProfile[]): Promise<Challenge[]>
  generateWeeklyTasks(userHistory: UserHistory): Promise<WeeklyTask[]>
  editFoodPhoto(imageUrl: string, suggestions: string[]): Promise<string>
}
```

- All prompts live in `server/services/ai/prompts/` as `.ts` files (one per use case)
- Personality system prompt injected based on user's `coach_personality` setting
- Rate limiting per user per endpoint to control Gemini API costs

---

## Gamification Plugin Interface

To make gamification swappable:

```typescript
interface GamificationPlugin {
  name: string
  onCheckin(userId: string, date: Date): Promise<GamificationReward>
  onBadgeEarned(userId: string, badge: Badge): Promise<void>
  onChallengeCompleted(userId: string, challenge: Challenge): Promise<GamificationReward>
  renderDashboardWidget(): SvelteComponent // Svelte 5 component
}
```

Current implementation: `PetCompanionPlugin`. Future: `AvatarPlugin`, `CityBuilderPlugin`, etc.

---

## Decisions ✅

> [!NOTE]
> **MySQL**: Running MySQL in a Docker container via Docker Compose. Dreamhost managed MySQL available as a drop-in alternative (just swap the `DATABASE_URL` env var). Drizzle makes this seamless.

> [!NOTE]
> **Image Storage**: **Local disk first.** A `StorageService` abstraction layer (`server/services/storage/`) will have two implementations: `LocalStorageService` and `BunnyCDNStorageService`. Swap is one env var change (`STORAGE_PROVIDER=local|bunnycdn`). BunnyCDN account is ready when needed.

> [!NOTE]
> **Gemini API key**: Configure via `.env` as `GEMINI_API_KEY`. Get from Google AI Studio.

> [!NOTE]
> **Apple Health import**: Apple Health exports as XML. Parsed server-side. Fitbit/Garmin deferred to v2.

> [!NOTE]
> **Docker Compose** will run: `app` (Express API + static Svelte build), `mysql` (database). Nginx as reverse proxy with Certbot for TLS.

---

## Build Phases

### Phase 1 — Foundation (Week 1)
- Monorepo scaffolding (Vite + Svelte 5, Express, Biome, TypeScript)
- MySQL + Drizzle schema + migrations
- Better Auth integration (invite-only registration)
- Core pages: Auth, Dashboard shell, Settings
- CSS theme system (Tailwind v4 + CSS custom properties, 6 themes)

### Phase 2 — Core Tracking (Week 2)
- Weight logging (manual entry)
- Social weight comparison graph (D3.js)
- Food photo upload → Gemini Flash analysis
- Coach personality selection + prompt system

### Phase 3 — Gamification (Week 3)
- Daily check-ins + streak system
- Badge system (catalog + earning logic)
- Pet companion (level, XP, adventure generation)
- Monthly + weekly challenges (AI-generated)

### Phase 4 — Social (Week 4)
- Social feed (posts + reactions)
- Micro-tournament system
- Sharing controls (what gets shared automatically vs. manually)
- Weekly inspirational messages (cron/scheduled)

### Phase 5 — Polish (Week 5)
- Technical vs Simple view modes
- All 6 themes
- Apple Health import
- Invite code system
- Admin panel
- Mobile responsiveness

### Phase 6 — Deployment
- Docker Compose (Express + MySQL on cloud VM)
- Nginx reverse proxy + Certbot (Let's Encrypt)
- BunnyCDN integration for image serving
- Environment-based config

---

## Verification Plan

### Automated
- Biome lint + type-check pass: `biome check . && tsc --noEmit`
- Drizzle migration run successfully: `drizzle-kit migrate`

### Manual
- Full auth flow: register with invite, login, logout
- Weight entry + D3 graph renders for multiple users
- Food photo upload + Gemini analysis response
- Daily check-in increments streak
- Pet gains XP, levels up
- Badge unlocked and shown in collection
- Theme switch persists on reload
- Social post appears in friend's feed with reaction
- Tournament created, joined, leaderboard shows
