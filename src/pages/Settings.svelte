<script lang="ts">
import { onMount } from "svelte"
import type { CoachPersonality, ViewMode } from "../../shared/types.js"
import ThemeSwitcher from "../components/ThemeSwitcher.svelte"
import { api } from "../lib/api.js"
import {
	type UserProfile,
	updateCoachPersonality,
	userProfile,
} from "../lib/user.svelte.js"

type PersonalityOption = {
	id: CoachPersonality
	name: string
	description: string
	sample: string
}

const PERSONALITY_OPTIONS: PersonalityOption[] = [
	{
		id: "friendly",
		name: "Coach Sam",
		description: "Warm, encouraging, and always in your corner.",
		sample:
			"Amazing work — that meal is packed with nutrients to fuel your goals!",
	},
	{
		id: "drill_sergeant",
		name: "Sarge",
		description: "Tough love, military intensity, zero excuses.",
		sample: "Listen up, soldier — that meal is mission fuel. Keep executing!",
	},
	{
		id: "roaster",
		name: "The Roaster",
		description: "Brutally funny with a heart of gold.",
		sample:
			"Was this meal a cry for help? Bold choice. At least the protein's decent.",
	},
	{
		id: "anime_sensei",
		name: "Sensei",
		description: "Philosophical, dramatic, and epically motivating.",
		sample: "Every bite... is a step upon the warrior's path. Choose wisely.",
	},
	{
		id: "bro",
		name: "Bro",
		description: "Gym-bro hype energy, ALL CAPS when excited.",
		sample:
			"BRO those macros are CLEAN — your gains are gonna be UNREAL today!",
	},
]

let savingPersonality = $state(false)
let savingShare = $state<string | null>(null)
let savingViewMode = $state(false)
let heightInput = $state("")
let savingHeight = $state(false)
let heightSaved = $state(false)

async function setViewMode(mode: ViewMode) {
	if (!userProfile.data || savingViewMode || userProfile.data.viewMode === mode)
		return
	savingViewMode = true
	try {
		const data = await api.patch<UserProfile>("/users/me", { viewMode: mode })
		userProfile.data = data
	} finally {
		savingViewMode = false
	}
}

async function saveHeight() {
	if (!userProfile.data || savingHeight) return
	const cm = heightInput ? Math.round(Number.parseFloat(heightInput)) : null
	if (heightInput && (Number.isNaN(cm as number) || (cm as number) <= 0)) return
	savingHeight = true
	try {
		const data = await api.patch<UserProfile>("/users/me", { heightCm: cm })
		userProfile.data = data
		heightSaved = true
		setTimeout(() => {
			heightSaved = false
		}, 2000)
	} finally {
		savingHeight = false
	}
}

async function toggleShare(
	field: "autoShareFoodLogs" | "autoShareBadges" | "autoShareWeightMilestones",
) {
	if (!userProfile.data || savingShare) return
	savingShare = field
	try {
		const data = await api.patch<UserProfile>("/users/me", {
			[field]: !userProfile.data[field],
		})
		userProfile.data = data
	} finally {
		savingShare = null
	}
}

type Invite = {
	id: number
	code: string
	createdAt: string
	expiresAt: string
	status: "active" | "used" | "expired"
	usedByName: string | null
}

// Apple Health import
type ImportSummary = {
	weightEntriesImported: number
	weightEntriesSkipped: number
	stepRecordsSaved: number
}
let importing = $state(false)
let importError = $state<string | null>(null)
let importSummary = $state<ImportSummary | null>(null)
let fileInputEl = $state<HTMLInputElement | undefined>(undefined)

async function handleImport() {
	if (!fileInputEl?.files?.length) return
	const file = fileInputEl.files[0]
	importing = true
	importError = null
	importSummary = null
	const formData = new FormData()
	formData.append("file", file)
	try {
		const res = await fetch("/api/health/import", {
			method: "POST",
			body: formData,
			credentials: "include",
		})
		const data = await res.json()
		if (!res.ok) {
			importError = data.error ?? "Import failed"
			return
		}
		importSummary = data as ImportSummary
	} catch {
		importError = "Upload failed. Please try again."
	} finally {
		importing = false
		if (fileInputEl) fileInputEl.value = ""
	}
}

let inviteList = $state<Invite[]>([])
let invitesLoading = $state(true)
let generating = $state(false)
let copied = $state<number | null>(null)

