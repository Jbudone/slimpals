// A horizontal swipe on a phone, as a Svelte action. A handler returns true
// when it took the swipe (so an outer handler, like the tab swipe, leaves
// it alone). Swipes that start on something that scrolls sideways, an input
// or anything marked data-noswipe never count.

export type SwipeOpts = {
	left?: () => boolean | undefined
	right?: () => boolean | undefined
}

const MIN_DX = 64
const MAX_MS = 700

/** True when the swipe would be fighting something under the finger. */
function blocked(from: Element | null, stop: Element): boolean {
	for (let n: Element | null = from; n && n !== stop; n = n.parentElement) {
		if (!(n instanceof HTMLElement)) continue
		if (n.dataset.noswipe !== undefined) return true
		if (["INPUT", "TEXTAREA", "SELECT"].includes(n.tagName)) return true
		const ox = getComputedStyle(n).overflowX
		if ((ox === "auto" || ox === "scroll") && n.scrollWidth > n.clientWidth + 2)
			return true
	}
	return false
}

/** Pure: is this finger movement a deliberate sideways swipe, and which way
 * (-1 left, 1 right)? */
export function swipeDirection(
	dx: number,
	dy: number,
	ms: number,
): -1 | 1 | null {
	if (ms > MAX_MS || Math.abs(dx) < MIN_DX) return null
	// mostly sideways: a scroll that drifts is not a swipe
	if (Math.abs(dx) < Math.abs(dy) * 2) return null
	return dx < 0 ? -1 : 1
}

type Swiped = TouchEvent & { __swiped?: boolean }

export function swipe(node: HTMLElement, initial: SwipeOpts) {
	let opts = initial
	let x0 = 0
	let y0 = 0
	let t0 = 0
	let live = false
	const start = (e: TouchEvent) => {
		if (e.touches.length !== 1) {
			live = false
			return
		}
		const t = e.touches[0]
		x0 = t.clientX
		y0 = t.clientY
		t0 = Date.now()
		live = !blocked(e.target as Element | null, node)
	}
	const end = (e: TouchEvent) => {
		if (!live) return
		live = false
		const ev = e as Swiped
		if (ev.__swiped) return
		const t = e.changedTouches[0]
		const dir = swipeDirection(t.clientX - x0, t.clientY - y0, Date.now() - t0)
		if (!dir) return
		const took = dir === -1 ? opts.left?.() : opts.right?.()
		if (took) ev.__swiped = true
	}
	node.addEventListener("touchstart", start, { passive: true })
	node.addEventListener("touchend", end, { passive: true })
	return {
		update(next: SwipeOpts) {
			opts = next
		},
		destroy() {
			node.removeEventListener("touchstart", start)
			node.removeEventListener("touchend", end)
		},
	}
}
