<script lang="ts">
import { onMount } from "svelte"
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
	completedAt: string | null
	goalsCompleted: number
	totalGoals: number
	overallProgress: number
}

let challenge = $state<ChallengeData | null>(null)
let loading = $state(true)
let joining = $state(false)
let savingGoal = $state<string | null>(null)
let justCompleted = $state(false)
let gymXpAwarded = $state(0)

let sprint = $state<SprintData | null>(null)
let sprintSaving = $state<string | null>(null)

async function loadChallenge() {
	try {
		const [c, s] = await Promise.all([
			api.get<ChallengeData | null>("/challenges/current"),
			api.get<SprintData | null>("/sprints/current"),
		])
		challenge = c
		sprint = s
	} finally {
		loading = false
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

function goalPct(goal: Goal): number {
	return Math.min(100, Math.round((goalProgress(goal) / goal.target) * 100))
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

<div class="challenges-page">
	<h1>Monthly Challenge</h1>

	{#if loading}
		<p class="muted">Loading…</p>
	{:else if !challenge}
		<div class="empty-state">
			<p>No challenge available for this month yet.</p>
			<p class="muted">Check back soon!</p>
		</div>
	{:else}
		<section class="challenge-card">
			<div class="challenge-header">
				{#if challenge.theme}
					<span class="theme-badge">{challenge.theme}</span>
				{/if}
				<h2>{challenge.title}</h2>
				<p class="challenge-meta">{monthNames[challenge.month - 1]} {challenge.year}</p>
				{#if challenge.description}
					<p class="challenge-desc">{challenge.description}</p>
				{/if}
			</div>

			{#if !challenge.joined}
				<div class="join-section">
					<p class="join-text">Join this month's challenge to start tracking your progress.</p>
					<button type="button" class="btn-join" disabled={joining} onclick={joinChallenge}>
						{joining ? "Joining…" : "Join Challenge"}
					</button>
				</div>
			{:else}
				<!-- Overall progress -->
				<div class="overall-progress">
					<div class="progress-header">
						<span class="progress-label">Overall</span>
						<span class="progress-pct">{challenge.overallProgress}%</span>
					</div>
					<div class="progress-bar">
						<div
							class="progress-fill"
							class:complete={challenge.overallProgress === 100}
							style="width: {challenge.overallProgress}%"
						></div>
					</div>
				</div>

				<!-- Completion celebration -->
				{#if challenge.completedAt || justCompleted}
					<div class="celebration">
						<div class="celebration-icon">🏆</div>
						<h3>Challenge Complete!</h3>
						<p>You hit every goal this month. +{gymXpAwarded || 200} Gym XP earned!</p>
					</div>
				{/if}

				<!-- Goal cards with built-in daily tap -->
				<div class="goal-cards">
					{#each challenge.goals as goal (goal.id)}
						{@const done = goalDone(goal)}
						{@const pct = goalPct(goal)}
						{@const current = goalProgress(goal)}
						<div class="goal-card" class:done>
							<div class="goal-top">
								<div class="goal-info">
									<span class="goal-title">{goal.title}</span>
									<span class="goal-desc">{goal.description}</span>
								</div>
								{#if done}
									<span class="goal-done-badge">Done!</span>
								{/if}
							</div>

							<div class="goal-progress-row">
								<div class="goal-bar">
									<div class="goal-fill" class:done style="width: {pct}%"></div>
								</div>
								<span class="goal-count">{current} / {goal.target} {goal.unit}</span>
							</div>

							{#if !done && !challenge.completedAt}
								<button
									type="button"
									class="tap-btn"
									disabled={savingGoal === goal.id}
									onclick={() => tapGoal(goal)}
								>
									{#if savingGoal === goal.id}
										<span class="tap-spinner"></span>
									{:else}
										<span class="tap-check">✓</span>
									{/if}
									<span class="tap-label">{goal.dailyPrompt}</span>
									<span class="tap-amount">+{goal.dailyAmount} {goal.unit}</span>
								</button>
							{/if}
						</div>
					{/each}
				</div>
			{/if}
		</section>
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
.challenges-page { max-width: 680px; margin: 0 auto; padding: 2rem 1.5rem; }
h1 { font-size: 1.5rem; font-weight: 700; color: var(--color-text); margin: 0 0 1.5rem; }
.muted { color: var(--color-text-muted); font-size: 0.875rem; }

.empty-state {
	text-align: center; padding: 3rem 1.5rem;
	background: var(--color-surface); border: 1px dashed var(--color-border); border-radius: 0.75rem;
}
.empty-state p { margin: 0 0 0.5rem; color: var(--color-text); }

.challenge-card {
	background: var(--color-surface); border: 1px solid var(--color-border);
	border-radius: 0.75rem; padding: 1.5rem;
}

.challenge-header { margin-bottom: 1.25rem; }
.theme-badge {
	display: inline-block; font-size: 0.6875rem; font-weight: 700; text-transform: uppercase;
	letter-spacing: 0.06em; padding: 0.125rem 0.5rem; border-radius: 99px;
	background: color-mix(in srgb, var(--color-accent) 20%, transparent);
	color: var(--color-accent); border: 1px solid var(--color-accent); margin-bottom: 0.5rem;
}
.challenge-header h2 { font-size: 1.25rem; font-weight: 700; color: var(--color-text); margin: 0.375rem 0 0.25rem; }
.challenge-meta { font-size: 0.8125rem; color: var(--color-text-muted); margin: 0 0 0.5rem; }
.challenge-desc { font-size: 0.9375rem; color: var(--color-text); margin: 0; opacity: 0.85; }

/* Join */
.join-section { text-align: center; padding: 1.5rem 0; }
.join-text { font-size: 0.9375rem; color: var(--color-text-muted); margin: 0 0 1rem; }
.btn-join {
	padding: 0.75rem 2rem; background: var(--color-accent); color: #fff;
	border: none; border-radius: 0.5rem; font-size: 1rem; font-weight: 600; cursor: pointer;
}
.btn-join:disabled { opacity: 0.6; cursor: not-allowed; }

/* Overall progress */
.overall-progress { margin-bottom: 1.5rem; }
.progress-header { display: flex; justify-content: space-between; margin-bottom: 0.375rem; }
.progress-label { font-size: 0.875rem; font-weight: 600; color: var(--color-text); }
.progress-pct { font-size: 0.875rem; font-weight: 700; color: var(--color-accent); }
.progress-bar { height: 10px; background: var(--color-surface-2, #333); border-radius: 5px; overflow: hidden; }
.progress-fill { height: 100%; background: var(--color-accent); border-radius: 5px; transition: width 0.3s ease; }
.progress-fill.complete { background: var(--color-success, #22c55e); }

/* Celebration */
.celebration {
	text-align: center; padding: 1.5rem; margin-bottom: 1.5rem;
	background: color-mix(in srgb, var(--color-success, #22c55e) 10%, transparent);
	border: 1px solid var(--color-success, #22c55e); border-radius: 0.5rem;
}
.celebration-icon { font-size: 2.5rem; margin-bottom: 0.5rem; animation: bounce 0.6s ease; }
@keyframes bounce {
	0%, 100% { transform: translateY(0); }
	40% { transform: translateY(-12px); }
	60% { transform: translateY(-4px); }
}
.celebration h3 { font-size: 1.125rem; font-weight: 700; color: var(--color-success, #22c55e); margin: 0 0 0.25rem; }
.celebration p { font-size: 0.875rem; color: var(--color-text-muted); margin: 0; }

/* Goal cards */
.goal-cards { display: flex; flex-direction: column; gap: 1rem; }

.goal-card {
	padding: 1rem 1.25rem; background: var(--color-surface-2, #333);
	border: 1px solid var(--color-border); border-radius: 0.75rem;
	transition: opacity 0.2s;
}
.goal-card.done { opacity: 0.55; }

.goal-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 0.75rem; margin-bottom: 0.75rem; }
.goal-info { display: flex; flex-direction: column; gap: 0.125rem; }
.goal-title { font-size: 1rem; font-weight: 700; color: var(--color-text); }
.goal-desc { font-size: 0.8125rem; color: var(--color-text-muted); }
.goal-done-badge {
	font-size: 0.6875rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em;
	padding: 0.2rem 0.6rem; border-radius: 99px; white-space: nowrap; flex-shrink: 0;
	background: color-mix(in srgb, var(--color-success, #22c55e) 15%, transparent);
	color: var(--color-success, #22c55e); border: 1px solid var(--color-success, #22c55e);
}

.goal-progress-row { display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.75rem; }
.goal-bar { flex: 1; height: 6px; background: var(--color-border); border-radius: 3px; overflow: hidden; }
.goal-fill { height: 100%; background: var(--color-accent); border-radius: 3px; transition: width 0.3s; }
.goal-fill.done { background: var(--color-success, #22c55e); }
.goal-count { font-size: 0.75rem; color: var(--color-text-muted); white-space: nowrap; min-width: 90px; text-align: right; }

/* Tap button */
.tap-btn {
	width: 100%; display: flex; align-items: center; gap: 0.75rem;
	padding: 0.875rem 1rem; background: var(--color-surface);
	border: 2px solid var(--color-accent); border-radius: 0.625rem;
	cursor: pointer; transition: background 0.15s, transform 0.1s;
	color: inherit;
}
.tap-btn:hover:not(:disabled) { background: color-mix(in srgb, var(--color-accent) 10%, var(--color-surface)); }
.tap-btn:active:not(:disabled) { transform: scale(0.98); }
.tap-btn:disabled { opacity: 0.6; cursor: not-allowed; }

.tap-check {
	width: 32px; height: 32px; border-radius: 50%;
	background: var(--color-accent); color: #fff;
	font-size: 1rem; font-weight: 700;
	display: flex; align-items: center; justify-content: center; flex-shrink: 0;
}

.tap-spinner {
	width: 32px; height: 32px; border-radius: 50%;
	border: 3px solid var(--color-border); border-top-color: var(--color-accent);
	animation: spin 0.6s linear infinite; flex-shrink: 0;
}
@keyframes spin { to { transform: rotate(360deg); } }

.tap-label { font-size: 0.9375rem; font-weight: 600; color: var(--color-text); flex: 1; }
.tap-amount {
	font-size: 0.8125rem; font-weight: 700; color: var(--color-accent);
	white-space: nowrap; flex-shrink: 0;
}

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
	font-size: 0.7rem; font-weight: 700; color: #fff; transition: background 0.15s, border-color 0.15s;
}
.sprint-check.checked { background: var(--color-success, #22c55e); border-color: var(--color-success, #22c55e); }
.sprint-task-title { font-size: 0.875rem; color: var(--color-text); }
</style>
