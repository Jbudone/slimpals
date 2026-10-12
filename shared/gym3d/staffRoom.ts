// The staff room (#293): once the gym has enough coaches, a short, silly
// cutscene turns up twice a week (Wednesday and Saturday, UTC): the coaches
// get up to something the player was not meant to see. An arc is three
// episodes, one per slot; a missed episode is simply gone (reruns come later).
// Pure: the server reads the coach count and the seen episodes. Same tone as
// the story: dry, warm, nothing about bodies, no exclamation marks.
import type { SPEAKERS } from "./story.js"

export type RoomLine = { who: keyof typeof SPEAKERS; text: string }

export type RoomEpisode = {
	title: string
	lines: readonly RoomLine[]
}

export type RoomArc = {
	id: string
	title: string
	/** Coaches (hires) the gym needs before this arc plays. */
	minHires: number
	episodes: readonly [RoomEpisode, RoomEpisode, RoomEpisode]
}

export const ROOM_ARCS: readonly RoomArc[] = [
	{
		id: "dnd",
		title: "The Dungeon Under Tuesday",
		minHires: 2,
		episodes: [
			{
				title: "Session zero",
				lines: [
					{
						who: "narrator",
						text: "After closing, four coaches lock the staff room door and unfold a map.",
					},
					{
						who: "kim",
						text: "Welcome to session zero. You are in a tavern. Nobody leaves without a drink.",
					},
					{
						who: "marcus",
						text: "I'm a barbarian. His name is Marcus. He counts everything.",
					},
					{
						who: "jordan",
						text: "Rogue. I check everyone's form before I stab them.",
					},
					{
						who: "rivera",
						text: "Cleric. I carry a whistle. It is a holy symbol.",
					},
					{
						who: "kim",
						text: "Noted. The quest board mentions a mimic in a supply closet.",
					},
				],
			},
			{
				title: "The mimic in the closet",
				lines: [
					{
						who: "narrator",
						text: "The party stands before a door marked Supplies. It is breathing.",
					},
					{
						who: "jordan",
						text: "I check the door for traps. Also its form. It's a wall, so that's fine.",
					},
					{ who: "kim", text: "The door is a mimic. Roll to keep your cool." },
					{
						who: "marcus",
						text: "Natural one. Marcus counts the mimic's teeth. Aloud.",
					},
					{
						who: "rivera",
						text: "I blow the whistle. Everyone, the mimic included, takes a water break.",
					},
					{
						who: "kim",
						text: "The mimic respects that. It offers a protein shake and a riddle.",
					},
				],
			},
			{
				title: "Initiative at six",
				lines: [
					{
						who: "alex",
						text: "Sorry to interrupt. The six a.m. class starts in nine minutes.",
					},
					{
						who: "kim",
						text: "We are mid-battle with a very polite mimic.",
					},
					{
						who: "alex",
						text: "I've added the mimic to the schedule. Seven o'clock.",
					},
					{ who: "marcus", text: "Marcus the barbarian accepts the booking." },
					{
						who: "narrator",
						text: "The campaign pauses. It resumes in a staff room you were never shown.",
					},
				],
			},
		],
	},
	{
		id: "lost",
		title: "The Lost-and-Found Mystery",
		minHires: 3,
		episodes: [
			{
				title: "A single glove",
				lines: [
					{
						who: "lisa",
						text: "The lost-and-found box has one glove in it. Nobody remembers the owner.",
					},
					{ who: "derek", text: "Left glove." },
					{
						who: "jordan",
						text: "I'll interview the witnesses. Derek, where were you at six?",
					},
					{ who: "derek", text: "Warming up." },
					{
						who: "marcus",
						text: "That is an alibi. He is always warming up.",
					},
				],
			},
			{
				title: "The suspects",
				lines: [
					{
						who: "jordan",
						text: "Suspect one: Marcus. Motive: he loves tidy equipment.",
					},
					{
						who: "marcus",
						text: "I'm offended. Mildly. I would have left a note.",
					},
					{
						who: "lisa",
						text: "Suspect two: me. Motive: I find things and put them in a box.",
					},
					{
						who: "jordan",
						text: "That is exactly what the box is for. You're cleared.",
					},
					{
						who: "narrator",
						text: "A second glove appears on the bench by the door. Nobody saw it arrive.",
					},
				],
			},
			{
				title: "Case closed",
				lines: [
					{ who: "derek", text: "Found them. Both gloves are mine." },
					{ who: "lisa", text: "Where were they?" },
					{ who: "derek", text: "In my bag. The whole time." },
					{ who: "jordan", text: "So the mystery was Derek's bag." },
					{
						who: "lisa",
						text: "I'm relabelling the box. It now says: ask Derek first.",
					},
					{
						who: "narrator",
						text: "Case closed. The box is still full. Nobody has ever solved the box.",
					},
				],
			},
		],
	},
	{
		id: "fad",
		title: "Fad of the Fortnight",
		minHires: 4,
		episodes: [
			{
				title: "The bucket",
				lines: [
					{
						who: "jordan",
						text: "I've started a cold plunge. It is a bucket. It is in the staff room.",
					},
					{ who: "rivera", text: "That is a mop bucket." },
					{
						who: "jordan",
						text: "It is a premium recovery bucket. I put a sticker on it.",
					},
					{
						who: "alex",
						text: "The sticker is not in the equipment budget. I have logged it anyway.",
					},
					{ who: "marcus", text: "I'll try it. For research." },
				],
			},
			{
				title: "Breathe out",
				lines: [
					{
						who: "rivera",
						text: "The bucket is retired. We do breathwork now.",
					},
					{ who: "jordan", text: "Breathe in for four. Hold for seven." },
					{
						who: "marcus",
						text: "I'm holding. This is the longest I've been quiet in years.",
					},
					{
						who: "alex",
						text: "The six o'clock class wants to know why the staff room is humming.",
					},
					{
						who: "rivera",
						text: "We are not humming. We are exhaling with intent.",
					},
				],
			},
			{
				title: "The next big thing",
				lines: [
					{
						who: "alex",
						text: "Update. Breathwork is out. The new fad is pickling.",
					},
					{ who: "jordan", text: "Barry gave us a jar to start with." },
					{
						who: "rivera",
						text: "It is the pickle from the tin. Do not eat the pickle.",
					},
					{ who: "marcus", text: "I'm eating the pickle." },
					{
						who: "narrator",
						text: "The fad moves on. Another will be along by Wednesday.",
					},
				],
			},
		],
	},
	{
		id: "karaoke",
		title: "Staff Karaoke Night",
		minHires: 2,
		episodes: [
			{
				title: "Sign-up sheet",
				lines: [
					{
						who: "lisa",
						text: "I found a karaoke machine in the lost-and-found. Sign-up sheet is on the desk.",
					},
					{
						who: "marcus",
						text: "I'll do a ballad. A slow one. With counting.",
					},
					{ who: "derek", text: "One word." },
					{
						who: "lisa",
						text: "Derek signed up. He has written the word 'encore'.",
					},
					{
						who: "alex",
						text: "I've scheduled the performances. Derek is last, for reasons of suspense.",
					},
				],
			},
			{
				title: "Rehearsal",
				lines: [
					{
						who: "marcus",
						text: "Verse one. Four bars. Rest. Verse two. Four bars. Rest.",
					},
					{
						who: "kim",
						text: "Marcus, a song is allowed to continue between the rests.",
					},
					{
						who: "marcus",
						text: "The rests are where the feeling lives. I have a spreadsheet.",
					},
					{
						who: "jordan",
						text: "I'm on backing vocals. I am saying the rep count in harmony.",
					},
					{
						who: "narrator",
						text: "Somewhere behind the door, a tambourine is used with confidence.",
					},
				],
			},
			{
				title: "Derek's big moment",
				lines: [
					{
						who: "alex",
						text: "And now, the final act of the evening. Derek.",
					},
					{ who: "derek", text: "..." },
					{ who: "lisa", text: "The whole room is holding its breath." },
					{ who: "derek", text: "Encore." },
					{
						who: "narrator",
						text: "The staff room rises. Nobody can say why. It was extremely good.",
					},
				],
			},
		],
	},
	{
		id: "smoothie",
		title: "The Last Smoothie",
		minHires: 3,
		episodes: [
			{
				title: "One left",
				lines: [
					{
						who: "kim",
						text: "There is one smoothie left in the staff fridge. It has a name on it.",
					},
					{ who: "jordan", text: "The name is smudged. It could be mine." },
					{ who: "rivera", text: "It could be mine. It could be anyone's." },
					{
						who: "alex",
						text: "I'm opening an investigation. Nobody touch the smoothie.",
					},
					{
						who: "marcus",
						text: "I'm not touching it. I'm looking at it closely.",
					},
				],
			},
			{
				title: "The stakeout",
				lines: [
					{
						who: "jordan",
						text: "Night shift. I'm in the supply closet with a flask and a clipboard.",
					},
					{
						who: "rivera",
						text: "I'm in the other supply closet. We have an agreement not to talk.",
					},
					{
						who: "kim",
						text: "The fridge hums. Something rustles. It is Lisa, returning a stapler.",
					},
					{
						who: "narrator",
						text: "The smoothie sits in the dark. It has never been more admired.",
					},
				],
			},
			{
				title: "It was Derek's",
				lines: [
					{ who: "derek", text: "Mine." },
					{
						who: "alex",
						text: "You labelled it four days ago. It is spinach.",
					},
					{ who: "derek", text: "Mine." },
					{
						who: "kim",
						text: "Case closed. Derek gets the smoothie and a long, steady look from everyone.",
					},
					{
						who: "narrator",
						text: "Derek drinks it. It is the best moment of his week.",
					},
				],
			},
		],
	},
	{
		id: "meeting",
		title: "The Meeting That Would Not End",
		minHires: 5,
		episodes: [
			{
				title: "Item one",
				lines: [
					{
						who: "alex",
						text: "Welcome to the staff meeting. There are forty items. Item one is the agenda.",
					},
					{ who: "marcus", text: "Can we skip to the snacks?" },
					{
						who: "alex",
						text: "The snacks are item thirty-eight. Please hold.",
					},
					{
						who: "kim",
						text: "I'd like to add a point. It's about adding points.",
					},
					{
						who: "rivera",
						text: "Noted. We'll discuss it under any other business.",
					},
				],
			},
			{
				title: "Item twenty-two",
				lines: [
					{
						who: "narrator",
						text: "Three hours later, the meeting is on item twenty-two. Lisa has brought a blanket.",
					},
					{ who: "jordan", text: "Item twenty-two is the thermostat." },
					{
						who: "rivera",
						text: "It's always the thermostat. It has been the thermostat since March.",
					},
					{
						who: "lisa",
						text: "I'd like to propose we vote on the thermostat.",
					},
					{ who: "alex", text: "Proposal noted. It becomes item forty-one." },
				],
			},
			{
				title: "Any other business",
				lines: [
					{
						who: "alex",
						text: "We have reached the snacks. There are two crackers.",
					},
					{
						who: "marcus",
						text: "I'd like to split them evenly. With a ruler.",
					},
					{
						who: "kim",
						text: "Marcus. It is two crackers. Just hand them out.",
					},
					{ who: "rivera", text: "Meeting adjourned. Whistle." },
					{
						who: "narrator",
						text: "The meeting ends. The next one begins. Item one is the agenda.",
					},
				],
			},
		],
	},
]

