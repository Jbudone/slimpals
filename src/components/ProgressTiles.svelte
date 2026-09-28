<script lang="ts">
// Weight and "eaten today" tiles (moved from the old Dashboard) at the top
// of the Progress tab.
import { onMount } from "svelte"
import { api } from "../lib/api.js"
import { userProfile } from "../lib/user.svelte.js"
import Card from "./ui/Card.svelte"
import ProgressBar from "./ui/ProgressBar.svelte"

type WeightEntry = { id: number; weightKg: number; recordedAt: string }

type FoodLog = {
	id: number
	aiAnalysis: { macros: { calories: number } } | null
	loggedAt: string
}

let weightSummary = $state<{
	latestKg: number
	changeKg: number | null
} | null>(null)
let foodTodayCalories = $state<number | null>(null)

function isToday(iso: string): boolean {
	const d = new Date(iso)
	const now = new Date()
	return (
		d.getFullYear() === now.getFullYear() &&
		d.getMonth() === now.getMonth() &&
		d.getDate() === now.getDate()
	)
}

async function loadWeightSummary() {
	try {
		const entries = await api.get<WeightEntry[]>("/weight")
		if (entries.length === 0) return
		const latestKg = entries[entries.length - 1].weightKg
		const changeKg = entries.length > 1 ? latestKg - entries[0].weightKg : null
		weightSummary = { latestKg, changeKg }
	} catch {
		// ignore: tile stays hidden
	}
}

async function loadFoodToday() {
	try {
		const logs = await api.get<FoodLog[]>("/food/logs")
		foodTodayCalories = logs
			.filter((l) => isToday(l.loggedAt))
			.reduce((sum, l) => sum + (l.aiAnalysis?.macros.calories ?? 0), 0)
	} catch {
		// ignore: tile stays hidden
	}
}

onMount(() => {
	void loadWeightSummary()
	void loadFoodToday()
})
</script>

{#if weightSummary || foodTodayCalories !== null}
	<div class="tile-row" data-testid="progress-tiles">
		{#if weightSummary}
			<Card padding="md">
				<span class="tile-label">Weight</span>
				<span class="tile-value">{weightSummary.latestKg} <span class="tile-unit">kg</span></span>
				{#if weightSummary.changeKg !== null}
					<span class="tile-sub" class:tile-sub-good={weightSummary.changeKg < 0}>
						{weightSummary.changeKg > 0 ? "+" : ""}{weightSummary.changeKg.toFixed(1)} kg total
					</span>
				{/if}
			</Card>
		{/if}
		{#if foodTodayCalories !== null}
			<Card padding="md">
				<span class="tile-label">Eaten Today</span>
				<span class="tile-value">
					{foodTodayCalories}
					{#if userProfile.data?.dailyCalorieGoal}
						<span class="tile-unit">/ {userProfile.data.dailyCalorieGoal}</span>
					{/if}
				</span>
				{#if userProfile.data?.dailyCalorieGoal}
					<ProgressBar
						variant="linear"
						value={foodTodayCalories}
						max={userProfile.data.dailyCalorieGoal}
					/>
				{/if}
			</Card>
		{/if}
	</div>
{/if}

<style>
.tile-row {
	display: grid;
	grid-template-columns: 1fr 1fr;
	gap: var(--space-4);
}

.tile-label {
	display: block;
	font-size: var(--font-size-xs);
	color: var(--color-text-muted);
	text-transform: uppercase;
	letter-spacing: 0.04em;
	margin-bottom: var(--space-2);
}

.tile-value {
	display: block;
	font-family: var(--font-display);
	font-size: var(--font-size-xl);
	font-weight: var(--font-weight-bold);
	color: var(--color-text);
}

.tile-unit {
	font-family: var(--font-sans);
	font-size: var(--font-size-sm);
	font-weight: var(--font-weight-normal);
	color: var(--color-text-muted);
}

.tile-sub {
	display: block;
	margin-top: var(--space-2);
	font-size: var(--font-size-xs);
	color: var(--color-text-muted);
}

.tile-sub-good {
	color: var(--color-success);
}

</style>
