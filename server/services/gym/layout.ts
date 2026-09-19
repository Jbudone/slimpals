export const UPGRADE_LAYOUT: Record<string, { x: number; y: number }> = {
	// Cardio zone — top-left
	cardio_treadmill: { x: 2, y: 2 },
	cardio_rowing: { x: 4, y: 2 },
	cardio_bikes: { x: 6, y: 2 },
	cardio_stairs: { x: 8, y: 2 },
	cardio_cinema: { x: 2, y: 4 },

	// Weights zone — top-right
	weights_dumbbells: { x: 10, y: 2 },
	weights_barbell: { x: 12, y: 2 },
	weights_cable: { x: 14, y: 2 },
	weights_smith: { x: 16, y: 2 },
	weights_olympic: { x: 10, y: 4 },

	// Amenities zone — bottom-left
	amenity_water: { x: 2, y: 8 },
	amenity_lockers: { x: 4, y: 8 },
	amenity_showers: { x: 6, y: 8 },
	amenity_sauna: { x: 8, y: 8 },
	amenity_juice: { x: 2, y: 10 },

	// Decor zone — bottom-right
	decor_posters: { x: 10, y: 8 },
	decor_plants: { x: 12, y: 8 },
	decor_mirrors: { x: 14, y: 8 },
	decor_trophy: { x: 16, y: 8 },
	decor_neon: { x: 10, y: 10 },

	// Staff zone — center
	staff_reception: { x: 6, y: 5 },
	staff_trainer: { x: 8, y: 5 },
	staff_massage: { x: 6, y: 7 },
	staff_physio: { x: 8, y: 7 },
	staff_nutrition: { x: 10, y: 6 },

	// Boxing zone (gh-112) — right-center, clear of every existing zone
	boxing_ring: { x: 14, y: 5 },
	boxing_mitts_station: { x: 16, y: 5 },

	// Lagree zone (gh-113) — right side, below boxing, clear of every zone
	lagree_megaformer: { x: 14, y: 7 },
	lagree_studio_mirror: { x: 16, y: 7 },

	// Swimming zone (gh-114) — left-center, clear of every existing zone
	swimming_lap_pool: { x: 2, y: 6 },
	swimming_poolside_loungers: { x: 4, y: 6 },

	// Punching bags zone (gh-115) — top-center, clear of every existing zone
	punching_bags_heavy_bag_row: { x: 6, y: 4 },
	punching_bags_double_end: { x: 8, y: 4 },

	// Staff growth track (gh-116) — extends the staff zone, clear of every
	// existing zone
	staff_assistant_trainer: { x: 12, y: 6 },
	staff_manager_office: { x: 14, y: 6 },
}