const DAY = 24 * 60 * 60 * 1000
/** Slot days of the week (0 = Sunday): Wednesday and Saturday. */
const SLOT_DAYS = [3, 6] as const
const EPISODES_PER_ARC = 3

/** The fewest coaches any arc needs. */
export const ROOM_MIN_HIRES = Math.min(...ROOM_ARCS.map((a) => a.minHires))

const dayNumber = (d: Date): number => Math.floor(d.getTime() / DAY)

/** Weekday (0 = Sunday) of a UTC day number; 1 Jan 1970 was a Thursday. */
const weekdayOf = (day: number): number => (((day + 4) % 7) + 7) % 7

/** The index of the latest slot on or before `now` (slots are Wed and Sat). */
export function slotIndexAt(now: Date): number {
	const day = dayNumber(now)
	const week = Math.floor((day + 4) / 7)
	const wd = weekdayOf(day)
	let n = week * SLOT_DAYS.length - 1
	for (const s of SLOT_DAYS) if (wd >= s) n += 1
	return n
}

/** The UTC date (YYYY-MM-DD) a slot falls on. */
export function slotDate(index: number): string {
	const week = Math.floor(index / SLOT_DAYS.length)
	const within =
		((index % SLOT_DAYS.length) + SLOT_DAYS.length) % SLOT_DAYS.length
	const day = week * 7 - 4 + SLOT_DAYS[within]
	return new Date(day * DAY).toISOString().slice(0, 10)
}

