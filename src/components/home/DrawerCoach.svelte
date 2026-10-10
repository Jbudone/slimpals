<script lang="ts">
// The drawer's Coach segment: the coach's weekly note, the streak and the
// gym's day (today's event, the streak bonus).
import { onMount } from "svelte"
import type { CoachPersonality } from "../../../shared/types.js"
import { api } from "../../lib/api.js"
import { checkinState, loadCheckinStatus } from "../../lib/checkin.svelte.js"
import GymActivityCard from "../GymActivityCard.svelte"

type GymDailySummary = {
	todayEvent: { title: string; description: string } | null
	streakBonus: { active: boolean; multiplier: number; currentStreak: number }
}
type Inspiration = {
	message: string
	coachPersonality: CoachPersonality
} | null

const COACH_NAMES: Record<CoachPersonality, string> = {
	friendly: "Coach Sam",
	drill_sergeant: "Sarge",
	roaster: "The Roaster",
	anime_sensei: "Sensei",
	bro: "Bro",
}
const MILESTONES = [7, 30, 100]

let inspiration = $state<Inspiration>(null)
let summary = $state<GymDailySummary | null>(null)

const streak = $derived(checkinState.data?.streakCount ?? 0)
const nextMilestone = $derived(MILESTONES.find((m) => m > streak) ?? null)

onMount(() => {
	void loadCheckinStatus()
	api
		.get<Inspiration>("/inspiration/weekly")
		.then((r) => (inspiration = r))
		.catch(() => {})
	api
		.get<GymDailySummary>("/gym/daily-summary")
		.then((r) => (summary = r))
		.catch(() => {})
})
</script>

<div class="co" data-testid="drawer-coach">
	{#if inspiration}
		<section class="note">
			<b>{COACH_NAMES[inspiration.coachPersonality]}</b>
			<p>{inspiration.message}</p>
		</section>
	{/if}
	{#if checkinState.data}
		<section class="streak" data-testid="drawer-streak">
			<span class="flame" aria-hidden="true">🔥</span>
			<span class="sc">
				<b>{streak} day{streak === 1 ? "" : "s"}</b>
				<small>
					{checkinState.data.checkedInToday ? "Checked in today." : "Check in before midnight to keep it."}
					{#if nextMilestone && streak > 0}
						{nextMilestone - streak} to the {nextMilestone}-day mark.
					{/if}
				</small>
			</span>
		</section>
	{/if}
	{#if summary}
		<GymActivityCard todayEvent={summary.todayEvent} streakBonus={summary.streakBonus} />
	{/if}
</div>

<style>
.co {
	display: flex;
	flex-direction: column;
	gap: 12px;
	padding-top: 4px;
}

.note {
	padding: 12px 14px;
	border-radius: 16px;
	background: var(--dr-surface, #fff);
	border: 2px solid var(--dr-border, #eaddc4);
}

.note b {
	font: 800 13px ui-rounded, system-ui, sans-serif;
	color: var(--dr-accent, #1f9a55);
}

.note p {
	margin: 4px 0 0;
	font: 500 15px/1.4 system-ui, sans-serif;
}

.streak {
	display: flex;
	align-items: center;
	gap: 12px;
	padding: 12px 14px;
	border-radius: 16px;
	background: #fff4dc;
	border: 2px solid #f2c14a;
}

.flame {
	font-size: 28px;
}

.sc b {
	display: block;
	font: 800 17px ui-rounded, system-ui, sans-serif;
}

.sc small {
	font: 600 12px/1.3 system-ui, sans-serif;
	color: var(--dr-muted, #8d7c66);
}
</style>
