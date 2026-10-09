<script lang="ts">
// Below Today's tasks: the tournaments you are in, each a tap away from its
// page, and a nudge to join this month's challenge when you have not. The
// challenge's daily checks themselves live inside the task list
// (home/ChallengeChecks.svelte), clearly apart from the tasks.

import { Trophy } from "@lucide/svelte"
import { onMount } from "svelte"
import { api } from "../lib/api.js"
import { authState } from "../lib/auth.svelte.js"
import {
	challengeToday,
	loadChallengeToday,
} from "../lib/challengeToday.svelte.js"
import { TOURNAMENT_TYPE_UNITS } from "../lib/tournamentLabels.js"
import { page } from "../router.svelte.js"
import Avatar from "./ui/Avatar.svelte"
import Card from "./ui/Card.svelte"

type Standing = {
	id: number
	name: string
	rank: number
	of: number
	gap: string | null
	daysLeft: number
}

type TournamentItem = {
	id: number
	name: string
	type: string
	endDate: string
	resolvedAt: string | null
}

type Board = {
	leaderboard: { userId: string; userName: string; score: number }[]
}

/** Tournaments checked for a place of yours (a card, not a browser). */
const MAX_CHECK = 5
const MAX_SHOWN = 2

let standings = $state<Standing[]>([])
let loaded = $state(false)

const challenge = $derived(challengeToday.data)

const score = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1))
const ordinal = (n: number) =>
	n === 1 ? "1st" : n === 2 ? "2nd" : n === 3 ? "3rd" : `${n}th`

async function loadStandings() {
	try {
		const myId = authState.user?.id
		if (!myId) return
		const all = await api.get<TournamentItem[]>("/tournaments")
		const active = all
			.filter((t) => t.resolvedAt === null)
			.sort((a, b) => Date.parse(a.endDate) - Date.parse(b.endDate))
			.slice(0, MAX_CHECK)
		const out: Standing[] = []
		for (const t of active) {
			if (out.length >= MAX_SHOWN) break
			const res = await api.get<Board>(`/tournaments/${t.id}/leaderboard`)
			const i = res.leaderboard.findIndex((e) => e.userId === myId)
			if (i === -1) continue
			const unit = TOURNAMENT_TYPE_UNITS[t.type] ?? ""
			out.push({
				id: t.id,
				name: t.name,
				rank: i + 1,
				of: res.leaderboard.length,
				gap:
					i === 0
						? null
						: `${score(res.leaderboard[i - 1].score - res.leaderboard[i].score)} ${unit} behind ${res.leaderboard[i - 1].userName}`,
				daysLeft: Math.max(
					0,
					Math.ceil((Date.parse(t.endDate) - Date.now()) / 86_400_000),
				),
			})
		}
		standings = out
	} catch {
		// no tournament rows
	}
}

onMount(async () => {
	await Promise.all([
		challengeToday.loaded ? Promise.resolve() : loadChallengeToday(),
		loadStandings(),
	])
	loaded = true
})
</script>

{#if loaded && ((challenge && !challenge.joined) || standings.length)}
	<Card>
		<div class="head">
			<h2>In the running</h2>
			<button type="button" class="more" onclick={() => page("/challenges")}>All</button>
		</div>

		{#if challenge && !challenge.joined}
			<button
				type="button"
				class="row"
				onclick={() => page("/challenges")}
				data-testid="compete-join"
			>
				<Avatar tone="accent">
					{#snippet icon()}
						<Trophy size={18} />
					{/snippet}
				</Avatar>
				<span class="copy">
					<span class="title">{challenge.title}</span>
					<span class="sub">This month's challenge. Join in</span>
				</span>
			</button>
		{/if}

		{#each standings as t (t.id)}
			<button
				type="button"
				class="row"
				onclick={() => page("/tournaments")}
				data-testid="compete-tournament"
			>
				<Avatar tone="accent" initials={String(t.rank)} />
				<span class="copy">
					<span class="title">{t.name} · {ordinal(t.rank)} of {t.of}</span>
					<span class="sub">
						{t.gap ?? "In the lead"} · {t.daysLeft} day{t.daysLeft === 1 ? "" : "s"} left
					</span>
				</span>
			</button>
		{/each}
	</Card>
{/if}

<style>
.head {
	display: flex;
	align-items: center;
	justify-content: space-between;
	margin-bottom: 0.5rem;
}

h2 {
	margin: 0;
	font-family: var(--font-display);
	font-size: var(--font-size-md);
	color: var(--color-text);
}

.more {
	border: none;
	background: none;
	color: var(--color-accent);
	font: inherit;
	font-size: var(--font-size-sm);
	font-weight: var(--font-weight-semibold);
	cursor: pointer;
}

.row,
.log {
	display: flex;
	align-items: center;
	gap: 0.75rem;
	width: 100%;
	padding: 0.5rem 0;
	border: none;
	background: none;
	text-align: left;
	font: inherit;
	color: inherit;
}

.row {
	cursor: pointer;
}

.copy {
	flex: 1;
	min-width: 0;
	display: flex;
	flex-direction: column;
	gap: 0.25rem;
}

.title {
	font-weight: var(--font-weight-semibold);
	color: var(--color-text);
}

.sub,
.note {
	font-size: var(--font-size-sm);
	color: var(--color-text-muted);
}

.note {
	margin: 0.25rem 0 0;
}

.log {
	padding-left: 3rem;
}
</style>
