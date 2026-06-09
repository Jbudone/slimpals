<script lang="ts">
import { onMount } from "svelte"
import { authState, fetchSession, logout } from "./lib/auth.svelte.js"
import Dashboard from "./pages/Dashboard.svelte"
import Login from "./pages/Login.svelte"
import Register from "./pages/Register.svelte"
import { initRouter, nav, page } from "./router.svelte.js"

let currentPath = $derived(nav.path)
let isLoggedIn = $derived(authState.user !== null)
let isLoading = $derived(authState.loading)

onMount(async () => {
	await fetchSession()
	initRouter()

	// Redirect to /login if unauthenticated and on a protected route
	if (
		!authState.user &&
		currentPath !== "/login" &&
		currentPath !== "/register"
	) {
		page("/login")
	}
})

async function handleLogout() {
	await logout()
	page("/login")
}
</script>

{#if isLoading}
	<div class="loading-screen">Loading…</div>
{:else if currentPath === "/login"}
	<Login />
{:else if currentPath === "/register"}
	<Register />
{:else if !isLoggedIn}
	<Login />
{:else}
	<nav class="top-nav">
		<span class="brand">SlimPals</span>
		<button class="logout-btn" onclick={handleLogout}>Sign out</button>
	</nav>

	{#if currentPath === "/"}
		<Dashboard />
	{/if}
{/if}

<style>
.loading-screen {
	display: flex;
	align-items: center;
	justify-content: center;
	min-height: 100vh;
	background: var(--color-bg);
	color: var(--color-text-muted);
}

.top-nav {
	display: flex;
	align-items: center;
	justify-content: space-between;
	padding: 0.75rem 1.5rem;
	background: var(--color-surface);
	border-bottom: 1px solid var(--color-border);
}

.brand {
	font-weight: 700;
	font-size: 1.125rem;
	color: var(--color-accent);
}

.logout-btn {
	background: transparent;
	border: 1px solid var(--color-border);
	border-radius: 0.375rem;
	padding: 0.375rem 0.75rem;
	color: var(--color-text-muted);
	font-size: 0.875rem;
	cursor: pointer;
}

.logout-btn:hover {
	background: var(--color-surface-2);
	color: var(--color-text);
}
</style>
