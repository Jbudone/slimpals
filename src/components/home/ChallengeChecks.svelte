<script lang="ts">
// The challenge inside the Today list (Today tab and the gym's drawer): the
// "did you do this today?" checks. It looks unlike the tasks on purpose: a
// framed, themed block with the challenge banner, square stamp buttons instead
// of round ticks, and its own count, so a skipped check never reads as an
// unfinished task.
import { onMount } from "svelte"
import { AUTO_GOAL_NOTE } from "../../../shared/challenges/auto.js"
import {
	challengeToday,
	goalState,
	loadChallengeToday,
	logChallengeGoal,
} from "../../lib/challengeToday.svelte.js"
import { page } from "../../router.svelte.js"
import ChallengeBanner from "../ChallengeBanner.svelte"

const c = $derived(challengeToday.data)
const live = $derived(!!c?.joined && !c.completedAt)
const loggedToday = $derived(
	c?.goals.filter((g) => goalState(c, g) !== "pending").length ?? 0,
)

onMount(() => {
	if (!challengeToday.loaded) void loadChallengeToday()
})
</script>

{#if c?.joined}
	<section class="cc" class:finished={!!c.completedAt} data-testid="challenge-checks" aria-label="Challenge checks">
		<ChallengeBanner
			theme={c.theme ?? null}
			title={c.title}
			progress={c.totalGoals ? c.goalsCompleted / c.totalGoals : 0}
		/>
		<div class="hd">
			<span class="chip">Challenge</span>
			<b>{live ? "Did you do this today?" : "Challenge complete"}</b>
			{#if live}<small>{loggedToday}/{c.goals.length} today</small>{/if}
			<button type="button" class="all" onclick={() => page("/challenges")}>All</button>
		</div>
		<ul>
			{#each c.goals as g (g.id)}
				{@const st = goalState(c, g)}
				<li class="cg {st}" data-testid="challenge-check-{g.id}">
					<span class="ttx">
						<span class="ttl">{g.title}</span>
						<span class="sub">
							{#if st === "reached"}Goal reached
							{:else if st === "done-today"}Logged today
							{:else if st === "auto"}Counted for you
							{:else}{g.dailyPrompt}{/if}
						</span>
					</span>
					{#if st === "pending"}
						<button
							type="button"
							class="stamp"
							disabled={challengeToday.saving !== null}
							onclick={() => logChallengeGoal(g)}
							aria-label="Log {g.title}"
						>+{g.dailyAmount}<small>{g.unit}</small></button>
					{:else}
						<span class="stamp done" aria-hidden="true">✓</span>
					{/if}
				</li>
			{/each}
		</ul>
		{#if c.goals.some((g) => g.auto)}
			<p class="note">{AUTO_GOAL_NOTE}</p>
		{/if}
	</section>
{/if}

<style>
.cc {
	--cc: var(--event-accent, var(--color-accent));
	margin: 0.9rem 0;
	padding: 0.6rem;
	border: 2px dashed var(--cc);
	border-radius: 16px;
	background: color-mix(in srgb, var(--cc) 7%, var(--color-surface, transparent));
}
.cc.finished {
	border-style: solid;
}
.hd {
	display: flex;
	align-items: center;
	gap: 0.5rem;
	margin: 0.55rem 0 0.3rem;
}
.hd b {
	flex: 1;
	min-width: 0;
	font-family: var(--font-display);
	font-size: var(--font-size-md);
}
.hd small {
	color: var(--color-text-muted);
	font-weight: var(--font-weight-semibold);
}
.chip {
	padding: 0.1rem 0.5rem;
	border-radius: 6px;
	background: var(--cc);
	color: var(--color-on-accent, #fff);
	font-size: 0.68rem;
	font-weight: 800;
	letter-spacing: 0.08em;
	text-transform: uppercase;
}
.all {
	border: 0;
	background: none;
	color: var(--cc);
	font: inherit;
	font-size: var(--font-size-sm);
	font-weight: var(--font-weight-semibold);
	cursor: pointer;
}
ul {
	list-style: none;
	margin: 0;
	padding: 0;
}
.cg {
	display: flex;
	align-items: center;
	gap: 0.7rem;
	padding: 0.45rem 0;
	border-top: 1px solid color-mix(in srgb, var(--cc) 22%, transparent);
}
.cg:first-child {
	border-top: 0;
}
.ttx {
	flex: 1;
	min-width: 0;
	display: flex;
	flex-direction: column;
}
.ttl {
	font-weight: var(--font-weight-semibold);
	color: var(--color-text);
}
.cg.reached .ttl,
.cg.done-today .ttl {
	color: var(--color-text-muted);
}
.sub,
.note {
	font-size: var(--font-size-sm);
	color: var(--color-text-muted);
}
.note {
	margin: 0.3rem 0 0;
}
.stamp {
	min-width: 3.2rem;
	padding: 0.3rem 0.5rem;
	border: 2px solid var(--cc);
	border-radius: 8px;
	background: transparent;
	color: var(--cc);
	font: inherit;
	font-weight: 800;
	line-height: 1.1;
	text-align: center;
	cursor: pointer;
}
.stamp small {
	display: block;
	font-size: 0.62rem;
	font-weight: 600;
	opacity: 0.8;
}
.stamp:disabled {
	opacity: 0.55;
}
.stamp.done {
	background: var(--cc);
	color: var(--color-on-accent, #fff);
	cursor: default;
}
</style>
