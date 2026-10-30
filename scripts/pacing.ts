// npm run pacing: simulate players against the real unlock tables and print
// when fun points arrive (docs/pacing.md).
import { CLASS_CATALOG, GYM_UPGRADES } from "../server/db/seed"
import {
	ARCHETYPES,
	arrival,
	buildMilestones,
	medianCurve,
	medianDrought,
	proposeLevelCurve,
	simulate,
	xpOfLevel,
} from "../shared/gym3d/pacing"
import { storyFor } from "../shared/gym3d/story"

const story = storyFor(1).map((b) => ({ id: b.id, level: b.level }))
const maxLevel = 30
const milestones = buildMilestones({
	maxLevel,
	storyLevels: story,
	gear: GYM_UPGRADES.map((g) => ({ key: g.key, requiredXp: g.requiredXp })),
	classes: CLASS_CATALOG.map((c) => ({ key: c.key, requiredXp: c.requiredXp })),
})

const lines: string[] = []
const out = (s = "") => lines.push(s)
const fmt = (n: number) => (Number.isFinite(n) ? String(n) : "never")

for (const a of ARCHETYPES) {
	const runs = simulate(a, { players: 400, days: 400, seed: 7 })
	out(`## ${a.label}`)
	out()
	out("| Level | XP | day p10 | day p50 | day p90 |")
	out("|---|---|---|---|---|")
	for (const l of [2, 4, 6, 8, 10, 12, 14, 16, 17, 20]) {
		const r = arrival(runs, xpOfLevel(l))
		out(
			`| ${l} | ${xpOfLevel(l)} | ${fmt(r.p10)} | ${fmt(r.p50)} | ${fmt(r.p90)} |`,
		)
	}
	out()
	for (const [from, to] of [
		[1, 30],
		[31, 90],
		[91, 200],
		[201, 400],
	] as const) {
		const d = medianDrought(runs, milestones, from, to)
		out(
			`- days ${from}-${to}: longest wait for any fun point ${d.longest} days, ${Math.round(d.weeksWithEvent * 100)}% of weeks have one`,
		)
	}
	out()
	const curve = medianCurve(runs)
	const p = proposeLevelCurve(curve, 400)
	out(
		`Proposed level curve for this player: xp ~ ${p.a.toFixed(1)} x level^${p.p.toFixed(2)} (live: 50 x level^2)`,
	)
	out()
}
console.log(lines.join("\n"))
