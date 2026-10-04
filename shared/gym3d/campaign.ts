// Campaigns (#188): a gym played start to finish is a campaign. Finishing the
// story lets the player archive it into their Hall of fame and begin the next
// one with a fresh gym. Cosmetics and trophies carry over; coins, staff,
// rooms and levels do not. Pure bits live here.

/** The story chapter whose being seen finishes campaign 1 (each campaign's
 * last chapter finishes it: `storyFinaleOf` in story.ts). */
export const CAMPAIGN_FINALE = "a3-finale"

/** A campaign with no story of its own can be finished from this gym level. */
export const CAMPAIGN_FALLBACK_LEVEL = 17

/** What the Hall of fame keeps of a finished gym. */
export type CampaignSummary = {
	level: number
	xp: number
	plots: number
	pieces: number
	/** Days from the gym's creation to the day it was archived. */
	days: number
}

export type HallEntry = {
	campaign: number
	name: string
	archivedAt: string
	summary: CampaignSummary | null
}

export type CampaignDto = {
	/** The campaign in play (1, 2, ...). */
	campaign: number
	/** The story is done: the next campaign can begin. */
	canFinish: boolean
	/** Finished campaigns, oldest first. */
	hall: HallEntry[]
}

/** Whole days between two dates (never negative). */
export function daysBetween(from: Date, to: Date): number {
	return Math.max(0, Math.floor((to.getTime() - from.getTime()) / 86_400_000))
}
