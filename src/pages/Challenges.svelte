<script lang="ts">
import { onMount } from "svelte"
import Button from "../components/ui/Button.svelte"
import Card from "../components/ui/Card.svelte"
import ProgressBar from "../components/ui/ProgressBar.svelte"
import { api } from "../lib/api.js"
import { showBadgeToast } from "../lib/toast.svelte.js"

type Goal = {
	id: string
	title: string
	description: string
	target: number
	unit: string
	dailyAmount: number
	dailyPrompt: string
}
type SprintTask = { id: string; title: string }

type SprintData = {
	id: number
	title: string
	weekStart: string
	tasks: SprintTask[]
	completedTasks: string[]
	completedAt: string | null
	progress: number
}

type NewBadge = { key: string; name: string; tier: string; earnedAt: string }

type ChallengeData = {
	id: number
	title: string
	description: string | null
	theme: string | null
	month: number
	year: number
	goals: Goal[]
	joined: boolean
	progress: Record<string, number>
	dailyLog: Record<string, string[]>
	completedAt: string | null
	goalsCompleted: number
	totalGoals: number
	overallProgress: number
}

type NextChallenge = {
	id: number
	title: string
	month: number
	year: number
	opensAt: string
	participantCount: number
} | null

let challenge = $state<ChallengeData | null>(null)
let nextChallenge = $state<NextChallenge>(null)
let loading = $state(true)
let joining = $state(false)
let savingGoal = $state<string | null>(null)
let justCompleted = $state(false)
let gymXpAwarded = $state(0)

let sprint = $state<SprintData | null>(null)
let sprintSaving = $state<string | null>(null)

async function loadChallenge() {
	try {
		const [c, s, n] = await Promise.all([
			api.get<ChallengeData | null>("/challenges/current"),
			api.get<SprintData | null>("/sprints/current"),
			api.get<NextChallenge>("/challenges/next").catch(() => null),
		])
		challenge = c
		sprint = s
		nextChallenge = n
	} finally {
		loading = false
	}
}

