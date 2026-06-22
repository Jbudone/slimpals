import fs from "node:fs"
import path from "node:path"
import { GoogleGenerativeAI } from "@google/generative-ai"

const OUT_DIR = path.resolve(import.meta.dirname, "../public/assets/gym")

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ?? "")

type AssetSpec = {
	filename: string
	prompt: string
}

const TILE_ASSETS: AssetSpec[] = [
	{
		filename: "floor-tile.png",
		prompt:
			"Pixel art, top-down view, Stardew Valley style, gym floor tile, wood/rubber texture, 32x32 pixels, warm color palette, seamless tileable pattern, no border",
	},
	{
		filename: "wall-tile.png",
		prompt:
			"Pixel art, top-down view, Stardew Valley style, gym wall tile, brick/concrete texture, 32x32 pixels, warm color palette, seamless tileable pattern",
	},
	{
		filename: "wall-horizontal.png",
		prompt:
			"Pixel art, top-down view, Stardew Valley style, horizontal gym wall segment, brick/concrete, 32x32 pixels, warm color palette",
	},
	{
		filename: "wall-vertical.png",
		prompt:
			"Pixel art, top-down view, Stardew Valley style, vertical gym wall segment, brick/concrete, 32x32 pixels, warm color palette",
	},
	{
		filename: "wall-corner.png",
		prompt:
			"Pixel art, top-down view, Stardew Valley style, gym wall corner piece, brick/concrete, 32x32 pixels, warm color palette",
	},
	{
		filename: "gym-door.png",
		prompt:
			"Pixel art, top-down view, Stardew Valley style, gym entrance door, wooden double door, 64x32 pixels, warm color palette",
	},
	{
		filename: "equipment-locked.png",
		prompt:
			"Pixel art, top-down view, Stardew Valley style, grey silhouette of gym equipment, ghostly/translucent, lock icon overlay, 64x64 pixels, muted grey palette",
	},
]

const EQUIPMENT_KEYS = [
	{ key: "cardio_treadmill", name: "treadmill" },
	{ key: "cardio_rowing", name: "rowing machine" },
	{ key: "cardio_bikes", name: "stationary bike" },
	{ key: "cardio_stairs", name: "stair climber machine" },
	{ key: "cardio_cinema", name: "treadmill with screen" },
	{ key: "weights_dumbbells", name: "dumbbell rack" },
	{ key: "weights_barbell", name: "barbell bench press" },
	{ key: "weights_cable", name: "cable crossover machine" },
	{ key: "weights_smith", name: "smith machine" },
	{ key: "weights_olympic", name: "olympic lifting platform" },
	{ key: "amenity_water", name: "water cooler dispenser" },
	{ key: "amenity_lockers", name: "gym lockers" },
	{ key: "amenity_showers", name: "shower room entrance" },
	{ key: "amenity_sauna", name: "wooden sauna room" },
	{ key: "amenity_juice", name: "juice bar counter with blender" },
	{ key: "decor_posters", name: "motivational poster on wall" },
	{ key: "decor_plants", name: "potted plant" },
	{ key: "decor_mirrors", name: "large wall mirror" },
	{ key: "decor_trophy", name: "glass trophy display case" },
	{ key: "decor_neon", name: "neon gym sign glowing" },
	{ key: "staff_reception", name: "reception desk" },
	{ key: "staff_trainer", name: "personal trainer corner with clipboard" },
	{ key: "staff_massage", name: "massage chair" },
	{ key: "staff_physio", name: "physical therapy room" },
	{ key: "staff_nutrition", name: "nutrition advice desk" },
]

const EQUIPMENT_ASSETS: AssetSpec[] = EQUIPMENT_KEYS.map(({ key, name }) => ({
	filename: `${key}.png`,
	prompt: `Pixel art, top-down view, Stardew Valley style, ${name} gym equipment, 64x64 pixels, transparent background, warm color palette`,
}))

