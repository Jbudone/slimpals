<script lang="ts">
import ThemeSwitcher from "../components/ThemeSwitcher.svelte"
import { userProfile } from "../lib/user.svelte.js"
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

h2 {
	font-size: 1rem;
	font-weight: 600;
	color: var(--color-text);
	margin: 0 0 0.375rem;
}

.section-desc {
	font-size: 0.875rem;
	color: var(--color-text-muted);
	margin: 0 0 1rem;
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
</style>
