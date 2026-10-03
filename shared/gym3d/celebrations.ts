// What an NPC says when an upgrade is claimed, shared by the 2D and 3D gyms.
export const UPGRADE_CELEBRATIONS: Readonly<Record<string, string>> = {
	cardio_treadmill: "Finally a treadmill! Cardio just got way more fun.",
	cardio_rowing: "A rowing machine! Full body workout unlocked.",
	cardio_bikes: "Stationary bikes! Great for the morning rush.",
	cardio_stairs: "Stair climber! Legs are gonna love this.",
	cardio_cinema: "Treadmill with screens? Run AND watch shows. Perfect.",
	weights_dumbbells: "Dumbbells! Every gym needs these. Classic.",
	weights_barbell: "A barbell station! Now we're serious.",
	weights_cable: "Cable crossover machine! So many exercises with this one.",
	weights_smith: "Smith machine! Great for solo heavy lifting.",
	weights_olympic: "Olympic platform! This gym means business.",
	amenity_water: "Water cooler! Hydration is everything.",
	amenity_lockers: "Lockers! No more leaving stuff on the floor.",
	amenity_showers: "Showers! Now members can stay for longer sessions.",
	amenity_sauna: "Finally a sauna! Recovery is about to get real good.",
	amenity_juice: "Juice bar! Post-workout nutrition sorted.",
	decor_posters: "Motivational posters! Eyes on the prize.",
	decor_plants: "Plants make everything better. Nice touch!",
	decor_mirrors: "Mirrors everywhere! Check that form!",
	decor_trophy: "Trophy case! Time to start winning those.",
	decor_neon: "That neon sign looks amazing. Gym's got a vibe now.",
	staff_reception: "Front desk is set! First impressions matter.",
	staff_trainer: "Personal trainer corner! Expert guidance on site.",
	staff_massage: "Massage chair! Recovery just leveled up.",
	staff_physio: "Physical therapy room! Injuries handled right here.",
	staff_nutrition: "Nutrition desk! Diet is half the battle.",
	court_hoop: "A basketball hoop! Pickup games start now.",
	court_pickle: "A pickleball net! Dink responsibly.",
	boxing_ring: "A boxing ring! Time to step in and spar.",
	boxing_mitts_station: "Focus mitts station! Sharpen those combos.",
	lagree_megaformer:
		"A megaformer! Lagree classes are officially a thing here.",
	lagree_studio_mirror: "Studio mirror wall! Form checks just got easier.",
	swimming_lap_pool: "A lap pool! Swimming is officially part of the gym now.",
	swimming_poolside_loungers: "Poolside loungers! Post-swim relaxation sorted.",
	punching_bags_heavy_bag_row: "A row of heavy bags! Time to hit hard.",
	punching_bags_double_end:
		"Double-end bag! Speed and accuracy training unlocked.",
	staff_assistant_trainer:
		"A second trainer station! More hands to help members.",
	staff_manager_office: "A manager's office! The gym is really growing up.",
	staff_ownership_suite:
		"The ownership suite! This isn't just a gym anymore — it's a business.",
	hero_spotlight_stage:
		"A spotlight stage! Word's getting out — hero trainers might start dropping by.",
}

export const DEFAULT_CELEBRATION = "New equipment! This is awesome!"

export function celebrationFor(upgradeKey: string): string {
	return UPGRADE_CELEBRATIONS[upgradeKey] ?? DEFAULT_CELEBRATION
}