const NPC_SPRITES: AssetSpec[] = [
	{
		filename: "sprites/trainer_marcus.png",
		prompt:
			"Pixel art, top-down view, Stardew Valley style, single character sprite, muscular male gym trainer, tank top, facing down, 64x64 pixels, transparent background, warm color palette",
	},
	{
		filename: "sprites/receptionist_lisa.png",
		prompt:
			"Pixel art, top-down view, Stardew Valley style, single character sprite, friendly female receptionist, gym polo shirt, facing down, 64x64 pixels, transparent background, warm color palette",
	},
	{
		filename: "sprites/regular_derek.png",
		prompt:
			"Pixel art, top-down view, Stardew Valley style, single character sprite, quiet serious male powerlifter, sleeveless hoodie, facing down, 64x64 pixels, transparent background, warm color palette",
	},
	{
		filename: "sprites/regular_priya.png",
		prompt:
			"Pixel art, top-down view, Stardew Valley style, single character sprite, calm female yoga enthusiast, yoga outfit, facing down, 64x64 pixels, transparent background, warm color palette",
	},
	{
		filename: "sprites/regular_tom.png",
		prompt:
			"Pixel art, top-down view, Stardew Valley style, single character sprite, loud enthusiastic male gym bro, muscle shirt, facing down, 64x64 pixels, transparent background, warm color palette",
	},
	{
		filename: "sprites/regular_elena.png",
		prompt:
			"Pixel art, top-down view, Stardew Valley style, single character sprite, disciplined female runner, running outfit, facing down, 64x64 pixels, transparent background, warm color palette",
	},
	{
		filename: "sprites/specialist_coach.png",
		prompt:
			"Pixel art, top-down view, Stardew Valley style, single character sprite, authoritative male sports coach, tracksuit with whistle, facing down, 64x64 pixels, transparent background, warm color palette",
	},
	{
		filename: "sprites/specialist_nutritionist.png",
		prompt:
			"Pixel art, top-down view, Stardew Valley style, single character sprite, caring female nutritionist, lab coat, facing down, 64x64 pixels, transparent background, warm color palette",
	},
]

const ANIM_SPRITES: AssetSpec[] = [
	{
		filename: "sprites/anim-treadmill-run.png",
		prompt:
			"Pixel art sprite sheet, top-down view, Stardew Valley style, character running on treadmill, 4 frames of running animation, 32x32 per frame, 128x32 total image, transparent background",
	},
	{
		filename: "sprites/anim-barbell-lift.png",
		prompt:
			"Pixel art sprite sheet, top-down view, Stardew Valley style, character lifting barbell, 4 frames of lifting animation, 32x32 per frame, 128x32 total image, transparent background",
	},
	{
		filename: "sprites/anim-bike-pedal.png",
		prompt:
			"Pixel art sprite sheet, top-down view, Stardew Valley style, character pedaling stationary bike, 4 frames of pedaling animation, 32x32 per frame, 128x32 total image, transparent background",
	},
	{
		filename: "sprites/anim-stretch.png",
		prompt:
			"Pixel art sprite sheet, top-down view, Stardew Valley style, character stretching on floor, 4 frames of stretching animation, 32x32 per frame, 128x32 total image, transparent background",
	},
]

const ALL_ASSETS = [
	...TILE_ASSETS,
	...EQUIPMENT_ASSETS,
	...NPC_SPRITES,
	...ANIM_SPRITES,
]

async function generateImage(spec: AssetSpec): Promise<void> {
	const outPath = path.join(OUT_DIR, spec.filename)
	fs.mkdirSync(path.dirname(outPath), { recursive: true })
	if (fs.existsSync(outPath)) {
		console.log(`  SKIP ${spec.filename} (already exists)`)
		return
	}

	console.log(`  GENERATING ${spec.filename}...`)

	const model = genAI.getGenerativeModel({
		model: "gemini-2.5-flash-image",
	})

	const result = await model.generateContent({
		contents: [{ role: "user", parts: [{ text: spec.prompt }] }],
		generationConfig: {
			// @ts-expect-error -- responseModalities is valid but not in the type defs yet
			responseModalities: ["IMAGE", "TEXT"],
		},
	})

	const response = result.response
	const parts = response.candidates?.[0]?.content?.parts ?? []

	for (const part of parts) {
		if (part.inlineData?.mimeType?.startsWith("image/")) {
			const buf = Buffer.from(part.inlineData.data ?? "", "base64")
			fs.writeFileSync(outPath, buf)
			console.log(`  SAVED ${spec.filename} (${buf.length} bytes)`)
			return
		}
	}

	console.error(`  FAILED ${spec.filename}: no image data in response`)
}

async function main() {
	fs.mkdirSync(OUT_DIR, { recursive: true })

	console.log(`Generating ${ALL_ASSETS.length} gym assets to ${OUT_DIR}...\n`)

	for (const spec of ALL_ASSETS) {
		try {
			await generateImage(spec)
		} catch (err) {
			console.error(
				`  ERROR ${spec.filename}: ${err instanceof Error ? err.message : err}`,
			)
		}
	}

	console.log("\nDone!")
}

main()
