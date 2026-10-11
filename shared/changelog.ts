// What changed, in the words a player would use. Newest first. When an update
// moves, renames or removes something a player used (a tab, a menu, a button),
// or adds something they should notice, add an entry here: the app shows each
// entry once, as a "What's new" card, to everyone who has not seen it, so
// nothing changes without a word. `id` is a unique stable string.

export type ChangeEntry = {
	id: string
	/** ISO date the change shipped. */
	date: string
	title: string
	/** Short plain lines: what moved, what is new. */
	items: string[]
}

export const CHANGELOG: readonly ChangeEntry[] = [
	{
		id: "2026-10-11-kitchen-card",
		date: "2026-10-11",
		title: "The Slim Kitchen floats too",
		items: [
			"Tap the kitchen kiosk and its menu opens right over it: stats, menu items, Rush hour and Collect.",
		],
	},
	{
		id: "2026-10-11-more-seasons",
		date: "2026-10-11",
		title: "The gym dresses for every month",
		items: [
			"January gets balloons and presents, February hearts, March clovers and a pot of gold; May, June and September join their neighbours' looks.",
			"The coach and the members have new things to say about each of them.",
		],
	},
	{
		id: "2026-10-11-type-card",
		date: "2026-10-11",
		title: "Choosing a room type floats too",
		items: [
			"When a new plot is ready, what it should become is picked on a card floating over it: tap a type, read what it does, then open the room.",
		],
	},
	{
		id: "2026-10-11-style-fx",
		date: "2026-10-11",
		title: "Room styles come alive",
		items: [
			"Neon rooms throw cyan sparks, Zen rooms drop soft petals, Industrial rooms lift grey dust. Vibes still add their own glow and motes.",
		],
	},
	{
		id: "2026-10-11-in-world",
		date: "2026-10-11",
		title: "Menus float over the gym",
		items: [
			"Tap a room, a machine, an empty pad, a plot for sale or a build site: its menu now floats right over it, so you see what you are changing.",
			"Customize is a small palette in the room's card: Style, Walls, Floor, Vibe, Decor. Try a look first, then keep it.",
			"The app keeps working with a weak connection: ticks, check-ins and mission edits are saved on your device and sent when you are back online.",
		],
	},
	{
		id: "2026-10-10-today-in-gym",
		date: "2026-10-10",
		title: "Today moved into the gym",
		items: [
			"There is no Today tab any more. Pull up the Today drawer at the bottom of the gym: Tasks, Rewards and Coach are the three tabs inside it.",
			"Your month's reward track and what unlocks next are in the drawer's Rewards tab.",
			"Add or edit missions from the Tasks tab.",
			"The gym and the drawer wear the season: Halloween has a purple dusk, a spider and a lights-out scare.",
		],
	},
]

/** The entries a player has not seen: everything newer than `lastSeenId`
 * (all of them when it is null or no longer in the list). */
export function unseenEntries(
	entries: readonly ChangeEntry[],
	lastSeenId: string | null,
): ChangeEntry[] {
	const at = lastSeenId ? entries.findIndex((e) => e.id === lastSeenId) : -1
	return at < 0 ? [...entries] : entries.slice(0, at)
}
