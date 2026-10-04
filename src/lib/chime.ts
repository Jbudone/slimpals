// A short synthesized chime (no audio assets). Plays only after a user gesture
// (the browser enforces it), stays silent under reduced motion and never throws.

/** Frequencies of the notes, in order (a rising major arpeggio). */
export const CLAIM_NOTES: readonly number[] = [523.25, 659.25, 783.99]

/** Start offsets in seconds for `n` notes, `gap` apart. */
export function noteTimes(n: number, gap = 0.09): number[] {
	return Array.from({ length: n }, (_, i) => i * gap)
}

const KEY = "sp-sound"

/** Sound is on unless the player turned it off (kept in this browser only). */
export function soundOn(): boolean {
	try {
		return localStorage.getItem(KEY) !== "off"
	} catch {
		return true
	}
}

export function setSound(on: boolean): void {
	try {
		localStorage.setItem(KEY, on ? "on" : "off")
	} catch {
		// not remembered, still works for this visit
	}
}

export function playClaimChime(): void {
	try {
		if (!soundOn()) return
		if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return
		const Ctx =
			window.AudioContext ??
			(window as unknown as { webkitAudioContext?: typeof AudioContext })
				.webkitAudioContext
		if (!Ctx) return
		const ctx = new Ctx()
		const times = noteTimes(CLAIM_NOTES.length)
		CLAIM_NOTES.forEach((f, i) => {
			const t0 = ctx.currentTime + times[i]
			const osc = ctx.createOscillator()
			const gain = ctx.createGain()
			osc.type = "sine"
			osc.frequency.value = f
			gain.gain.setValueAtTime(0.0001, t0)
			gain.gain.exponentialRampToValueAtTime(0.12, t0 + 0.02)
			gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.35)
			osc.connect(gain).connect(ctx.destination)
			osc.start(t0)
			osc.stop(t0 + 0.4)
		})
		setTimeout(() => void ctx.close().catch(() => {}), 1000)
	} catch {
		// no sound is fine
	}
}
