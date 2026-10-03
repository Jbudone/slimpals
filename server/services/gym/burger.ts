// Buying the Burger Baron (#131): once the gym has 4 stars it is for sale;
// the purchase is claimed in `gym_rewards` (`burger:bought`, once per gym)
// and charged under the gym row lock in the same transaction.
import { BURGER, BURGER_SOURCE } from "../../../shared/gym3d/burger.js"
import { gymRewards } from "../../db/schema.js"
import { BuildError, spend, withGym } from "./build3d.js"
import { type Db, getGymLayoutDto } from "./layout3dStore.js"

export async function buyBurgerBaron(db: Db, gymId: number): Promise<void> {
	const { burger } = await getGymLayoutDto(gymId, db)
	if (burger.state === "bought")
		throw new BuildError(409, "The Burger Baron is already yours")
	if (burger.state !== "forSale")
		throw new BuildError(
			409,
			`The Burger Baron goes on sale at ${BURGER.stars} stars`,
		)
	await withGym(db, gymId, async (tx, gym) => {
		const [claim] = await tx
			.insert(gymRewards)
			.ignore()
			.values({ gymId, source: BURGER_SOURCE, sweat: 0, greens: 0 })
		if (!claim.affectedRows)
			throw new BuildError(409, "The Burger Baron is already yours")
		await spend(tx, gym, BURGER.cost)
	})
}
