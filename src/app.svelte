<script lang="ts">
import { onMount } from "svelte"
import { fly } from "svelte/transition"
import AvatarMenu from "./components/AvatarMenu.svelte"
import BottomTabBar from "./components/BottomTabBar.svelte"
import Hud from "./components/home/Hud.svelte"
import LevelUp from "./components/home/LevelUp.svelte"
import Toast from "./components/Toast.svelte"
import { authState, fetchSession } from "./lib/auth.svelte.js"
import { loadCheckinStatus } from "./lib/checkin.svelte.js"
import { swipe } from "./lib/swipe.js"
import { neighbourPath, tabIndexOf } from "./lib/tabs.js"
import {
	fetchUserProfile,
	stopImpersonating,
	userProfile,
} from "./lib/user.svelte.js"
import { loadWallet } from "./lib/wallet.svelte.js"
import Admin from "./pages/Admin.svelte"
import CompeteHub from "./pages/CompeteHub.svelte"
import HallOfFame from "./pages/HallOfFame.svelte"
import Home from "./pages/Home.svelte"
import Login from "./pages/Login.svelte"
import Progress from "./pages/Progress.svelte"
import Register from "./pages/Register.svelte"
import Rewards from "./pages/Rewards.svelte"
import Settings from "./pages/Settings.svelte"
import SocialHub from "./pages/SocialHub.svelte"
import Today from "./pages/Today.svelte"
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
		loadCheckinStatus()
	}
})

// The HUD's numbers load with the session (and again after a login).
let walletFor: string | null = null
$effect(() => {
	const id = authState.user?.id ?? null
	if (id && id !== walletFor) {
		walletFor = id
		void loadWallet()
		loadCheckinStatus()
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

// A page slides in from the side its tab sits on (none with reduced motion).
const tabIdx = $derived(tabIndexOf(currentPath))
let prevTab = -1
let slideDir = $state(1)
$effect.pre(() => {
	if (tabIdx !== prevTab) {
		if (prevTab >= 0 && tabIdx >= 0) slideDir = tabIdx > prevTab ? 1 : -1
		prevTab = tabIdx
	}
})
const slideMs =
	typeof window !== "undefined" &&
	window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
		? 0
		: 180

/** A swipe on a page goes to the next tab (or the one before). */
function swipeTab(dir: 1 | -1): boolean {
	const to = neighbourPath(currentPath, dir)
	if (!to) return false
	page(to)
	return true
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
			👤 Viewing as <strong>{userProfile.data?.name}</strong> — impersonated by {impersonatedBy.name}
			<button class="stop-impersonating-btn" onclick={handleStopImpersonating}>
				Return to {impersonatedBy.name}
			</button>
		</div>
	{/if}
	<div class="app-shell" class:home={currentPath === "/"}>
		<Hud />
		<div class="acct"><AvatarMenu /></div>
		<Home active={currentPath === "/"} />
		<main
			class="app-content"
			use:swipe={{ left: () => swipeTab(1), right: () => swipeTab(-1) }}
		>
			{#key tabIdx}
			<div class="slide" in:fly={{ x: slideDir * 36, duration: slideMs }}>
			{#if currentPath === "/today"}
				<Today />
			{:else if currentPath === "/rewards"}
				<Rewards />
			{:else if currentPath === "/weight" || currentPath === "/food" || currentPath === "/upgrades"}
				<Progress />
			{:else if currentPath === "/tournaments" || currentPath === "/challenges"}
				<CompeteHub />
			{:else if currentPath === "/social" || currentPath === "/badges"}
				<SocialHub />
			{:else if currentPath === "/hall"}
				<HallOfFame />
			{:else if currentPath === "/settings"}
				<Settings />
			{:else if currentPath === "/admin"}
				<Admin />
			{:else if import.meta.env.DEV && currentPath === "/ui-kit"}
				{#await import("./pages/UiKit.svelte") then { default: UiKit }}
					<UiKit />
				{/await}
			{:else if currentPath === "/content-tuning"}
				{#await import("./pages/ContentTuning.svelte") then { default: ContentTuning }}
					<ContentTuning />
				{/await}
			{/if}
			</div>
			{/key}
			<Toast />
		</main>
		<LevelUp />
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
	position: fixed;
	left: 0;
	right: 0;
	bottom: var(--tab-h);
	z-index: 40;
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
	min-height: 100vh;
	min-height: 100dvh;
	padding-top: var(--hud-h);
	padding-bottom: var(--tab-h);
	box-sizing: border-box;
}

.app-shell.home {
	/* the gym is fixed full screen; nothing scrolls behind it */
	height: 100dvh;
	overflow: hidden;
}

.slide {
	min-height: 1px;
}

.app-content {
	position: relative;
	/* a too-wide page must not widen the phone viewport (the fixed HUD
	   and tab bar would slide off screen) */
	overflow-x: clip;
}

/* account menu (Settings, Admin): top right, under the HUD */
.acct {
	position: fixed;
	top: calc(var(--hud-h) + 6px);
	right: 10px;
	z-index: 29;
}

.acct :global(.avatar-trigger) {
	border-radius: 50%;
	box-shadow: 0 3px 10px rgba(0, 0, 0, 0.25);
}

.acct :global(.ui-avatar) {
	background: #17301f;
	color: #9af0b9;
	box-shadow: 0 0 0 2px #34c973;
}
</style>
