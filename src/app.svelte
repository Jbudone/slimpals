<script lang="ts">
import { onMount } from "svelte"
import BottomTabBar from "./components/BottomTabBar.svelte"
import Toast from "./components/Toast.svelte"
import { authState, fetchSession } from "./lib/auth.svelte.js"
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
let impersonatedBy = $derived(userProfile.data?.impersonatedBy ?? null)

onMount(async () => {
	await fetchSession()
	initRouter()

	if (authState.user) {
		await fetchUserProfile()
	}
})

// Keep the URL and auth state in sync on every navigation, not just at
// mount: unauthenticated users get sent to /login, and already-authenticated
// users (including via dev-autologin) get bounced off /login and /register
// straight to the dashboard instead of seeing the login form.
$effect(() => {
	if (isLoading) return
	if (!isLoggedIn && currentPath !== "/login" && currentPath !== "/register") {
		page("/login")
	} else if (
		isLoggedIn &&
		(currentPath === "/login" || currentPath === "/register")
	) {
		page("/")
	}
})

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
			👤 Viewing as <strong>{userProfile.data?.name}</strong> — impersonated by {impersonatedBy.name}
			<button class="stop-impersonating-btn" onclick={handleStopImpersonating}>
				Return to {impersonatedBy.name}
			</button>
		</div>
	{/if}
	<div class="app-shell">
		<main class="app-content">
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
			{:else if import.meta.env.DEV && currentPath === "/ui-kit"}
				{#await import("./pages/UiKit.svelte") then { default: UiKit }}
					<UiKit />
				{/await}
			{/if}
			<Toast />
		</main>
		<BottomTabBar />
	</div>
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

.app-shell {
	display: flex;
	flex-direction: column;
	min-height: 100vh;
}

.app-content {
	flex: 1;
}
</style>
