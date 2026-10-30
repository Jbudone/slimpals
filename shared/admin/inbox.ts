// The admin "To do" tab: what Claude is waiting on the owner for, written so
// the next step is obvious. Pure: the server sends counts, this turns them
// into cards (title, numbered steps, what to tell Claude, one button).

export type InboxFacts = {
	/** AI lines waiting for Good / Meh / Bad. */
	candidates: number
	/** Votes still wanted in the latest bake-off round (null = no round). */
	bakeoffVotesLeft: number | null
	/** Story drafts (arc, outlines, scenes) waiting to be approved. */
	storyDrafts: number
	openrouterKey: boolean
}

export type InboxTask = {
	id: string
	/** `waiting` come from live counts and vanish at zero; `check` are manual
	 * checks the owner ticks off once done. */
	kind: "waiting" | "check"
	title: string
	/** Items waiting, for the badge. */
	count?: number
	/** Numbered steps, plain words. */
	steps: string[]
	/** Exactly what to report back to Claude. */
	tell: string
	cta: string
	href: string
	/** Minutes it should take. */
	minutes: number
}

export function buildInbox(f: InboxFacts): InboxTask[] {
	const out: InboxTask[] = []
	if (!f.openrouterKey)
		out.push({
			id: "setup-openrouter",
			kind: "waiting",
			title: "Add the OpenRouter key",
			steps: [
				"Add OPENROUTER_API_KEY to the environment settings (never paste it in chat).",
				"Restart the app, then press Test OpenRouter in the Content tab.",
			],
			tell: "Nothing if the test passes. If it fails, paste only the error text.",
			cta: "Open the Content tab",
			href: "/admin?tab=content",
			minutes: 3,
		})
	if (f.candidates > 0)
		out.push({
			id: "review-queue",
			kind: "waiting",
			title: "Review new AI lines",
			count: f.candidates,
			steps: [
				"Open the queue. Each card is one line or exchange.",
				"Tap Good (use it), Meh (retire it) or Bad (reject it, and tick the tags that say why).",
				"Nothing plays for players until you tap Good.",
			],
			tell: "Nothing needed. Your taps teach the next batch. If many are Bad for the same reason, tell me the reason.",
			cta: "Start reviewing",
			href: "/review",
			minutes: Math.max(2, Math.ceil(f.candidates / 4)),
		})
	if (f.bakeoffVotesLeft !== null && f.bakeoffVotesLeft > 0)
		out.push({
			id: "bakeoff-votes",
			kind: "waiting",
			title: "Vote in the model bake-off",
			count: f.bakeoffVotesLeft,
			steps: [
				"Open the vote page. Two anonymous exchanges appear.",
				"Tap the funnier one, or Tie. Names are hidden on purpose.",
				"About 40 votes pick the model that writes best.",
			],
			tell: "Nothing needed. When the standings show a clear leader, press Use for banter in the Content tab.",
			cta: "Vote now",
			href: "/review?mode=bakeoff",
			minutes: Math.ceil(f.bakeoffVotesLeft / 6),
		})
	if (f.storyDrafts > 0)
		out.push({
			id: "story-drafts",
			kind: "waiting",
			title: "Approve story drafts",
			count: f.storyDrafts,
			steps: [
				"Open the story review and pick a campaign.",
				"Read the arc first. Approve it, or Send back with a note saying what is wrong.",
				"Chapters and scenes only unlock after the step above is approved.",
			],
			tell: "Your Send back note is the feedback; the next draft starts from it.",
			cta: "Open story review",
			href: "/story-review",
			minutes: 10,
		})
	out.push(
		{
			id: "check-pacing",
			kind: "check",
			title: "Play the new pace",
			steps: [
				"Open the gym and check in. Do tasks for a few days (or use Admin > Testing > a test user and Grant XP).",
				"Watch how often a level, a story chapter or new gear arrives.",
				"Note any stretch longer than a week with nothing new.",
			],
			tell: "Say which day or level felt slow, or too fast. Level numbers help ('level 9 took forever').",
			cta: "Open the gym",
			href: "/",
			minutes: 15,
		},
		{
			id: "check-story-pilot",
			kind: "check",
			title: "Read the act-one story rewrite",
			steps: [
				"Open Content Tuning, choose Story Chapters, campaign 1.",
				"Read chapters a1-opening to a1-lease. Compare with the old text if you remember it.",
				"Mark the best and worst line of each chapter.",
			],
			tell: "Paste the worst line and the best line, with the chapter id. Say what makes the bad one bad.",
			cta: "Open Content Tuning",
			href: "/content-tuning",
			minutes: 15,
		},
	)
	return out
}

export const TAB_IDS = [
	"todo",
	"testing",
	"content",
	"game",
	"community",
] as const
export type AdminTab = (typeof TAB_IDS)[number]

export const TAB_LABEL: Record<AdminTab, string> = {
	todo: "To do",
	testing: "Testing",
	content: "Content",
	game: "Game",
	community: "Community",
}

export function tabFromQuery(raw: string | null | undefined): AdminTab {
	return (TAB_IDS as readonly string[]).includes(raw ?? "")
		? (raw as AdminTab)
		: "todo"
}
