// The named cast of the 3D gym, in one data file: how each NPC looks (built
// on the shared outfit system: tees, tattoos, accessories, hair, builds), the
// title shown in their name chip, the station they call home, and a few
// signature lines for speech bubbles. Staff roles wear the staff uniform.
// Pure data (no three.js), so tests can check it against the seed.
import type { PoseName } from "../world/types"
import {
	type Outfit,
	STAFF_UNIFORM,
	seededOutfit,
	type TeeKind,
} from "./outfits"

export type CastEntry = {
	/** Short name (the roster's full name wins where it is known). */
	name: string
	/** Shown under the name in the tap chip. */
	title: string
	/** Wears the staff uniform. */
	staff: boolean
	look: Outfit
	/** A station they go to: `always` wins over the sim's pick (heroes on
	 * the spotlight stage, the manager in the office); otherwise only when
	 * the sim gives them nothing or staff work. */
	home?: { key: string; always?: boolean; pose?: PoseName }
	/** Signature lines (from their personality quirks) for speech bubbles. */
	lines: readonly string[]
}

const base = (o: Partial<Outfit>): Outfit => ({
	skin: "#e8b48e",
	hair: "#2c1f1b",
	style: "short",
	top: "#3aa89a",
	bottom: "#2c2f36",
	shoes: "#ffffff",
	sleeves: true,
	shorts: false,
	band: null,
	build: "avg",
	beard: false,
	lashes: false,
	tee: null,
	tats: [],
	acc: [],
	freckles: false,
	...o,
})

/** Staff look: the uniform colours plus the STAFF print, with personal
 * touches (hair, build, accessories, tattoos) from `o`. */
const staff = (o: Partial<Outfit>, tee: TeeKind = "staff"): Outfit =>
	base({
		top: STAFF_UNIFORM.top,
		bottom: STAFF_UNIFORM.bottom,
		tee,
		...o,
	})

