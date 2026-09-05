<script lang="ts">
import { onMount } from "svelte"
import { api } from "../lib/api.js"
import { fetchSession } from "../lib/auth.svelte.js"
import { fetchUserProfile } from "../lib/user.svelte.js"

type AdminUser = {
	id: string
	name: string
	email: string
	isAdmin: boolean
	createdAt: string
}

type Badge = {
	id: number
	key: string
	name: string
	tier: string
}

type ChallengeGoal = {
	id: string
	title: string
	description: string
	target: number
	unit: string
}

type UserChallengeState = {
	challenge: {
		id: number
		title: string
		description: string | null
		theme: string | null
		month: number
		year: number
		goals: ChallengeGoal[]
	} | null
	joined: boolean
	completedTasks: Record<string, number> | null
	completedAt: string | null
	goalsCompleted: number
	totalGoals: number
}

let users = $state<AdminUser[]>([])
let allBadges = $state<Badge[]>([])
let loading = $state(true)
let loadError = $state<string | null>(null)

let newName = $state("")
let newEmail = $state("")
let newPassword = $state("TestPass1!")
let creating = $state(false)
let createResult = $state<{ text: string; ok: boolean } | null>(null)

let expandedId = $state<string | null>(null)
let seedTab = $state<
	"checkins" | "weight" | "badges" | "food" | "gym" | "challenges"
>("checkins")
let seedStatus = $state<{ text: string; ok: boolean } | null>(null)

let challengeState = $state<UserChallengeState | null>(null)
let challengeLoading = $state(false)
let challengeError = $state<string | null>(null)

const now = new Date()
let seedChallengeMonth = $state(now.getUTCMonth() + 1)
let seedChallengeYear = $state(now.getUTCFullYear())
let seedChallengeCompletion = $state<
	"none" | "partial" | "near_complete" | "complete"
>("complete")

let checkinDays = $state(7)
let weightCount = $state(5)
let weightStartKg = $state(90)
let weightEndKg = $state(85)
let selectedKeys = $state<Set<string>>(new Set())
let foodCount = $state(3)

const badgesByTier = $derived(
	["platinum", "gold", "silver", "bronze"].flatMap((tier) =>
		allBadges.filter((b) => b.tier === tier),
	),
)

async function load() {
	loading = true
	try {
		;[users, allBadges] = await Promise.all([
			api.get<AdminUser[]>("/admin/users"),
			api.get<Badge[]>("/badges"),
		])
	} catch (e) {
		loadError = e instanceof Error ? e.message : "Failed to load"
	} finally {
		loading = false
	}
}

async function createUser() {
	creating = true
	createResult = null
	try {
		const r = await api.post<{ email: string; password: string }>(
			"/admin/users",
			{
				name: newName || undefined,
				email: newEmail || undefined,
				password: newPassword || undefined,
			},
		)
		createResult = { text: `Created: ${r.email} / ${r.password}`, ok: true }
		newName = ""
		newEmail = ""
		await load()
	} catch (e) {
		createResult = {
			text: `Error: ${e instanceof Error ? e.message : "Failed"}`,
			ok: false,
		}
	} finally {
		creating = false
	}
}

async function impersonate(userId: string) {
	try {
		await api.post(`/admin/impersonate/${userId}`)
		await fetchSession()
		await fetchUserProfile()
		window.location.href = "/"
	} catch (e) {
		alert(
			`Impersonation failed: ${e instanceof Error ? e.message : "Unknown error"}`,
		)
	}
}

async function deleteUser(userId: string, name: string) {
	if (!confirm(`Delete "${name}"? This cannot be undone.`)) return
	try {
		await api.del(`/admin/users/${userId}`)
		await load()
	} catch (e) {
		alert(`Delete failed: ${e instanceof Error ? e.message : "Unknown error"}`)
	}
}

function toggleExpand(userId: string) {
	if (expandedId === userId) {
		expandedId = null
	} else {
		expandedId = userId
		seedTab = "checkins"
		seedStatus = null
		selectedKeys = new Set()
		challengeState = null
		challengeError = null
	}
}

