<script lang="ts">
import { onMount } from "svelte"
import ThemeSwitcher from "../components/ThemeSwitcher.svelte"
import { api } from "../lib/api.js"
import { userProfile } from "../lib/user.svelte.js"

type Invite = {
	id: number
	code: string
	createdAt: string
	expiresAt: string
	status: "active" | "used" | "expired"
	usedByName: string | null
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

onMount(loadInvites)
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
	{/if}

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
</style>
