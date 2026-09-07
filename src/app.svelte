<script lang="ts">
import { onMount } from "svelte"
import Toast from "./components/Toast.svelte"
import { authState, fetchSession, logout } from "./lib/auth.svelte.js"
import {
	fetchUserProfile,
	stopImpersonating,
	userProfile,
} from "./lib/user.svelte.js"
import Admin from "./pages/Admin.svelte"
import Badges from "./pages/Badges.svelte"
import Challenges from "./pages/Challenges.svelte"
import Dashboard from "./pages/Dashboard.svelte"
import Food from "./pages/Food.svelte"
import Gym from "./pages/Gym.svelte"
import Login from "./pages/Login.svelte"
import Register from "./pages/Register.svelte"
import Settings from "./pages/Settings.svelte"
import Social from "./pages/Social.svelte"
import Tournaments from "./pages/Tournaments.svelte"
import Weight from "./pages/Weight.svelte"
import { initRouter, nav, page } from "./router.svelte.js"

let currentPath = $derived(nav.path)
let isLoggedIn = $derived(authState.user !== null)
let isLoading = $derived(authState.loading)
let isAdmin = $derived(userProfile.data?.isAdmin ?? false)
let impersonatedBy = $derived(userProfile.data?.impersonatedBy ?? null)

onMount(async () => {
	await fetchSession()
	initRouter()

	if (authState.user) {
		await fetchUserProfile()
	}

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

async function handleStopImpersonating() {
	await stopImpersonating()
	await fetchSession()
	await fetchUserProfile()
	page("/admin")
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
	{#if impersonatedBy}
		<div class="impersonation-banner">
			👤 Impersonating <strong>{userProfile.data?.name}</strong> (as {impersonatedBy.name})
			<button class="stop-impersonating-btn" onclick={handleStopImpersonating}>
				Return to {impersonatedBy.name}
			</button>
		</div>
	{/if}
	<nav class="top-nav">
		<span class="brand">SlimPals</span>
		<a class="nav-link" href="/" onclick={(e) => { e.preventDefault(); page("/") }}>Dashboard</a>
		<a class="nav-link" href="/weight" onclick={(e) => { e.preventDefault(); page("/weight") }}>Weight</a>
		<a class="nav-link" href="/food" onclick={(e) => { e.preventDefault(); page("/food") }}>Food</a>
		<a class="nav-link" href="/social" onclick={(e) => { e.preventDefault(); page("/social") }}>Social</a>
		<a class="nav-link" href="/tournaments" onclick={(e) => { e.preventDefault(); page("/tournaments") }}>Tournaments</a>
		<a class="nav-link" href="/challenges" onclick={(e) => { e.preventDefault(); page("/challenges") }}>Challenges</a>
		<a class="nav-link" href="/badges" onclick={(e) => { e.preventDefault(); page("/badges") }}>Badges</a>
		<a class="nav-link" href="/gym" onclick={(e) => { e.preventDefault(); page("/gym") }}>Gym</a>
		<a class="nav-link" href="/settings" onclick={(e) => { e.preventDefault(); page("/settings") }}>Settings</a>
		{#if isAdmin}
			<a class="nav-link admin-link" href="/admin" onclick={(e) => { e.preventDefault(); page("/admin") }}>Admin</a>
		{/if}
		<button class="logout-btn" onclick={handleLogout}>Sign out</button>
	</nav>

	{#if currentPath === "/"}
		<Dashboard />
	{:else if currentPath === "/weight"}
		<Weight />
	{:else if currentPath === "/food"}
		<Food />
	{:else if currentPath === "/social"}
		<Social />
	{:else if currentPath === "/tournaments"}
		<Tournaments />
	{:else if currentPath === "/challenges"}
		<Challenges />
	{:else if currentPath === "/badges"}
		<Badges />
	{:else if currentPath === "/gym"}
		<Gym />
	{:else if currentPath === "/settings"}
		<Settings />
	{:else if currentPath === "/admin"}
		<Admin />
	{:else if import.meta.env.DEV && currentPath === "/gym-sprites"}
		{#await import("./pages/GymSprites.svelte") then { default: GymSprites }}
			<GymSprites />
		{/await}
	{/if}
	<Toast />
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

.impersonation-banner {
	display: flex;
	align-items: center;
	justify-content: center;
	gap: 0.75rem;
	padding: 0.5rem 1rem;
	background: #7c2d12;
	color: #fed7aa;
	font-size: 0.85rem;
	text-align: center;
}

.stop-impersonating-btn {
	background: #fed7aa;
	color: #7c2d12;
	border: none;
	border-radius: 0.375rem;
	padding: 0.25rem 0.75rem;
	font-size: 0.8rem;
	font-weight: 600;
	cursor: pointer;
}

.stop-impersonating-btn:hover {
	background: #fff;
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

.nav-link {
	color: var(--color-text-muted);
	font-size: 0.875rem;
	text-decoration: none;
	margin-right: auto;
	margin-left: 1.5rem;
}

.nav-link:hover {
	color: var(--color-text);
}

.admin-link {
	color: #ef4444;
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
