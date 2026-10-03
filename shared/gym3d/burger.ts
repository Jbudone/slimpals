// The Burger Baron across the street (#131): at 4 stars the gym is the best
// in town and the Baron goes on sale ("Burger Baron is downsizing!"). The
// player can buy it for coins, once; then it shrinks to "BURGER BARON Jr.".
// Pure: when it is for sale and what the sign says.
export const BURGER = { stars: 4, cost: 1000 } as const

/** gym_rewards source written when it is bought (once per gym). */
export const BURGER_SOURCE = "burger:bought"

export type BurgerState = "closed" | "forSale" | "bought"

export function burgerState(stars: number, bought: boolean): BurgerState {
	if (bought) return "bought"
	return stars >= BURGER.stars ? "forSale" : "closed"
}

/** What the billboard says in each state. */
export const BURGER_SIGN: Readonly<Record<BurgerState, string>> = {
	closed: "BURGER BARON",
	forSale: "FOR SALE",
	bought: "BARON Jr.",
}