function daysInMonth(month: number, year: number): number {
	return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

function isoDate(year: number, month: number, day: number): string {
	return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
}

function goalGrid(goal: Goal) {
	const total = challenge ? daysInMonth(challenge.month, challenge.year) : 0
	const elapsed = Math.min(total, new Date().getUTCDate())
	const logged = new Set(challenge?.dailyLog[goal.id] ?? [])
	const cells = Array.from({ length: total }, (_, i) => {
		const day = i + 1
		const iso = challenge ? isoDate(challenge.year, challenge.month, day) : ""
		return { day, logged: logged.has(iso), future: day > elapsed }
	})
	return {
		cells,
		total,
		elapsed,
		loggedCount: logged.size,
		toGo: Math.max(0, elapsed - logged.size),
	}
}

async function toggleSprintTask(taskId: string) {
	if (!sprint || sprintSaving || sprint.completedAt) return
	sprintSaving = taskId

	const current = new Set(sprint.completedTasks)
	if (current.has(taskId)) current.delete(taskId)
	else current.add(taskId)

	try {
		const res = await api.patch<{
			completedTasks: string[]
			progress: number
			completed: boolean
			gymXpAwarded: number
		}>(`/sprints/${sprint.id}/tasks`, { completedTasks: [...current] })

		sprint = {
			...sprint,
			completedTasks: res.completedTasks,
			progress: res.progress,
			completedAt: res.completed ? new Date().toISOString() : null,
		}
	} finally {
		sprintSaving = null
	}
}

async function joinChallenge() {
	if (!challenge || joining) return
	joining = true
	try {
		await api.post(`/challenges/${challenge.id}/join`)
		challenge = {
			...challenge,
			joined: true,
			progress: {},
			dailyLog: {},
			goalsCompleted: 0,
			overallProgress: 0,
		}
	} finally {
		joining = false
	}
}

async function tapGoal(goal: Goal) {
	if (!challenge || savingGoal || challenge.completedAt) return
	savingGoal = goal.id
	try {
		const res = await api.patch<{
			progress: Record<string, number>
			dailyLog: Record<string, string[]>
			goalsCompleted: number
			totalGoals: number
			overallProgress: number
			completed: boolean
			newBadges: NewBadge[]
			gymXpAwarded: number
		}>(`/challenges/${challenge.id}/progress`, {
			dailyProgress: { [goal.id]: goal.dailyAmount },
		})

		challenge = {
			...challenge,
			progress: res.progress,
			dailyLog: res.dailyLog,
			goalsCompleted: res.goalsCompleted,
			totalGoals: res.totalGoals,
			overallProgress: res.overallProgress,
			completedAt: res.completed ? new Date().toISOString() : null,
		}

		if (res.completed) {
			justCompleted = true
			gymXpAwarded = res.gymXpAwarded
			for (const b of res.newBadges) showBadgeToast(b)
		}
	} finally {
		savingGoal = null
	}
}

function goalProgress(goal: Goal): number {
	return Math.min(challenge?.progress[goal.id] ?? 0, goal.target)
}

function goalDone(goal: Goal): boolean {
	return goalProgress(goal) >= goal.target
}

const monthNames = [
	"January",
	"February",
	"March",
	"April",
	"May",
	"June",
	"July",
	"August",
	"September",
	"October",
	"November",
	"December",
]

onMount(loadChallenge)
</script>

<div class="challenges-tab">
	{#if loading}
		<p class="muted">Loading…</p>
	{:else if !challenge}
		<Card padding="md">
			<p class="muted">No challenge available for this month yet. Check back soon!</p>
		</Card>
	{:else if !challenge.joined}
		<Card>
			<p class="challenge-caption">{monthNames[challenge.month - 1]} {challenge.year}</p>
			<h2 class="goal-heading">{challenge.title}</h2>
			{#if challenge.description}
				<p class="challenge-desc">{challenge.description}</p>
			{/if}
			<p class="join-text">Join this month's challenge to start tracking your progress.</p>
			<Button onclick={joinChallenge} disabled={joining}>
				{joining ? "Joining…" : "Join Challenge"}
			</Button>
		</Card>
	{:else}
		{#if challenge.completedAt || justCompleted}
			<Card>
				<div class="celebration">
					<div class="celebration-icon">🏆</div>
					<h3>Challenge Complete!</h3>
					<p>You hit every goal this month. +{gymXpAwarded || 200} Gym XP earned!</p>
				</div>
			</Card>
		{/if}

		{#each challenge.goals as goal (goal.id)}
			{@const done = goalDone(goal)}
			{@const grid = goalGrid(goal)}
			<Card>
				<p class="challenge-caption">
					{monthNames[challenge.month - 1].toUpperCase()} · {Math.max(0, grid.total - grid.elapsed)} days left
				</p>
				<h2 class="goal-heading">{goal.title} — {grid.elapsed} days out of {grid.total}</h2>

				<div class="goal-stat-row">
					<span class="goal-stat-num">{grid.loggedCount}</span>
					<span class="goal-stat-sub">/ {grid.elapsed} days · {grid.toGo} to go</span>
				</div>
				<ProgressBar variant="linear" value={grid.loggedCount} max={Math.max(1, grid.elapsed)} />

				<div class="day-grid">
					{#each grid.cells as cell (cell.day)}
						<span class="day-cell" class:logged={cell.logged} class:future={cell.future}></span>
					{/each}
				</div>

				<p class="unlock-note">Finish it to unlock a badge and earn Gym XP!</p>

				{#if done}
					<span class="done-badge">Done!</span>
				{:else if !challenge.completedAt}
					<Button onclick={() => tapGoal(goal)} disabled={savingGoal === goal.id}>
						{savingGoal === goal.id ? "Saving…" : goal.dailyPrompt}
					</Button>
				{/if}
			</Card>
		{/each}
	{/if}

	{#if nextChallenge}
		<Card padding="md">
			<p class="challenge-caption">Next Month</p>
			<h2 class="goal-heading">
				{monthNames[nextChallenge.month - 1]}: {nextChallenge.title}
			</h2>
			<p class="next-sub">
				Opens {new Date(nextChallenge.opensAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
				· {nextChallenge.participantCount} pal{nextChallenge.participantCount === 1 ? "" : "s"} joined already
			</p>
		</Card>
	{/if}

	<!-- Weekly Sprint -->
	{#if !loading && sprint}
		<section class="sprint-card">
			<div class="sprint-header">
				<span class="sprint-badge">This Week</span>
				<h2>{sprint.title}</h2>
			</div>

			<div class="sprint-progress-row">
				<div class="sprint-bar">
					<div
						class="sprint-fill"
						class:complete={sprint.progress === 100}
						style="width: {sprint.progress}%"
					></div>
				</div>
				<span class="sprint-pct">{sprint.progress}%</span>
			</div>

			{#if sprint.completedAt}
				<p class="sprint-done-msg">Sprint complete — nice work this week! +50 Gym XP</p>
			{/if}

			<ul class="sprint-tasks">
				{#each sprint.tasks as task (task.id)}
					{@const checked = sprint.completedTasks.includes(task.id)}
					<li class="sprint-task" class:checked>
						<button
							type="button"
							class="sprint-task-btn"
							disabled={sprintSaving === task.id || !!sprint.completedAt}
							onclick={() => toggleSprintTask(task.id)}
						>
							<span class="sprint-check" class:checked>
								{#if checked}✓{/if}
							</span>
							<span class="sprint-task-title">{task.title}</span>
						</button>
					</li>
				{/each}
			</ul>
		</section>
	{/if}
</div>

<style>
.challenges-tab { display: flex; flex-direction: column; gap: var(--space-4); }
.muted { color: var(--color-text-muted); font-size: var(--font-size-sm); }

.challenge-caption {
	font-size: var(--font-size-xs); color: var(--color-text-muted);
	text-transform: uppercase; letter-spacing: 0.04em; margin: 0;
}

.goal-heading {
	font-family: var(--font-display); font-size: var(--font-size-lg);
	font-weight: var(--font-weight-bold); color: var(--color-text);
	margin: var(--space-1) 0 var(--space-3);
}

.challenge-desc { font-size: var(--font-size-sm); color: var(--color-text); margin: 0 0 var(--space-3); opacity: 0.85; }

/* Join */
.join-text { font-size: var(--font-size-sm); color: var(--color-text-muted); margin: 0 0 var(--space-3); }

/* Celebration */
.celebration {
	text-align: center; padding: var(--space-2) 0;
}
.celebration-icon { font-size: 2.5rem; margin-bottom: var(--space-2); animation: bounce 0.6s ease; }
@keyframes bounce {
	0%, 100% { transform: translateY(0); }
	40% { transform: translateY(-12px); }
	60% { transform: translateY(-4px); }
}
.celebration h3 { font-size: var(--font-size-lg); font-weight: var(--font-weight-bold); color: var(--color-success); margin: 0 0 var(--space-1); }
.celebration p { font-size: var(--font-size-sm); color: var(--color-text-muted); margin: 0; }

/* Goal day-grid */
.goal-stat-row { display: flex; align-items: baseline; gap: var(--space-2); margin-bottom: var(--space-2); }
.goal-stat-num { font-family: var(--font-display); font-size: var(--font-size-2xl); font-weight: var(--font-weight-bold); color: var(--color-text); }
.goal-stat-sub { font-size: var(--font-size-sm); color: var(--color-text-muted); }

.day-grid {
	display: grid; grid-template-columns: repeat(10, 1fr); gap: var(--space-2);
	margin: var(--space-4) 0;
}

.day-cell {
	aspect-ratio: 1; border-radius: var(--radius-sm); background: var(--color-surface-2);
	border: 1px solid var(--color-border);
}

.day-cell.logged { background: var(--color-accent); border-color: var(--color-accent); }
.day-cell.future { opacity: 0.4; }

.unlock-note { font-size: var(--font-size-sm); color: var(--color-text-muted); margin: 0 0 var(--space-3); }

.done-badge {
	display: inline-block; font-size: var(--font-size-xs); font-weight: var(--font-weight-bold);
	text-transform: uppercase; letter-spacing: 0.04em;
	padding: 0.2rem 0.6rem; border-radius: var(--radius-full);
	background: color-mix(in srgb, var(--color-success) 15%, transparent);
	color: var(--color-success); border: 1px solid var(--color-success);
}

.next-sub { font-size: var(--font-size-sm); color: var(--color-text-muted); margin: var(--space-1) 0 0; }

/* Sprint section */
.sprint-card {
	background: var(--color-surface); border: 1px solid var(--color-border);
	border-radius: 0.75rem; padding: 1.5rem; margin-top: 1.5rem;
}
.sprint-header { margin-bottom: 1rem; }
.sprint-badge {
	display: inline-block; font-size: 0.6875rem; font-weight: 700; text-transform: uppercase;
	letter-spacing: 0.06em; padding: 0.125rem 0.5rem; border-radius: 99px;
	background: color-mix(in srgb, var(--color-success, #22c55e) 20%, transparent);
	color: var(--color-success, #22c55e); border: 1px solid var(--color-success, #22c55e);
	margin-bottom: 0.375rem;
}
.sprint-header h2 { font-size: 1.125rem; font-weight: 700; color: var(--color-text); margin: 0.375rem 0 0; }

.sprint-progress-row { display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.75rem; }
.sprint-bar { flex: 1; height: 6px; background: var(--color-surface-2, #333); border-radius: 3px; overflow: hidden; }
.sprint-fill { height: 100%; background: var(--color-success, #22c55e); border-radius: 3px; transition: width 0.3s; }
.sprint-fill.complete { background: var(--color-success, #22c55e); }
.sprint-pct { font-size: 0.8125rem; font-weight: 700; color: var(--color-success, #22c55e); }
.sprint-done-msg {
	font-size: 0.8125rem; color: var(--color-success, #22c55e); font-weight: 600;
	margin: 0 0 0.75rem; text-align: center;
}

.sprint-tasks { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 0.375rem; }
.sprint-task { border-radius: 0.375rem; }
.sprint-task.checked { opacity: 0.5; }

.sprint-task-btn {
	width: 100%; display: flex; align-items: center; gap: 0.625rem;
	padding: 0.625rem 0.75rem; background: var(--color-surface-2, #333);
	border: 1px solid var(--color-border); border-radius: 0.375rem;
	cursor: pointer; color: inherit; text-align: left;
	transition: border-color 0.15s;
}
.sprint-task-btn:hover:not(:disabled) { border-color: var(--color-success, #22c55e); }
.sprint-task-btn:disabled { cursor: not-allowed; }

.sprint-check {
	flex-shrink: 0; width: 20px; height: 20px; border: 2px solid var(--color-border);
	border-radius: 4px; display: flex; align-items: center; justify-content: center;
	font-size: 0.7rem; font-weight: 700; transition: background 0.15s, border-color 0.15s;
}
.sprint-check.checked { background: var(--color-success, #22c55e); border-color: var(--color-success, #22c55e); color: var(--color-on-success, #fff); }
.sprint-task-title { font-size: 0.875rem; color: var(--color-text); }
</style>