/** When the slot after the one `now` is in begins. */
export function nextSlotAt(now: Date): Date {
	return new Date(Date.parse(`${slotDate(slotIndexAt(now) + 1)}T00:00:00Z`))
}

/** The arc playing in slot `index` for a gym with `hires` coaches: arcs take
 * turns, three slots each, and an arc the gym cannot staff yet gives way to the
 * next one it can; null when no arc fits yet. */
export function arcForSlot(index: number, hires: number): RoomArc | null {
	const open = ROOM_ARCS.filter((a) => a.minHires <= hires)
	if (!open.length) return null
	const turn = Math.floor(index / EPISODES_PER_ARC)
	return open[((turn % open.length) + open.length) % open.length]
}

export type RoomPending = {
	/** `<arc>.<slot date>.<n>`: unique per slot, the claim key. */
	id: string
	arcId: string
	arcTitle: string
	title: string
	/** Which episode of the arc (1-based) and how many there are. */
	n: number
	of: number
	lines: readonly RoomLine[]
}

/** A seen episode, for the diary (replayable from `episodeById`). */
export type RoomLogEntry = {
	id: string
	arcId: string
	arcTitle: string
	title: string
	n: number
	of: number
}

export type RoomDto = {
	pending: RoomPending | null
	/** The arc playing this slot for this gym (even once seen), or null. */
	arcId: string | null
	/** Episodes seen, newest first (at most `LOG_MAX`). */
	log: RoomLogEntry[]
	/** When the next episode slot opens (ISO). */
	nextAt: string
	/** Coaches still needed before anything plays (0 once something does). */
	needHires: number
}