async function loadChallengeState(userId: string) {
	challengeLoading = true
	challengeError = null
	try {
		challengeState = await api.get<UserChallengeState>(
			`/admin/users/${userId}/challenge`,
		)
	} catch (e) {
		challengeError = e instanceof Error ? e.message : "Failed to load"
	} finally {
		challengeLoading = false
	}
}

async function selectTab(
	userId: string,
	tab: "checkins" | "weight" | "badges" | "food" | "gym" | "challenges",
) {
	seedTab = tab
	seedStatus = null
	if (tab === "challenges") {
		await loadChallengeState(userId)
	}
}

async function seedChallenge(userId: string) {
	seedStatus = null
	try {
		await api.post(`/admin/seed/${userId}/challenge`, {
			month: seedChallengeMonth,
			year: seedChallengeYear,
			completion: seedChallengeCompletion,
		})
		seedStatus = {
			text: `Seeded ${seedChallengeMonth}/${seedChallengeYear} at "${seedChallengeCompletion}"`,
			ok: true,
		}
		const isCurrentMonth =
			seedChallengeMonth === now.getUTCMonth() + 1 &&
			seedChallengeYear === now.getUTCFullYear()
		if (isCurrentMonth) {
			await loadChallengeState(userId)
		}
	} catch (e) {
		seedStatus = {
			text: `Error: ${e instanceof Error ? e.message : "Failed"}`,
			ok: false,
		}
	}
}

async function forceGenerateChallenge(userId: string) {
	seedStatus = null
	try {
		const generated = await api.post<{ title: string }>(
			"/admin/challenges/generate",
		)
		seedStatus = {
			text: `Generated this month's challenge: "${generated.title}"`,
			ok: true,
		}
		await loadChallengeState(userId)
	} catch (e) {
		seedStatus = {
			text: `Error: ${e instanceof Error ? e.message : "Failed"}`,
			ok: false,
		}
	}
}

async function resetChallengeProgress(userId: string) {
	seedStatus = null
	try {
		const result = await api.del<{ deleted: number }>(
			`/admin/users/${userId}/challenge`,
		)
		seedStatus = {
			text:
				result.deleted > 0
					? `Cleared challenge progress (${result.deleted} record${result.deleted === 1 ? "" : "s"})`
					: "No challenge progress to clear",
			ok: true,
		}
		await loadChallengeState(userId)
	} catch (e) {
		seedStatus = {
			text: `Error: ${e instanceof Error ? e.message : "Failed"}`,
			ok: false,
		}
	}
}

function toggleKey(key: string) {
	const next = new Set(selectedKeys)
	if (next.has(key)) next.delete(key)
	else next.add(key)
	selectedKeys = next
}

async function runSeed(path: string, body: object, msg: string) {
	seedStatus = null
	try {
		await api.post(path, body)
		seedStatus = { text: msg, ok: true }
	} catch (e) {
		seedStatus = {
			text: `Error: ${e instanceof Error ? e.message : "Failed"}`,
			ok: false,
		}
	}
}

onMount(load)
</script>

