// Reward chips that fly from a ticked task into the HUD (Layout Lab's
// flyChip / burstAt). Pure DOM + Web Animations, one element per chip,
// removed when it lands. Honours prefers-reduced-motion.

import { currentSkin } from "./skin.js"

export type ChipKind = "xp" | "sw" | "gr" | "co" | "st"

const TARGET: Record<ChipKind, string> = {
	xp: "[data-hud=xp]",
	sw: "[data-hud=sweat]",
	gr: "[data-hud=greens]",
	co: "[data-hud=coins]",
	st: "[data-hud=streak]",
}

function calm(): boolean {
	return (
		typeof window !== "undefined" &&
		!!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
	)
}

function layer(): HTMLElement {
	let el = document.getElementById("fly-layer")
	if (!el) {
		el = document.createElement("div")
		el.id = "fly-layer"
		el.setAttribute("aria-hidden", "true")
		document.body.appendChild(el)
	}
	return el
}

/** Bumps a HUD pill (a short scale pop). */
export function bumpHud(kind: ChipKind, shake = false): void {
	const el = document.querySelector<HTMLElement>(TARGET[kind])
	if (!el || calm()) return
	el.animate(
		shake
			? [
					{ transform: "translateX(0)" },
					{ transform: "translateX(-5px)" },
					{ transform: "translateX(5px)" },
					{ transform: "translateX(-3px)" },
					{ transform: "translateX(0)" },
				]
			: [
					{ transform: "scale(1)" },
					{ transform: "scale(1.22)" },
					{ transform: "scale(1)" },
				],
		{ duration: shake ? 380 : 420, easing: "cubic-bezier(.2,1.6,.4,1)" },
	)
}

/** Flies a chip from `from` (viewport px) to its HUD pill; resolves when it
 * lands (or at once when there is no pill to fly to). */
export function flyChip(
	kind: ChipKind,
	html: string,
	from: { x: number; y: number },
	delay = 0,
): Promise<void> {
	const target = document.querySelector<HTMLElement>(TARGET[kind])
	if (!target) return Promise.resolve()
	return new Promise((resolve) => {
		const t = target.getBoundingClientRect()
		const el = document.createElement("div")
		el.className = `fchip ${kind}`
		el.innerHTML = html
		el.style.opacity = "0"
		layer().appendChild(el)
		const w = el.offsetWidth || 50
		const h = el.offsetHeight || 24
		const x0 = from.x - w / 2
		const y0 = from.y - h / 2
		const x1 = t.left + t.width / 2 - w / 2
		const y1 = t.top + t.height / 2 - h / 2
		const cx = (x0 + x1) / 2 + (x0 < x1 ? -40 : 40)
		const cy = Math.min(y0, y1) - 70
		const kf: Keyframe[] = []
		for (let i = 0; i <= 14; i++) {
			const k = i / 14
			const e = k < 0.2 ? 0 : (k - 0.2) / 0.8
			const u = 1 - e
			const x = u * u * x0 + 2 * u * e * cx + e * e * x1
			const y =
				u * u * y0 +
				2 * u * e * cy +
				e * e * y1 -
				(k < 0.2 ? Math.sin((k / 0.2) * (Math.PI / 2)) * 14 : 0)
			const sc = k < 0.2 ? 0.6 + k * 3 : 1.2 - e * 0.65
			kf.push({
				transform: `translate(${x}px,${y}px) scale(${sc})`,
				opacity: k > 0.95 ? 0.2 : 1,
			})
		}
		setTimeout(() => {
			el.style.opacity = ""
			const a = el.animate(kf, {
				duration: calm() ? 250 : 820,
				easing: "cubic-bezier(.45,0,.3,1)",
			})
			a.onfinish = () => {
				el.remove()
				bumpHud(kind)
				resolve()
			}
			a.oncancel = () => {
				el.remove()
				resolve()
			}
		}, delay)
	})
}

/** A little burst of dots where a task was ticked. */
export function burstAt(x: number, y: number, colors: string[]): void {
	if (calm()) return
	const root = layer()
	for (let i = 0; i < 12; i++) {
		const d = document.createElement("i")
		d.className = "burst"
		d.style.background = colors[i % colors.length]
		root.appendChild(d)
		const a = (i / 12) * Math.PI * 2 + Math.random() * 0.3
		const r = 28 + Math.random() * 22
		d.animate(
			[
				{ transform: `translate(${x - 4}px,${y - 4}px) scale(1)`, opacity: 1 },
				{
					transform: `translate(${x - 4 + Math.cos(a) * r}px,${y - 4 + Math.sin(a) * r}px) scale(.2)`,
					opacity: 0,
				},
			],
			{
				duration: 520 + Math.random() * 200,
				easing: "cubic-bezier(.1,.8,.3,1)",
			},
		).onfinish = () => d.remove()
	}
}

/** Confetti over the whole screen (level up). */
export function confetti(n = 60): void {
	if (calm()) return
	const root = layer()
	const { colors: cols, glyph } = currentSkin()
	const H = window.innerHeight
	for (let i = 0; i < n; i++) {
		const c = document.createElement("i")
		c.className = "conf"
		c.style.left = `${Math.random() * 100}%`
		c.style.background = cols[i % cols.length]
		// the look's own glyph (a pumpkin, a snowflake) in every fourth piece
		if (glyph && i % 4 === 0) {
			c.textContent = glyph
			c.style.background = "transparent"
			c.style.width = "auto"
			c.style.height = "auto"
			c.style.fontSize = "18px"
			c.style.lineHeight = "1"
		}
		root.appendChild(c)
		const dx = (Math.random() - 0.5) * 120
		const rot = (Math.random() - 0.5) * 1440
		c.animate(
			[
				{ transform: "translate(0,0) rotate(0)", opacity: 1 },
				{
					transform: `translate(${dx}px,${H * 0.6}px) rotate(${rot / 2}deg)`,
					opacity: 1,
					offset: 0.7,
				},
				{
					transform: `translate(${dx * 1.4}px,${H + 40}px) rotate(${rot}deg)`,
					opacity: 0.6,
				},
			],
			{
				duration: 1600 + Math.random() * 1000,
				delay: Math.random() * 400,
				easing: "cubic-bezier(.3,.1,.6,1)",
			},
		).onfinish = () => c.remove()
	}
}

/** Center of an element in viewport px. */
export function centerOf(el: Element): { x: number; y: number } {
	const r = el.getBoundingClientRect()
	return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
}