/** The most seen episodes the diary lists. */
export const LOG_MAX = 30

/** An episode from its id (`<arc>.<slot date>.<n>`): its arc, number and
 * content; null for an id that is not one. Content can be played again. */
export function episodeById(
	id: string,
): { arc: RoomArc; n: number; episode: RoomEpisode } | null {
	const [arcId, date, nText] = id.split(".")
	const arc = ROOM_ARCS.find((a) => a.id === arcId)
	const n = Number(nText)
	if (!arc || !/^\d{4}-\d{2}-\d{2}$/.test(date ?? "")) return null
	if (!Number.isInteger(n) || n < 0 || n >= EPISODES_PER_ARC) return null
	return { arc, n, episode: arc.episodes[n] }
}

/** The diary: the episodes in `seen` that still exist, newest first. */
export function roomLog(seen: readonly string[]): RoomLogEntry[] {
	const rows: RoomLogEntry[] = []
	for (const id of seen) {
		const e = episodeById(id)
		if (!e) continue
		rows.push({
			id,
			arcId: e.arc.id,
			arcTitle: e.arc.title,
			title: e.episode.title,
			n: e.n + 1,
			of: EPISODES_PER_ARC,
		})
	}
	// ids carry their slot date: newest first
	rows.sort((a, b) => b.id.split(".")[1].localeCompare(a.id.split(".")[1]))
	return rows.slice(0, LOG_MAX)
}

/** The episode waiting for a gym with `hires` coaches at `now`, unless it was
 * seen (`seen` holds episode ids). */
export function roomState(
	hires: number,
	seen: readonly string[],
	now: Date,
): RoomDto {
	const nextAt = nextSlotAt(now).toISOString()
	const index = slotIndexAt(now)
	const log = roomLog(seen)
	const arc = arcForSlot(index, hires)
	if (!arc)
		return {
			pending: null,
			arcId: null,
			log,
			nextAt,
			needHires: ROOM_MIN_HIRES - hires,
		}
	const n = ((index % EPISODES_PER_ARC) + EPISODES_PER_ARC) % EPISODES_PER_ARC
	const id = `${arc.id}.${slotDate(index)}.${n}`
	if (seen.includes(id))
		return { pending: null, arcId: arc.id, log, nextAt, needHires: 0 }
	const ep = arc.episodes[n]
	return {
		pending: {
			id,
			arcId: arc.id,
			arcTitle: arc.title,
			title: ep.title,
			n: n + 1,
			of: EPISODES_PER_ARC,
			lines: ep.lines,
		},
		arcId: arc.id,
		log,
		nextAt,
		needHires: 0,
	}
}
