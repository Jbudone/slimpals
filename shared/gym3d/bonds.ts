// Bonds between the named cast (#140): a few exchanges for a pair that works
// out or works beside each other, played when the two stand close. The first
// line is `a`'s, the second `b`'s, then `a` again. Dry, no exclamation marks,
// nothing about bodies.

export type Bond = {
	id: string
	a: string
	b: string
	lines: readonly [string, string] | readonly [string, string, string]
}

export const BONDS: readonly Bond[] = [
	{
		id: "bond-marcus-lisa",
		a: "trainer_marcus",
		b: "receptionist_lisa",
		lines: [
			"Lisa, did the new members sign in?",
			"Three of them. You scared one off with the plank talk.",
			"It was one sentence.",
		],
	},
	{
		id: "bond-marcus-jordan",
		a: "trainer_marcus",
		b: "trainer_jordan",
		lines: [
			"Check their knees on that squat.",
			"Already did. You told me twice yesterday.",
		],
	},
	{
		id: "bond-derek-tom",
		a: "regular_derek",
		b: "regular_tom",
		lines: ["...", "Same time tomorrow?", "(nods)"],
	},
	{
		id: "bond-priya-elena",
		a: "regular_priya",
		b: "regular_elena",
		lines: [
			"I'm trying your stretch routine.",
			"How is it going?",
			"My hamstrings have opinions.",
		],
	},
	{
		id: "bond-kim-lisa",
		a: "specialist_nutritionist",
		b: "receptionist_lisa",
		lines: [
			"Is that the smoothie order I think it is?",
			"Extra spinach. I added it myself.",
		],
	},
	{
		id: "bond-alex-marcus",
		a: "manager_alex",
		b: "trainer_marcus",
		lines: [
			"The schedule has you down for six classes.",
			"Seven. I fixed it.",
			"Of course you did.",
		],
	},
]

/** The bond between two cast members, in either order; null when there is none. */
export function bondBetween(
	x: string | null,
	y: string | null,
	recent: readonly string[] = [],
): Bond | null {
	if (!x || !y) return null
	const found = BONDS.filter(
		(b) => (b.a === x && b.b === y) || (b.a === y && b.b === x),
	)
	return found.find((b) => !recent.includes(b.id)) ?? found[0] ?? null
}
