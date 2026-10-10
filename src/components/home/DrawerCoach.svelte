<script module lang="ts">
import type { CoachPersonality } from "../../../shared/types.js"

type GymDailySummary = {
	todayEvent: { title: string; description: string } | null
	streakBonus: { active: boolean; multiplier: number; currentStreak: number }
}
type Inspiration = {
	message: string
	coachPersonality: CoachPersonality
} | null

// kept outside the component, so reopening the tab shows them at once; swr
// also remembers them on disk for the next visit
const mem = $state<{
	inspiration: Inspiration
	summary: GymDailySummary | null
}>({
	inspiration: null,
	summary: null,
})
</script>

<script lang="ts">
// The drawer's Coach segment: the coach's weekly note, the streak and the
// gym's day (today's event, the streak bonus).
import { onMount } from "svelte"
import { checkinState, loadCheckinStatus } from "../../lib/checkin.svelte.js"
import { swr } from "../../lib/net/swr.js"
import GymActivityCard from "../GymActivityCard.svelte"

const COACH_NAMES: Record<CoachPersonality, string> = {
	friendly: "Coach Sam",
	drill_sergeant: "Sarge",
	roaster: "The Roaster",
	anime_sensei: "Sensei",
	bro: "Bro",
}
const MILESTONES = [7, 30, 100]


const streak = $derived(checkinState.data?.streakCount ?? 0)
const nextMilestone = $derived(MILESTONES.find((m) => m > streak) ?? null)

onMount(() => {
	void loadCheckinStatus()
	void swr<Inspiration>("/inspiration/weekly", (r) => (mem.inspiration = r))
	void swr<GymDailySummary>("/gym/daily-summary", (r) => (mem.summary = r))
})
</script>

<div class="co" data-testid="drawer-coach">
	{#if mem.inspiration}
		<section class="note">
			<b>{COACH_NAMES[mem.inspiration.coachPersonality]}</b>
			<p>{mem.inspiration.message}</p>
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
	{#if mem.summary}
		<GymActivityCard todayEvent={mem.summary.todayEvent} streakBonus={mem.summary.streakBonus} />
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
