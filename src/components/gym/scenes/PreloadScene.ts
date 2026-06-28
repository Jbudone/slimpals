import Phaser from "phaser"

const EQUIPMENT_KEYS = [
	"cardio_treadmill",
	"cardio_rowing",
	"cardio_bikes",
	"cardio_stairs",
	"cardio_cinema",
	"weights_dumbbells",
	"weights_barbell",
	"weights_cable",
	"weights_smith",
	"weights_olympic",
	"amenity_water",
	"amenity_lockers",
	"amenity_showers",
	"amenity_sauna",
	"amenity_juice",
	"decor_posters",
	"decor_plants",
	"decor_mirrors",
	"decor_trophy",
	"decor_neon",
	"staff_reception",
	"staff_trainer",
	"staff_massage",
	"staff_physio",
	"staff_nutrition",
]

export const NPC_KEYS = [
	"trainer_marcus",
	"receptionist_lisa",
	"regular_derek",
	"regular_priya",
	"regular_tom",
	"regular_elena",
	"specialist_coach",
	"specialist_nutritionist",
]

export class PreloadScene extends Phaser.Scene {
	constructor() {
		super({ key: "PreloadScene" })
	}

	preload() {
		const base = "/assets/gym"

		this.load.image("floor-tile", `${base}/floor-tile.png`)
		this.load.image("wall-tile", `${base}/wall-tile.png`)
		this.load.image("wall-horizontal", `${base}/wall-horizontal.png`)
		this.load.image("wall-vertical", `${base}/wall-vertical.png`)
		this.load.image("wall-corner", `${base}/wall-corner.png`)
		this.load.image("gym-door", `${base}/gym-door.png`)
		this.load.image("equipment-locked", `${base}/equipment-locked.png`)

		for (const key of EQUIPMENT_KEYS) {
			this.load.image(key, `${base}/${key}.png`)
		}

		for (const key of NPC_KEYS) {
			this.load.image(`npc_${key}`, `${base}/sprites/${key}.png`)
		}

		this.load.image("worker", `${base}/sprites/worker.png`)
	}

	create() {
		this.scene.start("GymScene")
	}
}