/** Every seeded NPC (server/db/seed.ts), keyed by NPC key. */
export const CAST: Readonly<Record<string, CastEntry>> = {
	trainer_marcus: {
		name: "Marcus",
		title: "Head trainer",
		staff: true,
		look: staff({
			skin: "#9a633f",
			hair: "#2c1f1b",
			style: "buzz",
			build: "strong",
			sleeves: false,
			shorts: true,
			band: "#f2c14a",
			beard: true,
			acc: ["wristband"],
			tats: [{ k: "band", w: "armR" }],
		}),
		lines: [
			"Eight... nine... TEN! Nice.",
			"Nobody hogs the rack on my watch.",
			"Chest up. Brace. Go.",
			"Form first, then weight.",
		],
	},
	receptionist_lisa: {
		name: "Lisa",
		// fresh look (the old pixel Lisa was retired): space buns, freckles,
		// a big smile and a front-desk headset
		title: "Front desk",
		staff: true,
		look: staff({
			skin: "#e8b48e",
			hair: "#c9573a",
			style: "buns",
			band: "#f2c14a",
			lashes: true,
			freckles: true,
			shoes: "#e8743b",
			acc: ["headset", "earrings"],
		}),
		home: { key: "staff_reception" },
		lines: [
			"Hi hi! Welcome in!",
			"I never forget a name. Or a smoothie order.",
			"Psst... the sauna gossip today is wild.",
			"Fresh towels by the lockers!",
		],
	},
	regular_derek: {
		name: "Derek",
		title: "Regular",
		staff: false,
		look: base({
			skin: "#e8b48e",
			hair: "#5a3a26",
			style: "short",
			top: "#2c2f36",
			bottom: "#5a5f6a",
			build: "strong",
			sleeves: false,
			shorts: true,
			tee: "swole",
			tats: [
				{ k: "sleeve", w: "upR" },
				{ k: "sleeve", w: "armR" },
			],
		}),
		lines: ["...", "One more set.", "Cardio? No thanks.", "(nods)"],
	},
	regular_priya: {
		name: "Priya",
		title: "Regular",
		staff: false,
		look: base({
			skin: "#c98a5e",
			hair: "#2c1f1b",
			style: "long",
			top: "#9b6bc4",
			bottom: "#2c2f36",
			build: "fit",
			lashes: true,
			tee: "sunset",
			acc: ["earrings"],
		}),
		lines: [
			"Breathe in... and out.",
			"Right on time, as always.",
			"Oh, you're new? Welcome!",
			"Sauna, then a stretch. Perfect.",
		],
	},
	regular_tom: {
		name: "Tom",
		title: "Regular",
		staff: false,
		look: base({
			skin: "#f6d2b4",
			hair: "#c9573a",
			style: "cap",
			band: "#4a78c8",
			top: "#f2c14a",
			bottom: "#3a4a6a",
			build: "soft",
			beard: true,
			shorts: true,
			tee: "lift",
		}),
		lines: [
			"Check out these gains!",
			"HUUURGH!",
			"Mirror check. Still huge.",
			"Leg day? Next week.",
		],
	},
	regular_elena: {
		name: "Elena",
		title: "Regular",
		staff: false,
		look: base({
			skin: "#e8b48e",
			hair: "#e8c46a",
			style: "bun",
			top: "#d4463a",
			bottom: "#2c2f36",
			lashes: true,
			sleeves: false,
			shorts: true,
			band: "#3aa89a",
			tee: "num",
			acc: ["socks", "wristband"],
		}),
		lines: [
			"Just a quick 10k.",
			"That treadmill is MY treadmill.",
			"Personal best incoming.",
			"Morning.",
		],
	},
	specialist_coach: {
		name: "Coach Rivera",
		title: "Group coach",
		staff: true,
		look: staff({
			skin: "#6e4428",
			style: "bald",
			build: "fit",
			beard: true,
			hair: "#2c1f1b",
			shorts: true,
			acc: ["whistle", "shades"],
		}),
		lines: [
			"Let's go, champ!",
			"Hustle! (whistle)",
			"Team spirit, people!",
			"Nice work, champ.",
		],
	},
	specialist_nutritionist: {
		name: "Dr. Kim",
		title: "Nutritionist",
		staff: true,
		look: staff({
			skin: "#f6d2b4",
			hair: "#1f2a44",
			style: "pony",
			band: "#9b6bc4",
			lashes: true,
			shoes: "#9b6bc4",
			acc: ["glasses", "lanyard"],
		}),
		lines: [
			"Protein beats timing, every time.",
			"Snack? I brought almonds.",
			"How's your food log looking?",
			"Hydrate!",
		],
	},
	trainer_jordan: {
		name: "Jordan",
		title: "Assistant trainer",
		staff: true,
		look: staff({
			skin: "#c98a5e",
			hair: "#2c1f1b",
			style: "curly",
			build: "fit",
			shorts: true,
			band: "#e8743b",
			acc: ["wristband", "socks"],
		}),
		home: { key: "staff_assistant_trainer" },
		lines: [
			"Watch me first, then you try.",
			"Great progress. It's on my clipboard.",
			"Small steps add up.",
			"I've got this one, Marcus.",
		],
	},
	manager_alex: {
		name: "Alex",
		title: "Gym manager",
		staff: true,
		look: staff({
			skin: "#e8b48e",
			hair: "#5a3a26",
			style: "short",
			shoes: "#2c2f36",
			acc: ["glasses", "lanyard"],
		}),
		home: { key: "staff_manager_office", always: true },
		lines: [
			"Just checking in with every department.",
			"Memberships are up this week!",
			"Clipboard says we're on track.",
			"Smooth running today.",
		],
	},
	hero_bodybuilder_rex: {
		name: "Rex",
		title: "Visiting hero",
		staff: false,
		look: base({
			skin: "#c98a5e",
			style: "bald",
			top: "#d4463a",
			bottom: "#2c2f36",
			build: "strong",
			sleeves: false,
			shorts: true,
			beard: true,
			hair: "#2c1f1b",
			tee: "titan",
			acc: ["shades", "chain"],
			tats: [
				{ k: "anchor", w: "armL" },
				{ k: "sleeve", w: "upR" },
			],
		}),
		home: { key: "hero_spotlight_stage", always: true, pose: "flex" },
		lines: [
			"Behold... THE TITAN!",
			"Want an autograph?",
			"Ask me about my program!",
			"Flex with me!",
		],
	},
	hero_influencer_maya: {
		name: "Maya",
		title: "Visiting hero",
		staff: false,
		look: base({
			skin: "#e8b48e",
			hair: "#e8c46a",
			style: "long",
			top: "#ff6fae",
			bottom: "#ffffff",
			shoes: "#ff6fae",
			build: "fit",
			lashes: true,
			sleeves: false,
			tee: "sparks",
			band: "#ff6fae",
			acc: ["headphones", "earrings"],
		}),
		home: { key: "hero_spotlight_stage", always: true, pose: "coach" },
		lines: [
			"Wave for the reel!",
			"Hey besties!",
			"This lighting is everything.",
			"Link in bio!",
		],
	},
}

/** The fixed look of a named NPC (a copy), or a seeded one for NPCs added
 * after this file (never breaks, just not hand-styled). */
export function outfitFor(npcKey: string): Outfit {
	const c = CAST[npcKey]
	return c ? structuredClone(c.look) : seededOutfit(npcKey)
}

/** Stations named NPCs call home, by NPC key. */
export function castHomes(): Record<string, { key: string; always?: boolean }> {
	const out: Record<string, { key: string; always?: boolean }> = {}
	for (const [k, c] of Object.entries(CAST))
		if (c.home) out[k] = { key: c.home.key, always: c.home.always }
	return out
}

/** Upgrade keys whose stations are kept for their named NPC (no anonymous
 * staff fills them). */
export const RESERVED_STATIONS: ReadonlySet<string> = new Set([
	"staff_manager_office",
])
