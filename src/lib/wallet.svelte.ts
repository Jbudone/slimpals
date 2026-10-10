// The HUD's numbers (level, XP, coins, Sweat, Greens) shared by every tab.
// The 3D gym pushes its layout's balances here; ticking a task pushes the
// server's answer after the reward chips land.
import { cached, refresh } from "./net/swr.js"

export type Wallet = {
	level: number
	xp: number
	xpIntoLevel: number
	xpForLevel: number
	coins: number
	sweat: number
	greens: number
	pendingUpgrades: { key: string; name: string }[]
}

export const wallet = $state<{ data: Wallet | null }>({ data: null })

/** Level-up celebration waiting to be shown (set when XP crosses a level). */
export const levelUp = $state<{
	level: number | null
	unlocked: string[]
}>({ level: null, unlocked: [] })

/** "Place it in the gym": bumped to ask the Home gym to claim an unlocked
 * upgrade (`key`, else the next one); its build ceremony plays in place. */
export const claimAsk = $state<{ n: number; key: string | null }>({
	n: 0,
	key: null,
})

export async function loadWallet(): Promise<void> {
	// a cold start paints the last known numbers at once; a read right after
	// earning something only ever shows the fresh answer (no step back)
	if (!wallet.data)
		void cached<Wallet>("/gym/wallet").then((c) => {
			if (c && !wallet.data) wallet.data = c
		})
	try {
		wallet.data = await refresh<Wallet>("/gym/wallet")
	} catch {
		// the HUD keeps what it has
	}
}

/** Merges fresh numbers in (a layout, a mission answer). */
export function patchWallet(p: Partial<Wallet>): void {
	if (!wallet.data) return
	wallet.data = { ...wallet.data, ...p }
}

/** Level progress from total XP (same formula as the server's
 * getLevelProgress: level L starts at 50 L² XP). */
export function levelOf(xp: number): {
	level: number
	xpIntoLevel: number
	xpForLevel: number
} {
	const level = Math.floor(Math.sqrt(Math.max(0, xp) / 50))
	const start = level * level * 50
	const next = (level + 1) * (level + 1) * 50
	return { level, xpIntoLevel: xp - start, xpForLevel: next - start }
}

/** Adds XP locally (the chip landed); opens the level-up card when a level
 * is crossed. The server already has it. */
export function addXp(n: number, unlocked: string[] = []): void {
	const w = wallet.data
	if (!w) return
	const xp = Math.max(0, w.xp + n)
	const lv = levelOf(xp)
	if (lv.level > w.level && n > 0) {
		levelUp.level = lv.level
		levelUp.unlocked = unlocked
	}
	wallet.data = { ...w, xp, ...lv }
}
