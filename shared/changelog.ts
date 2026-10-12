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
		id: "2026-10-12-room-arcs",
		date: "2026-10-12",
		title: "More from the staff room",
		items: [
			"Three more staff room stories: Staff Karaoke Night (two coaches), The Last Smoothie (three) and The Meeting That Would Not End (five).",
			"While a story is on, members and passers-by in the gym mention it: the bucket, the die, the smudged smoothie label.",
		],
	},
	{
		id: "2026-10-12-room-diary",
		date: "2026-10-12",
		title: "Replay the staff room",
		items: [
			"The stars card keeps a Staff room diary of every episode you have seen. Tap Replay to watch one again.",
		],
	},
	{
		id: "2026-10-12-staff-room",
		date: "2026-10-12",
		title: "The coaches have a secret staff room",
		items: [
			"Once you have hired two coaches, listen at the staff room door: twice a week (Wednesday and Saturday) a short scene plays over the gym, with a portrait and one line at a time.",
			"A secret D&D campaign, a lost-and-found mystery and a fad of the fortnight take turns, three episodes each. More arcs open as you hire more coaches. A missed episode is gone.",
			"The stars card has a Staff room line that says how many more coaches to hire, or when the next scene is.",
		],
	},
	{
		id: "2026-10-11-whats-new-history",
		date: "2026-10-11",
		title: "What's new keeps its history",
		items: [
			"If you have been away a while, this card now catches you up on a good stretch of updates, with the older ones folded to a title.",
			"Settings has a button that lists everything added so far.",
		],
	},
	{
		id: "2026-10-11-pool-prop",
		date: "2026-10-11",
		title: "Pool gear gets a lifebuoy",
		items: [
			"Upgraded pool gear now has a lifebuoy on a post, gold at the top tier.",
		],
	},
	{
		id: "2026-10-11-story-ferry",
		date: "2026-10-11",
		title: "A new story: the ferry",
		items: [
			"Campaign twelve (Harbour Road, again) has its own story: nine chapters about getting the laid-up harbour ferry back on the water.",
		],
	},
	{
		id: "2026-10-11-story-bell",
		date: "2026-10-11",
		title: "A new story: the bell tower",
		items: [
			"Campaign eleven (Campus Row, again) has its own story: nine chapters about getting the silent campus bell ringing before freshers' week.",
		],
	},
	{
		id: "2026-10-11-pickle-pairs",
		date: "2026-10-11",
		title: "Pickleball is a two-player game now",
		items: [
			"The pickleball net has a player on each side, facing each other, so a staffed court shows a real rally.",
		],
	},
	{
		id: "2026-10-11-tier-props",
		date: "2026-10-11",
		title: "Upgraded gear gets room-specific extras",
		items: [
			"Upgraded boxing gear hangs gloves, recovery gear gets towels, juice gear a glass, court gear a ball, on top of the new screens.",
		],
	},
	{
		id: "2026-10-11-more-bonds",
		date: "2026-10-11",
		title: "More from the regulars",
		items: [
			"Rex and Maya, Coach and Priya, Jordan and Tom, Dr. Kim and Derek, Alex and Elena now have things to say to each other when they stand close.",
		],
	},
	{
		id: "2026-10-11-offline-coins",
		date: "2026-10-11",
		title: "Collect coins without a connection",
		items: [
			"Tapping coin bubbles works offline: the coins show at once and are added for real when you are back online.",
		],
	},
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
	{
		id: "2026-10-09-try-before-buy",
		date: "2026-10-09",
		title: "Try a look before you buy it",
		items: [
			"Customize is a fitting room now: tapping a style, colour or vibe only previews it on the real room. Keep it, or undo.",
			"A vibe is bought once and then yours for good, in any room.",
		],
	},
	{
		id: "2026-10-09-halloween",
		date: "2026-10-09",
		title: "Halloween on the gym floor",
		items: [
			"A friendly ghost floats about the lobby, pranks members at their stations and sometimes talks people into one more set.",
			"Witch hats and jack-o'-lanterns appear, lights flicker out now and then, and there is a daily best-costume prize.",
		],
	},
	{
		id: "2026-10-09-season-look",
		date: "2026-10-09",
		title: "The gym wears the season",
		items: [
			"The whole gym screen gets a seasonal cast and drifting extras: bats and spiders in October, snow in winter, a warm glow in autumn and summer.",
			"The Today drawer wears the look too.",
		],
	},
	{
		id: "2026-10-09-unlock-rail",
		date: "2026-10-09",
		title: "See what unlocks next",
		items: [
			"A small bubble under your avatar shows the next gear you will unlock, with a progress ring. The ones after it stay a surprise.",
			"The level-up screen and the Rewards tab show the same road ahead.",
		],
	},
	{
		id: "2026-10-09-challenge-checks",
		date: "2026-10-09",
		title: "Challenge checks live in your task list",
		items: [
			"Your challenge's daily checks sit in a themed frame inside the Today list, with their own count, so a skipped check never looks like an unfinished task.",
		],
	},
	{
		id: "2026-10-09-skins",
		date: "2026-10-09",
		title: "Every month has its own look",
		items: [
			"The app now wears a look for each month, from New Year to winter, including the level-up confetti and the HUD rings.",
			"Switch it off any time in Settings.",
		],
	},
	{
		id: "2026-10-09-story-one",
		date: "2026-10-09",
		title: "The story of the street gets chapters",
		items: [
			"The first campaign is a proper story: sixteen chapters, one per level, then the Pavement Street Open. A card tells you what happened last time before each chapter.",
			"Finish a story to start a new campaign on a new street, with a Hall of fame page for the ones you have finished.",
		],
	},
	{
		id: "2026-10-04-tabs",
		date: "2026-10-04",
		title: "Four tabs: Gym, Compete, and more",
		items: [
			"Today moved into the gym as a drawer, and Challenges and Tournaments live together under Compete.",
			"Swipe sideways on a page to move between tabs.",
		],
	},
	{
		id: "2026-10-04-rewards-road",
		date: "2026-10-04",
		title: "Rewards you can walk",
		items: [
			"The monthly reward track is a path with a chest on every big day. Taking a step plays a chime (mute it in the stars card) and the rewards fly up to your numbers.",
		],
	},
	{
		id: "2026-10-04-campaigns",
		date: "2026-10-04",
		title: "New streets, new stories",
		items: [
			"After a story ends you can start a new campaign: a new street (Campus Row, Harbour Road, then back round) with its own cast and its own nine-chapter story.",
			"Story guests drop into the gym for a while after their chapter.",
		],
	},
	{
		id: "2026-10-04-seasons-more",
		date: "2026-10-04",
		title: "Spring, summer and autumn at the door",
		items: [
			"Flower pots in April, umbrellas and coolers in summer, hay and pumpkins in the autumn, with coach and member chatter to match.",
		],
	},
	{
		id: "2026-10-04-staff-play",
		date: "2026-10-04",
		title: "Staff, hats and games",
		items: [
			"Hire staff for any room: coaches, lifeguards, therapists and baristas. A staffed boxing or court room hosts sparring and pickup games.",
			"Coach Rivera and Lisa wear your coach's seasonal hat.",
		],
	},
	{
		id: "2026-10-03-challenges",
		date: "2026-10-03",
		title: "Monthly challenges grow up",
		items: [
			"Pick bronze, silver or gold when you join. Milestones at 25, 50, 75 and 100 percent pay coins and more, and finishing earns a decor trophy for your gym.",
			"Some goals count themselves: great meals, check-ins, steps.",
		],
	},
	{
		id: "2026-10-03-street-life",
		date: "2026-10-03",
		title: "The street outside comes alive",
		items: [
			"Cars, a bus stop, passers-by with dogs, a rival gym with weekend promos and a burger shop you can eventually buy out.",
		],
	},
	{
		id: "2026-10-03-coach-voices",
		date: "2026-10-03",
		title: "Your coach has a face and a voice",
		items: [
			"Each coach personality has its own portrait and way of talking, including comments on your challenge and nudges to collect piled-up coins.",
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
