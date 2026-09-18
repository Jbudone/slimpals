<script lang="ts">
import { computeInitials } from "../lib/initials.js"
import { userProfile } from "../lib/user.svelte.js"
import { page } from "../router.svelte.js"
import Avatar from "./ui/Avatar.svelte"

let open = $state(false)
let containerEl = $state<HTMLElement | null>(null)

// An admin who is impersonating someone is still the admin underneath —
// keep the Admin menu item reachable so they aren't locked out of their own
// panel while viewing as another user.
let isAdmin = $derived(
	(userProfile.data?.isAdmin ?? false) ||
		userProfile.data?.impersonatedBy != null,
)

let initials = $derived(computeInitials(userProfile.data?.name ?? ""))

function toggle() {
	open = !open
}

function go(path: "/settings" | "/admin") {
	open = false
	page(path)
}

function handleWindowClick(e: MouseEvent) {
	if (open && containerEl && !containerEl.contains(e.target as Node)) {
		open = false
	}
}

function handleKeydown(e: KeyboardEvent) {
	if (e.key === "Escape") open = false
}
</script>

<svelte:window onclick={handleWindowClick} onkeydown={handleKeydown} />

<div class="avatar-menu" bind:this={containerEl}>
	<button
		type="button"
		class="avatar-trigger"
		aria-haspopup="menu"
		aria-expanded={open}
		onclick={toggle}
	>
		<Avatar initials={initials} size={36} tone="accent" />
	</button>

	{#if open}
		<div class="menu" role="menu">
			<button type="button" role="menuitem" class="menu-item" onclick={() => go("/settings")}>
				Settings
			</button>
			{#if isAdmin}
				<button type="button" role="menuitem" class="menu-item admin-item" onclick={() => go("/admin")}>
					Admin
				</button>
			{/if}
		</div>
	{/if}
</div>

<style>
.avatar-menu {
	position: relative;
}

.avatar-trigger {
	background: none;
	border: none;
	padding: 0;
	cursor: pointer;
	display: flex;
	border-radius: var(--radius-full);
}

.avatar-trigger:focus-visible {
	outline: 2px solid var(--color-accent);
	outline-offset: 2px;
}

.menu {
	position: absolute;
	top: calc(100% + var(--space-2));
	right: 0;
	min-width: 10rem;
	background: var(--color-surface);
	border: 1px solid var(--color-border);
	border-radius: var(--radius-md);
	box-shadow: var(--shadow-md);
	padding: var(--space-2);
	display: flex;
	flex-direction: column;
	gap: var(--space-1);
	z-index: 20;
}

.menu-item {
	background: none;
	border: none;
	text-align: left;
	padding: var(--space-2) var(--space-3);
	border-radius: var(--radius-sm);
	font-size: var(--font-size-sm);
	font-family: var(--font-sans);
	color: var(--color-text);
	cursor: pointer;
}

.menu-item:hover {
	background: var(--color-surface-2);
}

.admin-item {
	color: var(--color-danger);
	font-weight: var(--font-weight-semibold);
}
</style>
