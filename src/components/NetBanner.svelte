<script lang="ts">
// The only place a flaky connection shows: a slim pill under the HUD, and
// only once it has been a real problem for a few seconds (offline, or
// changes still waiting). A quick blip never shows; coming back shows a
// short "caught up".
import { netStatus as netState } from "../lib/net/netStatus.svelte.js"

const text = $derived(
	netState.caughtUp
		? "Back online. All caught up."
		: netState.pending > 0
			? `Offline. ${netState.pending} change${netState.pending === 1 ? "" : "s"} saved on this device.`
			: "No connection. Your taps are saved here.",
)
const show = $derived(netState.trouble || netState.caughtUp)
</script>

{#if show}
	<div
		class="netbanner"
		class:ok={netState.caughtUp && !netState.trouble}
		role="status"
		data-testid="net-banner"
	>
		<i aria-hidden="true"></i>{text}
	</div>
{/if}

<style>
.netbanner {
	position: fixed;
	left: 50%;
	top: calc(env(safe-area-inset-top, 0px) + 66px);
	transform: translateX(-50%);
	z-index: 33;
	display: inline-flex;
	align-items: center;
	gap: 7px;
	max-width: calc(100% - 24px);
	padding: 4px 12px 4px 9px;
	border-radius: 99px;
	background: rgba(60, 40, 10, 0.92);
	color: #ffe9b8;
	font: 700 12px/1.3 system-ui, sans-serif;
	box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
	pointer-events: none;
	animation: nb-in 0.25s ease-out;
}

.netbanner i {
	width: 8px;
	height: 8px;
	border-radius: 50%;
	background: #ffb020;
	animation: nb-pulse 1.4s ease-in-out infinite;
}

.netbanner.ok {
	background: rgba(20, 70, 40, 0.94);
	color: #d9ffe6;
}

.netbanner.ok i {
	background: #34c973;
	animation: none;
}

@keyframes nb-in {
	from {
		opacity: 0;
		transform: translate(-50%, -6px);
	}
}

@keyframes nb-pulse {
	50% {
		opacity: 0.35;
	}
}

@media (prefers-reduced-motion: reduce) {
	.netbanner,
	.netbanner i {
		animation: none;
	}
}
</style>