async function loadInvites() {
	try {
		inviteList = await api.get<Invite[]>("/invites")
	} finally {
		invitesLoading = false
	}
}

async function generate() {
	generating = true
	try {
		const newInvite = await api.post<Invite>("/invites")
		inviteList = [...inviteList, newInvite]
	} finally {
		generating = false
	}
}

async function copyCode(invite: Invite) {
	await navigator.clipboard.writeText(invite.code)
	copied = invite.id
	setTimeout(() => {
		copied = null
	}, 2000)
}

onMount(() => {
	loadInvites()
	if (userProfile.data?.heightCm) {
		heightInput = String(userProfile.data.heightCm)
	}
})
</script>

<div class="settings">
	<h1>Settings</h1>

	<section class="section">
		<h2>Appearance</h2>
		<p class="section-desc">Choose a theme. Your choice is saved to your profile.</p>
		<ThemeSwitcher />
	</section>

	{#if userProfile.data}
		<section class="section">
			<h2>Account</h2>
			<dl class="profile">
				<dt>Name</dt>
				<dd>{userProfile.data.name}</dd>
				<dt>Email</dt>
				<dd>{userProfile.data.email}</dd>
			</dl>
		</section>

		<section class="section">
			<h2>View Mode</h2>
			<p class="section-desc">Simple shows clean charts. Technical adds moving averages, regression, and BMI.</p>
			<div class="view-mode-toggle">
				<button
					type="button"
					class="mode-btn"
					class:active={userProfile.data.viewMode === "simple"}
					disabled={savingViewMode}
					onclick={() => setViewMode("simple")}
				>Simple</button>
				<button
					type="button"
					class="mode-btn"
					class:active={userProfile.data.viewMode === "technical"}
					disabled={savingViewMode}
					onclick={() => setViewMode("technical")}
				>Technical</button>
			</div>
		</section>

		<section class="section">
			<h2>Height</h2>
			<p class="section-desc">Used for BMI calculation in Technical view mode.</p>
			<div class="height-form">
				<input
					type="number"
					min="50"
					max="300"
					step="1"
					placeholder="e.g. 175"
					bind:value={heightInput}
					class="height-input"
				/>
				<span class="height-unit">cm</span>
				<button
					type="button"
					class="btn-save-height"
					disabled={savingHeight}
					onclick={saveHeight}
				>
					{#if heightSaved}
						Saved!
					{:else if savingHeight}
						Saving…
					{:else}
						Save
					{/if}
				</button>
			</div>
		</section>

		<section class="section">
			<h2>Coach Personality</h2>
			<p class="section-desc">Choose who delivers your AI coaching messages.</p>
			<ul class="personality-list">
				{#each PERSONALITY_OPTIONS as option (option.id)}
					{@const selected = userProfile.data.coachPersonality === option.id}
					<li>
						<button
							type="button"
							class="personality-card"
							class:selected
							disabled={savingPersonality}
							onclick={async () => {
								if (selected) return
								savingPersonality = true
								try {
									await updateCoachPersonality(option.id)
								} finally {
									savingPersonality = false
								}
							}}
						>
							<div class="personality-header">
								<span class="personality-name">{option.name}</span>
								{#if selected}
									<span class="personality-active">Active</span>
								{/if}
							</div>
							<p class="personality-desc">{option.description}</p>
							<p class="personality-sample">"{option.sample}"</p>
						</button>
					</li>
				{/each}
			</ul>
		</section>

		<section class="section">
			<h2>Sharing</h2>
			<p class="section-desc">Choose what gets posted to the social feed automatically.</p>
			<ul class="toggle-list">
				<li class="toggle-row">
					<div class="toggle-info">
						<span class="toggle-label">Food logs</span>
						<span class="toggle-desc">Auto-share when you log a meal</span>
					</div>
					<button
						type="button"
						class="toggle-switch"
						class:on={userProfile.data.autoShareFoodLogs}
						disabled={savingShare === "autoShareFoodLogs"}
						onclick={() => toggleShare("autoShareFoodLogs")}
						aria-label="Toggle auto-share food logs"
					>
						<span class="toggle-knob"></span>
					</button>
				</li>
				<li class="toggle-row">
					<div class="toggle-info">
						<span class="toggle-label">Badges</span>
						<span class="toggle-desc">Auto-share when you earn a badge</span>
					</div>
					<button
						type="button"
						class="toggle-switch"
						class:on={userProfile.data.autoShareBadges}
						disabled={savingShare === "autoShareBadges"}
						onclick={() => toggleShare("autoShareBadges")}
						aria-label="Toggle auto-share badges"
					>
						<span class="toggle-knob"></span>
					</button>
				</li>
				<li class="toggle-row">
					<div class="toggle-info">
						<span class="toggle-label">Weight milestones</span>
						<span class="toggle-desc">Auto-share when you hit a weight loss milestone</span>
					</div>
					<button
						type="button"
						class="toggle-switch"
						class:on={userProfile.data.autoShareWeightMilestones}
						disabled={savingShare === "autoShareWeightMilestones"}
						onclick={() => toggleShare("autoShareWeightMilestones")}
						aria-label="Toggle auto-share weight milestones"
					>
						<span class="toggle-knob"></span>
					</button>
				</li>
			</ul>
		</section>
	{/if}

	<section class="section">
		<h2>Apple Health Import</h2>
		<p class="section-desc">Upload an Apple Health XML export to import weight and step data.</p>

		<div class="import-form">
			<input
				type="file"
				accept=".xml"
				bind:this={fileInputEl}
				class="file-input"
			/>
			<button
				type="button"
				class="btn-primary"
				disabled={importing}
				onclick={handleImport}
			>
				{importing ? "Importing…" : "Upload & Import"}
			</button>
		</div>

		{#if importError}
			<div class="import-error">{importError}</div>
		{/if}

		{#if importSummary}
			<div class="import-summary">
				<h3>Import Complete</h3>
				<dl class="import-stats">
					<dt>Weight entries imported</dt>
					<dd>{importSummary.weightEntriesImported}</dd>
					<dt>Weight entries skipped (duplicates)</dt>
					<dd>{importSummary.weightEntriesSkipped}</dd>
					<dt>Step records saved</dt>
					<dd>{importSummary.stepRecordsSaved}</dd>
				</dl>
			</div>
		{/if}
	</section>

	<section class="section">
		<div class="section-header">
			<div>
				<h2>Invite Codes</h2>
				<p class="section-desc">Share codes to let friends join SlimPals.</p>
			</div>
			<button
				class="btn-primary"
				onclick={generate}
				disabled={generating}
				type="button"
			>
				{generating ? "Generating…" : "Generate new invite"}
			</button>
		</div>

		{#if invitesLoading}
			<p class="muted">Loading…</p>
		{:else if inviteList.length === 0}
			<p class="muted">No invite codes yet. Generate one above.</p>
		{:else}
			<ul class="invite-list">
				{#each inviteList as invite (invite.id)}
					<li class="invite-row" class:dimmed={invite.status !== "active"}>
						<span class="invite-code">{invite.code}</span>

						<span class="badge {invite.status}">
							{#if invite.status === "used"}
								Used{invite.usedByName ? ` by ${invite.usedByName}` : ""}
							{:else if invite.status === "expired"}
								Expired
							{:else}
								Expires {new Date(invite.expiresAt).toLocaleDateString()}
							{/if}
						</span>

						{#if invite.status === "active"}
							<button
								class="btn-copy"
								onclick={() => copyCode(invite)}
								type="button"
								aria-label="Copy invite code"
							>
								{copied === invite.id ? "Copied!" : "Copy"}
							</button>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}
	</section>
</div>

<style>
.settings {
	max-width: 680px;
	margin: 0 auto;
	padding: 2rem 1.5rem;
}

h1 {
	font-size: 1.5rem;
	font-weight: 700;
	color: var(--color-text);
	margin: 0 0 2rem;
}

.section {
	margin-bottom: 2.5rem;
}

.section-header {
	display: flex;
	align-items: flex-start;
	justify-content: space-between;
	gap: 1rem;
	margin-bottom: 1rem;
}

.section-header > div {
	flex: 1;
}

h2 {
	font-size: 1rem;
	font-weight: 600;
	color: var(--color-text);
	margin: 0 0 0.375rem;
}

.section-desc {
	font-size: 0.875rem;
	color: var(--color-text-muted);
	margin: 0;
}

.profile {
	display: grid;
	grid-template-columns: 120px 1fr;
	gap: 0.5rem 1rem;
	margin: 0;
}

dt {
	font-size: 0.875rem;
	color: var(--color-text-muted);
}

dd {
	font-size: 0.875rem;
	color: var(--color-text);
	margin: 0;
}

.muted {
	font-size: 0.875rem;
	color: var(--color-text-muted);
}

/* Invite list */
.invite-list {
	list-style: none;
	padding: 0;
	margin: 0;
	display: flex;
	flex-direction: column;
	gap: 0.5rem;
}

.invite-row {
	display: flex;
	align-items: center;
	gap: 0.75rem;
	background: var(--color-surface);
	border: 1px solid var(--color-border);
	border-radius: 0.5rem;
	padding: 0.625rem 0.875rem;
}

.invite-row.dimmed {
	opacity: 0.6;
}

.invite-code {
	font-family: monospace;
	font-size: 0.9375rem;
	color: var(--color-text);
	letter-spacing: 0.04em;
	flex: 1;
}

/* Status badge */
.badge {
	font-size: 0.75rem;
	font-weight: 600;
	padding: 0.2rem 0.5rem;
	border-radius: 99px;
	white-space: nowrap;
}

.badge.active {
	background: color-mix(in srgb, var(--color-success, #22c55e) 15%, transparent);
	color: var(--color-success, #22c55e);
	border: 1px solid var(--color-success, #22c55e);
}

.badge.used {
	background: color-mix(in srgb, var(--color-accent) 12%, transparent);
	color: var(--color-accent);
	border: 1px solid var(--color-accent);
}

.badge.expired {
	background: color-mix(in srgb, var(--color-text-muted) 12%, transparent);
	color: var(--color-text-muted);
	border: 1px solid var(--color-border);
}

/* Personality selector */
.personality-list {
	list-style: none;
	padding: 0;
	margin: 0;
	display: flex;
	flex-direction: column;
	gap: 0.5rem;
}

.personality-card {
	width: 100%;
	text-align: left;
	background: var(--color-surface);
	border: 1px solid var(--color-border);
	border-radius: 0.5rem;
	padding: 0.75rem 1rem;
	cursor: pointer;
	transition: border-color 0.15s;
}

.personality-card:hover:not(:disabled) {
	border-color: var(--color-accent);
}

.personality-card.selected {
	border-color: var(--color-accent);
	background: color-mix(in srgb, var(--color-accent) 8%, var(--color-surface));
}

.personality-card:disabled {
	opacity: 0.7;
	cursor: not-allowed;
}

.personality-header {
	display: flex;
	align-items: center;
	gap: 0.5rem;
	margin-bottom: 0.25rem;
}

.personality-name {
	font-size: 0.9375rem;
	font-weight: 600;
	color: var(--color-text);
}

.personality-active {
	font-size: 0.6875rem;
	font-weight: 700;
	text-transform: uppercase;
	letter-spacing: 0.06em;
	padding: 0.125rem 0.4rem;
	border-radius: 99px;
	background: color-mix(in srgb, var(--color-accent) 20%, transparent);
	color: var(--color-accent);
	border: 1px solid var(--color-accent);
}

.personality-desc {
	font-size: 0.8125rem;
	color: var(--color-text-muted);
	margin: 0 0 0.375rem;
}

.personality-sample {
	font-size: 0.8125rem;
	color: var(--color-text);
	font-style: italic;
	margin: 0;
	opacity: 0.75;
}

/* Buttons */
.btn-primary {
	padding: 0.5rem 1rem;
	background: var(--color-accent);
	color: #fff;
	border: none;
	border-radius: 0.375rem;
	font-size: 0.875rem;
	font-weight: 600;
	cursor: pointer;
	white-space: nowrap;
	flex-shrink: 0;
}

.btn-primary:disabled {
	opacity: 0.6;
	cursor: not-allowed;
}

.btn-copy {
	padding: 0.25rem 0.6rem;
	background: var(--color-surface-2);
	color: var(--color-text-muted);
	border: 1px solid var(--color-border);
	border-radius: 0.375rem;
	font-size: 0.75rem;
	font-weight: 600;
	cursor: pointer;
	flex-shrink: 0;
}

.btn-copy:hover {
	border-color: var(--color-accent);
	color: var(--color-accent);
}

/* Toggle switches */
.toggle-list {
	list-style: none;
	padding: 0;
	margin: 0.75rem 0 0;
	display: flex;
	flex-direction: column;
	gap: 0.5rem;
}

.toggle-row {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 1rem;
	background: var(--color-surface);
	border: 1px solid var(--color-border);
	border-radius: 0.5rem;
	padding: 0.625rem 0.875rem;
}

.toggle-info {
	display: flex;
	flex-direction: column;
	gap: 0.125rem;
}

.toggle-label {
	font-size: 0.875rem;
	font-weight: 600;
	color: var(--color-text);
}

.toggle-desc {
	font-size: 0.75rem;
	color: var(--color-text-muted);
}

.toggle-switch {
	position: relative;
	width: 44px;
	height: 24px;
	border-radius: 12px;
	border: 1px solid var(--color-border);
	background: var(--color-surface-2, #333);
	cursor: pointer;
	padding: 0;
	flex-shrink: 0;
	transition: background 0.2s, border-color 0.2s;
}

.toggle-switch.on {
	background: var(--color-accent);
	border-color: var(--color-accent);
}

.toggle-switch:disabled {
	opacity: 0.5;
	cursor: not-allowed;
}

.toggle-knob {
	position: absolute;
	top: 2px;
	left: 2px;
	width: 18px;
	height: 18px;
	border-radius: 50%;
	background: #fff;
	transition: transform 0.2s;
}

.toggle-switch.on .toggle-knob {
	transform: translateX(20px);
}

/* View mode toggle */
.view-mode-toggle {
	display: flex;
	gap: 0;
	margin-top: 0.75rem;
	border: 1px solid var(--color-border);
	border-radius: 0.5rem;
	overflow: hidden;
	width: fit-content;
}

.mode-btn {
	padding: 0.5rem 1.25rem;
	font-size: 0.875rem;
	font-weight: 600;
	background: var(--color-surface);
	color: var(--color-text-muted);
	border: none;
	cursor: pointer;
	transition: background 0.15s, color 0.15s;
}

.mode-btn + .mode-btn {
	border-left: 1px solid var(--color-border);
}

.mode-btn.active {
	background: var(--color-accent);
	color: #fff;
}

.mode-btn:disabled {
	opacity: 0.6;
	cursor: not-allowed;
}

/* Height form */
.height-form {
	display: flex;
	align-items: center;
	gap: 0.5rem;
	margin-top: 0.75rem;
}

.height-input {
	width: 100px;
	background: var(--color-surface-2, #333);
	border: 1px solid var(--color-border);
	border-radius: 0.375rem;
	padding: 0.5rem 0.625rem;
	color: var(--color-text);
	font-size: 0.9375rem;
}

.height-input:focus {
	outline: 2px solid var(--color-accent);
	outline-offset: 1px;
	border-color: var(--color-accent);
}

.height-unit {
	font-size: 0.875rem;
	color: var(--color-text-muted);
}

.btn-save-height {
	padding: 0.5rem 1rem;
	background: var(--color-accent);
	color: #fff;
	border: none;
	border-radius: 0.375rem;
	font-size: 0.8125rem;
	font-weight: 600;
	cursor: pointer;
}

.btn-save-height:disabled {
	opacity: 0.6;
	cursor: not-allowed;
}

/* Apple Health import */
.import-form {
	display: flex;
	align-items: center;
	gap: 0.75rem;
	margin-top: 0.75rem;
}

.file-input {
	font-size: 0.875rem;
	color: var(--color-text-muted);
}

.file-input::file-selector-button {
	background: var(--color-surface-2, #333);
	border: 1px solid var(--color-border);
	border-radius: 0.375rem;
	padding: 0.5rem 0.75rem;
	color: var(--color-text);
	font-size: 0.8125rem;
	font-weight: 600;
	cursor: pointer;
	margin-right: 0.5rem;
}

.import-error {
	margin-top: 0.75rem;
	background: color-mix(in srgb, var(--color-danger) 15%, transparent);
	border: 1px solid var(--color-danger);
	color: var(--color-danger);
	border-radius: 0.375rem;
	padding: 0.625rem 0.875rem;
	font-size: 0.875rem;
}

.import-summary {
	margin-top: 0.75rem;
	background: color-mix(in srgb, var(--color-success, #22c55e) 10%, transparent);
	border: 1px solid var(--color-success, #22c55e);
	border-radius: 0.5rem;
	padding: 1rem;
}

.import-summary h3 {
	font-size: 0.9375rem;
	font-weight: 600;
	color: var(--color-success, #22c55e);
	margin: 0 0 0.5rem;
}

.import-stats {
	display: grid;
	grid-template-columns: 1fr auto;
	gap: 0.25rem 1rem;
	margin: 0;
	font-size: 0.875rem;
}

.import-stats dt {
	color: var(--color-text-muted);
}

.import-stats dd {
	color: var(--color-text);
	font-weight: 600;
	text-align: right;
	margin: 0;
}
</style>
