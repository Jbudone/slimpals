// The queue's state as reactive state for the screen (NetBanner).
import { type NetState, onNetState } from "./queue.js"

export const netStatus = $state<NetState>({
	pending: 0,
	flushing: false,
	trouble: false,
	caughtUp: false,
})

onNetState((s) => Object.assign(netStatus, s))