<div class="admin-wrap">
	<div class="admin-header">
		<h1>Admin Panel</h1>
		<span class="dev-tag">DEV ONLY</span>
	</div>

	{#if loading}
		<p class="muted">Loading…</p>
	{:else if loadError}
		<p class="error-text">{loadError}</p>
	{:else}
		<section class="card">
			<h2>Create Test User</h2>
			<div class="form-row">
				<input class="inp" placeholder="Name (optional)" bind:value={newName} />
				<input class="inp" placeholder="Email (optional)" bind:value={newEmail} />
				<input class="inp" placeholder="Password" bind:value={newPassword} />
				<button class="btn primary" onclick={createUser} disabled={creating}>
					{creating ? "Creating…" : "Create"}
				</button>
			</div>
			{#if createResult}
				<p class="status-msg" class:ok={createResult.ok} class:fail={!createResult.ok}>
					{createResult.text}
				</p>
			{/if}
		</section>

		<section class="card">
			<h2>Users ({users.length})</h2>
			<table class="user-table">
				<thead>
					<tr>
						<th>Name</th>
						<th>Email</th>
						<th>Role</th>
						<th>Actions</th>
					</tr>
				</thead>
				<tbody>
					{#each users as user (user.id)}
						<tr>
							<td>{user.name}</td>
							<td class="mono">{user.email}</td>
							<td>
								{#if user.isAdmin}<span class="admin-badge">Admin</span>{:else}User{/if}
							</td>
							<td class="actions-cell">
								<button class="btn accent sm" onclick={() => impersonate(user.id)}>
									Impersonate
								</button>
								<button
									class="btn outline sm"
									onclick={() => toggleExpand(user.id)}
								>
									{expandedId === user.id ? "Close" : "Seed"}
								</button>
								<button class="btn danger sm" onclick={() => deleteUser(user.id, user.name)}>
									Delete
								</button>
							</td>
						</tr>
						{#if expandedId === user.id}
							<tr class="seed-row">
								<td colspan="4">
									<div class="seed-panel">
										<div class="tab-bar">
											{#each (["checkins", "weight", "badges", "food", "gym", "challenges"] as const) as tab}
												<button
													class="tab"
													class:active={seedTab === tab}
													onclick={() => selectTab(user.id, tab)}
												>
													{tab}
												</button>
											{/each}
										</div>

										<div class="tab-content">
											{#if seedTab === "checkins"}
												<div class="field-row">
													<label>
														Days
														<input type="number" class="inp inp-sm" bind:value={checkinDays} min="1" max="365" />
													</label>
													<button
														class="btn primary sm"
														onclick={() =>
															runSeed(
																`/admin/seed/${user.id}/checkins`,
																{ days: checkinDays },
																`Seeded ${checkinDays} consecutive check-in days`,
															)}
													>
														Seed Checkins
													</button>
												</div>
											{:else if seedTab === "weight"}
												<div class="field-row">
													<label>Entries <input type="number" class="inp inp-sm" bind:value={weightCount} min="1" max="100" /></label>
													<label>Start kg <input type="number" class="inp inp-sm" bind:value={weightStartKg} min="1" /></label>
													<label>End kg <input type="number" class="inp inp-sm" bind:value={weightEndKg} min="1" /></label>
													<button
														class="btn primary sm"
														onclick={() =>
															runSeed(
																`/admin/seed/${user.id}/weight`,
																{ count: weightCount, startKg: weightStartKg, endKg: weightEndKg },
																`Seeded ${weightCount} weight entries (${weightStartKg}→${weightEndKg} kg)`,
															)}
													>
														Seed Weight
													</button>
												</div>
											{:else if seedTab === "badges"}
												<div class="badge-grid">
													{#each badgesByTier as badge (badge.id)}
														<label class="badge-option">
															<input
																type="checkbox"
																checked={selectedKeys.has(badge.key)}
																onchange={() => toggleKey(badge.key)}
															/>
															<span class="tier-dot t-{badge.tier}"></span>
															<span class="badge-name">{badge.name}</span>
														</label>
													{/each}
												</div>
												<button
													class="btn primary sm"
													disabled={selectedKeys.size === 0}
													onclick={() =>
														runSeed(
															`/admin/seed/${user.id}/badges`,
															{ keys: [...selectedKeys] },
															`Awarded ${selectedKeys.size} badge(s)`,
														)}
												>
													Award {selectedKeys.size} Badge{selectedKeys.size !== 1 ? "s" : ""}
												</button>
											{:else if seedTab === "food"}
												<div class="field-row">
													<label>
														Entries
														<input type="number" class="inp inp-sm" bind:value={foodCount} min="1" max="30" />
													</label>
													<button
														class="btn primary sm"
														onclick={() =>
															runSeed(
																`/admin/seed/${user.id}/food`,
																{ count: foodCount },
																`Seeded ${foodCount} food log entries`,
															)}
													>
														Seed Food
													</button>
												</div>
											{:else if seedTab === "gym"}
												<div class="field-row">
													<button
														class="btn primary sm"
														onclick={() =>
															runSeed(
																"/gym/generate-content",
																{ userId: user.id },
																"Content generated (dialogs + gym event + portraits)",
															)}
													>
														Generate Gym Content
													</button>
												</div>
											{:else if seedTab === "challenges"}
												<div class="field-row">
													<button
														class="btn outline sm"
														onclick={() => forceGenerateChallenge(user.id)}
													>
														Force-generate this month's challenge
													</button>
												</div>
												<p class="muted challenge-generate-note">
													Global action — creates the current month's AI challenge
													for all users, not just this one.
												</p>

												<div class="field-row">
													<label>
														Month
														<input type="number" class="inp inp-sm" bind:value={seedChallengeMonth} min="1" max="12" />
													</label>
													<label>
														Year
														<input type="number" class="inp inp-sm" bind:value={seedChallengeYear} min="2000" />
													</label>
													<label>
														Completion
														<select class="inp inp-sm" bind:value={seedChallengeCompletion}>
															<option value="none">Not joined</option>
															<option value="partial">Partial</option>
															<option value="near_complete">Near-complete</option>
															<option value="complete">Complete</option>
														</select>
													</label>
													<button
														class="btn primary sm"
														onclick={() => seedChallenge(user.id)}
													>
														Seed Challenge
													</button>
													<button
														class="btn outline sm"
														onclick={() => resetChallengeProgress(user.id)}
													>
														Reset all challenge progress
													</button>
												</div>

												<div class="challenge-view">
													{#if challengeLoading}
														<p class="muted">Loading…</p>
													{:else if challengeError}
														<p class="error-text">{challengeError}</p>
													{:else if !challengeState?.challenge}
														<p class="muted">No challenge exists for the current month.</p>
													{:else}
														<h3 class="challenge-title">{challengeState.challenge.title}</h3>
														{#if !challengeState.joined}
															<p class="muted">This user has not joined the current challenge.</p>
														{:else}
															<p class="challenge-meta">
																{challengeState.goalsCompleted} / {challengeState.totalGoals} goals complete
																{#if challengeState.completedAt}
																	— completed {new Date(challengeState.completedAt).toLocaleString()}
																{:else}
																	— not yet completed
																{/if}
															</p>
															<ul class="goal-list">
																{#each challengeState.challenge.goals as goal (goal.id)}
																	<li>
																		<span class="goal-name">{goal.title}</span>
																		<span class="goal-progress">
																			{challengeState.completedTasks?.[goal.id] ?? 0} / {goal.target} {goal.unit}
																		</span>
																	</li>
																{/each}
															</ul>
														{/if}
													{/if}
												</div>
											{/if}

											{#if seedStatus}
												<p
													class="status-msg"
													class:ok={seedStatus.ok}
													class:fail={!seedStatus.ok}
												>
													{seedStatus.text}
												</p>
											{/if}
										</div>
									</div>
								</td>
							</tr>
						{/if}
					{/each}
				</tbody>
			</table>
		</section>
	{/if}
</div>

<style>
.admin-wrap {
	max-width: 960px;
	margin: 2rem auto;
	padding: 0 1.5rem;
}

.admin-header {
	display: flex;
	align-items: center;
	gap: 0.75rem;
	margin-bottom: 1.5rem;
}

.admin-header h1 {
	margin: 0;
	font-size: 1.5rem;
}

.dev-tag {
	background: #ef4444;
	color: #fff;
	font-size: 0.7rem;
	font-weight: 700;
	letter-spacing: 0.05em;
	padding: 0.2rem 0.5rem;
	border-radius: 0.25rem;
}

.card {
	background: var(--color-surface);
	border: 1px solid var(--color-border);
	border-radius: 0.5rem;
	padding: 1.25rem;
	margin-bottom: 1.5rem;
}

.card h2 {
	margin: 0 0 1rem;
	font-size: 1rem;
}

.form-row {
	display: flex;
	gap: 0.5rem;
	flex-wrap: wrap;
}

.inp {
	background: var(--color-bg);
	border: 1px solid var(--color-border);
	border-radius: 0.375rem;
	padding: 0.375rem 0.625rem;
	color: var(--color-text);
	font-size: 0.875rem;
	min-width: 0;
}

.inp-sm {
	width: 5rem;
}

.btn {
	border: none;
	border-radius: 0.375rem;
	padding: 0.375rem 0.875rem;
	font-size: 0.875rem;
	cursor: pointer;
	font-weight: 500;
	white-space: nowrap;
}

.btn:disabled {
	opacity: 0.5;
	cursor: not-allowed;
}

.btn.sm {
	padding: 0.25rem 0.625rem;
	font-size: 0.8rem;
}

.btn.primary {
	background: var(--color-accent);
	color: #fff;
}

.btn.primary:hover:not(:disabled) {
	opacity: 0.9;
}

.btn.accent {
	background: var(--color-accent);
	color: #fff;
}

.btn.outline {
	background: transparent;
	border: 1px solid var(--color-border);
	color: var(--color-text-muted);
}

.btn.outline:hover {
	background: var(--color-surface-2);
}

.btn.danger {
	background: #ef4444;
	color: #fff;
}

.btn.danger:hover {
	background: #dc2626;
}

.status-msg {
	margin: 0.5rem 0 0;
	font-size: 0.8rem;
}

.status-msg.ok {
	color: #10b981;
}

.status-msg.fail {
	color: #ef4444;
}

.user-table {
	width: 100%;
	border-collapse: collapse;
	font-size: 0.875rem;
}

.user-table th,
.user-table td {
	text-align: left;
	padding: 0.5rem 0.75rem;
	border-bottom: 1px solid var(--color-border);
}

.user-table th {
	color: var(--color-text-muted);
	font-weight: 500;
	font-size: 0.8rem;
}

.mono {
	font-family: monospace;
	font-size: 0.8rem;
}

.admin-badge {
	background: var(--color-accent);
	color: #fff;
	font-size: 0.7rem;
	font-weight: 600;
	padding: 0.1rem 0.4rem;
	border-radius: 0.25rem;
}

.actions-cell {
	display: flex;
	gap: 0.375rem;
	flex-wrap: wrap;
}

.seed-row td {
	padding: 0;
	background: var(--color-bg);
}

.seed-panel {
	padding: 0.75rem 1rem;
}

.tab-bar {
	display: flex;
	gap: 0.25rem;
	margin-bottom: 0.75rem;
}

.tab {
	background: transparent;
	border: 1px solid var(--color-border);
	border-radius: 0.375rem;
	padding: 0.25rem 0.75rem;
	font-size: 0.8rem;
	cursor: pointer;
	color: var(--color-text-muted);
	text-transform: capitalize;
}

.tab.active {
	background: var(--color-accent);
	color: #fff;
	border-color: var(--color-accent);
}

.tab-content {
	display: flex;
	flex-direction: column;
	gap: 0.75rem;
}

.field-row {
	display: flex;
	align-items: center;
	gap: 0.75rem;
	flex-wrap: wrap;
}

.field-row label {
	display: flex;
	align-items: center;
	gap: 0.375rem;
	font-size: 0.8rem;
	color: var(--color-text-muted);
}

.badge-grid {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
	gap: 0.25rem;
	max-height: 240px;
	overflow-y: auto;
}

.badge-option {
	display: flex;
	align-items: center;
	gap: 0.375rem;
	font-size: 0.8rem;
	cursor: pointer;
	padding: 0.125rem 0;
}

.tier-dot {
	display: inline-block;
	width: 8px;
	height: 8px;
	border-radius: 50%;
	flex-shrink: 0;
}

.t-bronze { background: #b45309; }
.t-silver { background: #6b7280; }
.t-gold   { background: #d97706; }
.t-platinum { background: #6366f1; }

.badge-name {
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.muted {
	color: var(--color-text-muted);
}

.error-text {
	color: #ef4444;
}

.challenge-generate-note {
	margin: 0.25rem 0 0.75rem;
	font-size: 0.75rem;
}

.challenge-view {
	display: flex;
	flex-direction: column;
	gap: 0.5rem;
}

.challenge-title {
	margin: 0;
	font-size: 0.95rem;
}

.challenge-meta {
	margin: 0;
	font-size: 0.8rem;
	color: var(--color-text-muted);
}

.goal-list {
	list-style: none;
	margin: 0;
	padding: 0;
	display: flex;
	flex-direction: column;
	gap: 0.25rem;
}

.goal-list li {
	display: flex;
	justify-content: space-between;
	gap: 0.75rem;
	font-size: 0.85rem;
	padding: 0.25rem 0;
	border-bottom: 1px solid var(--color-border);
}

.goal-progress {
	color: var(--color-text-muted);
	white-space: nowrap;
}
</style>
