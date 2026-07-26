import Phaser from "phaser"
import { deriveEquipmentAnimConfigs } from "../equipmentAnimations.js"
import { NpcSprite, type NpcState } from "../NpcSprite.js"

const TILE = 32
const GRID_W = 20
const GRID_H = 15
const EQUIP_SIZE = 64
const POLL_INTERVAL = 30_000
const DOOR_TILE = { x: 10, y: 14 }

type UpgradeInfo = {
	key: string
	name: string
	category: string
	placementData?: { x: number; y: number } | null
}

type LockedInfo = {
	key: string
	name: string
	category: string
	requiredXp: number
}

export type GymSceneData = {
	unlocked: UpgradeInfo[]
	locked: LockedInfo[]
}

const CATEGORY_ZONES: Record<string, { startX: number; startY: number }> = {
	cardio: { startX: 2, startY: 2 },
	weights: { startX: 10, startY: 2 },
	amenities: { startX: 2, startY: 8 },
	decor: { startX: 10, startY: 8 },
	staff: { startX: 6, startY: 5 },
}

// Must match server/services/gym/layout.ts
const UPGRADE_LAYOUT: Record<string, { x: number; y: number }> = {
	cardio_treadmill: { x: 2, y: 2 },
	cardio_rowing: { x: 4, y: 2 },
	cardio_bikes: { x: 6, y: 2 },
	cardio_stairs: { x: 8, y: 2 },
	cardio_cinema: { x: 2, y: 4 },
	weights_dumbbells: { x: 10, y: 2 },
	weights_barbell: { x: 12, y: 2 },
	weights_cable: { x: 14, y: 2 },
	weights_smith: { x: 16, y: 2 },
	weights_olympic: { x: 10, y: 4 },
	amenity_water: { x: 2, y: 8 },
	amenity_lockers: { x: 4, y: 8 },
	amenity_showers: { x: 6, y: 8 },
	amenity_sauna: { x: 8, y: 8 },
	amenity_juice: { x: 2, y: 10 },
	decor_posters: { x: 10, y: 8 },
	decor_plants: { x: 12, y: 8 },
	decor_mirrors: { x: 14, y: 8 },
	decor_trophy: { x: 16, y: 8 },
	decor_neon: { x: 10, y: 10 },
	staff_reception: { x: 6, y: 5 },
	staff_trainer: { x: 8, y: 5 },
	staff_massage: { x: 6, y: 7 },
	staff_physio: { x: 8, y: 7 },
	staff_nutrition: { x: 10, y: 6 },
}

const UPGRADE_CELEBRATIONS: Record<string, string> = {
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
}

const NPC_NAMES: Record<string, string> = {
	trainer_marcus: "Marcus",
	receptionist_lisa: "Lisa",
	regular_derek: "Derek",
	regular_priya: "Priya",
	regular_tom: "Tom",
	regular_elena: "Elena",
	specialist_coach: "Coach Rivera",
	specialist_nutritionist: "Dr. Kim",
}

function getDefaultPlacement(
	_key: string,
	category: string,
	index: number,
): { x: number; y: number } {
	const zone = CATEGORY_ZONES[category] ?? { startX: 2, startY: 2 }
	const col = index % 4
	const row = Math.floor(index / 4)
	return {
		x: zone.startX + col * 2,
		y: zone.startY + row * 2,
	}
}

type CeremonyWorker = Phaser.GameObjects.Image | Phaser.GameObjects.Rectangle

export class GymScene extends Phaser.Scene {
	private dragStart: { x: number; y: number } | null = null
	private categoryCounters: Record<string, number> = {}
	private npcSprites: Map<string, NpcSprite> = new Map()
	private equipmentSprites: Map<string, Phaser.GameObjects.Sprite> = new Map()
	private missingSpriteKeys: Set<string> = new Set()
	private pollTimer: Phaser.Time.TimerEvent | null = null
	private ceremonyActive = false

	constructor() {
		super({ key: "GymScene" })
	}

	create() {
		const data = this.registry.get("gymData") as GymSceneData | undefined
		this.missingSpriteKeys = new Set(
			(this.registry.get("missingSprites") as string[] | undefined) ?? [],
		)

		this.setupEquipmentAnimations()
		this.renderFloor()
		this.renderWalls()
		this.renderDoor()

		if (data) {
			this.renderUnlockedEquipment(data.unlocked)
			this.renderLockedEquipment(data.locked)
		}

		this.setupCamera()
		this.startSimPolling()
		this.renderMissingSpritesBanner()
	}

	private setupEquipmentAnimations() {
		for (const config of deriveEquipmentAnimConfigs()) {
			if (this.missingSpriteKeys.has(config.key)) continue
			if (this.anims.exists(config.animKey)) continue
			this.anims.create({
				key: config.animKey,
				frames: this.anims.generateFrameNumbers(config.key, {
					start: 0,
					end: config.frameCount - 1,
				}),
				frameRate: config.fps,
				repeat: -1,
			})
		}
	}

	private renderMissingSpritesBanner() {
		const missing = this.registry.get("missingSprites") as string[] | undefined
		if (!missing || missing.length === 0) return
		this.add
			.text(4, 4, `⚠ ${missing.length} sprite(s) missing — see console`, {
				fontSize: "10px",
				fontFamily: "monospace",
				color: "#fbbf24",
				backgroundColor: "#1e1b2ecc",
				padding: { x: 4, y: 2 },
			})
			.setScrollFactor(0)
			.setDepth(10_000)
	}

	private renderFloor() {
		for (let y = 1; y < GRID_H - 1; y++) {
			for (let x = 1; x < GRID_W - 1; x++) {
				this.add
					.image(x * TILE + TILE / 2, y * TILE + TILE / 2, "floor-tile")
					.setDisplaySize(TILE, TILE)
					.setDepth(0)
			}
		}
	}

	private renderWalls() {
		for (let x = 1; x < GRID_W - 1; x++) {
			this.add
				.image(x * TILE + TILE / 2, TILE / 2, "wall-horizontal")
				.setDisplaySize(TILE, TILE)
				.setDepth(1)
			this.add
				.image(
					x * TILE + TILE / 2,
					(GRID_H - 1) * TILE + TILE / 2,
					"wall-horizontal",
				)
				.setDisplaySize(TILE, TILE)
				.setDepth(GRID_H * TILE)
		}

		for (let y = 1; y < GRID_H - 1; y++) {
			this.add
				.image(TILE / 2, y * TILE + TILE / 2, "wall-vertical")
				.setDisplaySize(TILE, TILE)
				.setDepth(y * TILE)
			this.add
				.image(
					(GRID_W - 1) * TILE + TILE / 2,
					y * TILE + TILE / 2,
					"wall-vertical",
				)
				.setDisplaySize(TILE, TILE)
				.setDepth(y * TILE)
		}

		const corners = [
			[0, 0],
			[GRID_W - 1, 0],
			[0, GRID_H - 1],
			[GRID_W - 1, GRID_H - 1],
		]
		for (const [cx, cy] of corners) {
			this.add
				.image(cx * TILE + TILE / 2, cy * TILE + TILE / 2, "wall-corner")
				.setDisplaySize(TILE, TILE)
				.setDepth(cy * TILE)
		}
	}

	private renderDoor() {
		const doorX = Math.floor(GRID_W / 2) * TILE
		const doorY = (GRID_H - 1) * TILE + TILE / 2
		this.add
			.image(doorX, doorY, "gym-door")
			.setDisplaySize(EQUIP_SIZE, TILE)
			.setDepth(GRID_H * TILE)
	}

	private renderUnlockedEquipment(upgrades: UpgradeInfo[]) {
		this.categoryCounters = {}
		for (const upgrade of upgrades) {
			const count = this.categoryCounters[upgrade.category] ?? 0
			this.categoryCounters[upgrade.category] = count + 1

			const placement =
				(upgrade.placementData as { x: number; y: number } | null) ??
				getDefaultPlacement(upgrade.key, upgrade.category, count)

			const px = placement.x * TILE + TILE
			const py = placement.y * TILE + TILE
			const equipDepth = py + EQUIP_SIZE / 2

			const equipSprite = this.add
				.sprite(px, py, upgrade.key)
				.setDisplaySize(EQUIP_SIZE, EQUIP_SIZE)
				.setDepth(equipDepth)
			this.equipmentSprites.set(upgrade.key, equipSprite)

			this.add
				.text(px, py + EQUIP_SIZE / 2 + 4, upgrade.name, {
					fontSize: "9px",
					color: "#e2e8f0",
					fontFamily: "monospace",
					align: "center",
				})
				.setOrigin(0.5, 0)
				.setDepth(equipDepth + 1)
		}
	}

	private renderLockedEquipment(locked: LockedInfo[]) {
		for (const item of locked) {
			const count = this.categoryCounters[item.category] ?? 0
			this.categoryCounters[item.category] = count + 1

			const placement = getDefaultPlacement(item.key, item.category, count)
			const px = placement.x * TILE + TILE
			const py = placement.y * TILE + TILE

			this.add
				.image(px, py, "equipment-locked")
				.setDisplaySize(EQUIP_SIZE, EQUIP_SIZE)
				.setAlpha(0.4)
				.setDepth(py + EQUIP_SIZE / 2)

			this.add
				.text(px, py + EQUIP_SIZE / 2 + 4, `${item.requiredXp} XP`, {
					fontSize: "8px",
					color: "#94a3b8",
					fontFamily: "monospace",
					align: "center",
				})
				.setOrigin(0.5, 0)
				.setDepth(py + EQUIP_SIZE / 2 + 1)
		}
	}

	private startSimPolling() {
		this.fetchSimState()
		this.pollTimer = this.time.addEvent({
			delay: POLL_INTERVAL,
			callback: () => this.fetchSimState(),
			loop: true,
		})
	}

	private async fetchSimState() {
		try {
			const res = await fetch("/api/gym/sim-state", {
				credentials: "include",
			})
			if (!res.ok) return
			const data = await res.json()
			this.applySimState(data.npcs as NpcState[])
		} catch {
			// silently skip poll failures
		}
	}

	private applySimState(npcs: NpcState[]) {
		const currentKeys = new Set<string>()
		const activeEquipment = new Set<string>()

		for (const npc of npcs) {
			if (
				npc.isPresent &&
				npc.currentActivity === "using_equipment" &&
				npc.targetEquipmentKey
			) {
				activeEquipment.add(npc.targetEquipmentKey)
			}
		}

		for (const npc of npcs) {
			currentKeys.add(npc.npcKey)
			const existing = this.npcSprites.get(npc.npcKey)

			if (!npc.isPresent) {
				if (existing) {
					existing.moveTo(DOOR_TILE.x, DOOR_TILE.y)
					existing.fadeOut(() => {
						existing.destroy()
						this.npcSprites.delete(npc.npcKey)
					})
				}
				continue
			}

			if (!existing) {
				const ns = new NpcSprite(this, npc.npcKey, DOOR_TILE.x, DOOR_TILE.y)
				ns.updateLabel(NPC_NAMES[npc.npcKey] ?? npc.npcKey, npc.mood)
				ns.fadeIn()
				ns.updateDepth()
				this.npcSprites.set(npc.npcKey, ns)

				const key = npc.npcKey
				ns.sprite.on("pointerdown", () => {
					if (this.ceremonyActive) return
					const cb = this.registry.get("onNpcClick") as
						| ((k: string) => void)
						| undefined
					if (cb) cb(key)
				})

				this.time.delayedCall(700, () => {
					ns.moveTo(npc.position.x, npc.position.y)
				})
			} else {
				existing.updateLabel(NPC_NAMES[npc.npcKey] ?? npc.npcKey, npc.mood)
				existing.moveTo(npc.position.x, npc.position.y)
			}

			const sprite = this.npcSprites.get(npc.npcKey)
			if (!sprite) continue

			if (npc.currentActivity === "using_equipment") {
				sprite.stopActivity()
				sprite.playActivity()
				sprite.hideChatBubble()
			} else if (npc.currentActivity === "chatting") {
				sprite.stopActivity()
				sprite.showChatBubble()
			} else {
				sprite.stopActivity()
				sprite.hideChatBubble()
			}

			sprite.faceDirection(npc.facingDirection)
		}

		for (const [key, sprite] of this.npcSprites) {
			if (!currentKeys.has(key)) {
				sprite.fadeOut(() => {
					sprite.destroy()
					this.npcSprites.delete(key)
				})
			}
		}

		this.updateEquipmentAnimations(activeEquipment)
	}

	private updateEquipmentAnimations(activeKeys: Set<string>) {
		for (const [key, sprite] of this.equipmentSprites) {
			const animKey = `${key}_anim`
			const canAnimate =
				!this.missingSpriteKeys.has(key) && this.anims.exists(animKey)

			if (activeKeys.has(key) && canAnimate) {
				if (
					sprite.anims.currentAnim?.key !== animKey ||
					!sprite.anims.isPlaying
				) {
					sprite.play(animKey)
				}
			} else if (sprite.anims.isPlaying) {
				sprite.anims.stop()
				sprite.setFrame(0)
			}
		}
	}

	private setupCamera() {
		const cam = this.cameras.main
		cam.setBounds(0, 0, GRID_W * TILE, GRID_H * TILE)
		cam.centerOn((GRID_W * TILE) / 2, (GRID_H * TILE) / 2)

		this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
			if (this.ceremonyActive) return
			this.dragStart = { x: pointer.x, y: pointer.y }
		})

		this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
			if (this.ceremonyActive) return
			if (!pointer.isDown || !this.dragStart) return
			const dx = this.dragStart.x - pointer.x
			const dy = this.dragStart.y - pointer.y
			cam.scrollX += dx
			cam.scrollY += dy
			this.dragStart = { x: pointer.x, y: pointer.y }
		})

		this.input.on("pointerup", () => {
			this.dragStart = null
		})

		this.input.on(
			"wheel",
			(
				_pointer: Phaser.Input.Pointer,
				_gameObjects: unknown[],
				_deltaX: number,
				deltaY: number,
			) => {
				if (this.ceremonyActive) return
				const newZoom = Phaser.Math.Clamp(cam.zoom - deltaY * 0.001, 0.5, 3)
				cam.setZoom(newZoom)
			},
		)

		if ("ontouchstart" in window) {
			let startDistance = 0
			let startZoom = 1

			this.input.on("pointerdown", () => {
				if (this.ceremonyActive) return
				const pointers = this.input.manager.pointers.filter((p) => p.isDown)
				if (pointers.length === 2) {
					const dx = pointers[0].x - pointers[1].x
					const dy = pointers[0].y - pointers[1].y
					startDistance = Math.sqrt(dx * dx + dy * dy)
					startZoom = cam.zoom
				}
			})

			this.input.on("pointermove", () => {
				if (this.ceremonyActive) return
				const pointers = this.input.manager.pointers.filter((p) => p.isDown)
				if (pointers.length === 2) {
					const dx = pointers[0].x - pointers[1].x
					const dy = pointers[0].y - pointers[1].y
					const dist = Math.sqrt(dx * dx + dy * dy)
					if (startDistance > 0) {
						const scale = dist / startDistance
						cam.setZoom(Phaser.Math.Clamp(startZoom * scale, 0.5, 3))
					}
				}
			})
		}
	}

	// ── Ceremony ────────────────────────────────────────────────────────────────

	startUpgradeCeremony(upgradeKey: string, onComplete: () => void) {
		if (this.ceremonyActive) return
		this.ceremonyActive = true

		const pos = UPGRADE_LAYOUT[upgradeKey] ?? { x: 8, y: 7 }
		const centerX = pos.x * TILE + TILE
		const centerY = pos.y * TILE + TILE

		// Scroll camera toward equipment
		this.cameras.main.pan(centerX, centerY, 600, "Sine.easeInOut")

		// Spawn workers near equipment slot
		const w1 = this.spawnCeremonyWorker(
			Math.max(1, pos.x - 1),
			Math.min(GRID_H - 2, pos.y + 1),
		)
		const w2 = this.spawnCeremonyWorker(
			Math.min(GRID_W - 2, pos.x + 1),
			Math.min(GRID_H - 2, pos.y + 1),
		)

		// Progress bar
		const barY = centerY - EQUIP_SIZE / 2 - 20
		const barLabel = this.add
			.text(centerX, barY - 10, "INSTALLING...", {
				fontSize: "7px",
				color: "#94a3b8",
				fontFamily: "monospace",
			})
			.setOrigin(0.5, 1)
			.setDepth(2000)

		const barBg = this.add
			.rectangle(centerX, barY, 80, 8, 0x334155)
			.setDepth(2001)
		const barFill = this.add
			.rectangle(centerX - 40, barY, 0, 8, 0x4ade80)
			.setOrigin(0, 0.5)
			.setDepth(2002)

		let progress = 0
		let revealed = false

		const doReveal = () => {
			if (revealed) return
			revealed = true

			barLabel.destroy()
			barBg.destroy()
			barFill.destroy()

			// Workers step away
			this.tweens.add({ targets: w1, x: w1.x - TILE * 1.5, duration: 400 })
			this.tweens.add({ targets: w2, x: w2.x + TILE * 1.5, duration: 400 })

			// White flash
			const cam = this.cameras.main
			const flash = this.add
				.rectangle(0, 0, cam.width * 4, cam.height * 4, 0xffffff)
				.setOrigin(0, 0)
				.setScrollFactor(0)
				.setAlpha(0.85)
				.setDepth(5000)
			this.tweens.add({
				targets: flash,
				alpha: 0,
				duration: 500,
				onComplete: () => flash.destroy(),
			})

			// Equipment fades in
			this.time.delayedCall(150, () => {
				const equip = this.add
					.image(centerX, centerY, upgradeKey)
					.setDisplaySize(EQUIP_SIZE, EQUIP_SIZE)
					.setAlpha(0)
					.setDepth(centerY + EQUIP_SIZE / 2)
				this.tweens.add({ targets: equip, alpha: 1, duration: 600 })

				this.spawnConfetti(centerX, centerY)
				this.showNpcCelebration(upgradeKey)

				// Workers fade out
				this.time.delayedCall(2000, () => {
					this.tweens.add({
						targets: [w1, w2],
						alpha: 0,
						duration: 400,
						onComplete: () => {
							w1.destroy()
							w2.destroy()
						},
					})
				})

				// Signal ceremony end, call API
				this.time.delayedCall(4200, () => {
					this.ceremonyActive = false
					onComplete()
				})
			})
		}

		// Use native DOM click so handler survives Phaser input lifecycle quirks
		const canvas = this.game.canvas
		const clickCb = () => {
			if (revealed) return
			progress = Math.min(100, progress + 5)
			barFill.setSize(Math.floor((progress / 100) * 80), 8)
			this.spawnClickFX(centerX, centerY)
			this.cheerWorkers(w1, w2)
			if (progress >= 100) {
				canvas.removeEventListener("pointerdown", clickCb)
				doReveal()
			}
		}
		canvas.addEventListener("pointerdown", clickCb)

		// Auto-fill: 100% over 8 seconds (1.25% every 100ms)
		const autoTimer = this.time.addEvent({
			delay: 100,
			loop: true,
			callback: () => {
				if (revealed) return
				progress = Math.min(100, progress + 1.25)
				barFill.setSize(Math.floor((progress / 100) * 80), 8)
				if (progress >= 100) {
					autoTimer.destroy()
					canvas.removeEventListener("pointerdown", clickCb)
					doReveal()
				}
			},
		})
	}

	private spawnCeremonyWorker(tileX: number, tileY: number): CeremonyWorker {
		const px = tileX * TILE + TILE / 2
		const py = tileY * TILE + TILE / 2

		if (this.textures.exists("worker")) {
			const img = this.add
				.image(px, py, "worker")
				.setDisplaySize(TILE, TILE)
				.setAlpha(0)
				.setDepth(py + 50)
			this.tweens.add({ targets: img, alpha: 1, duration: 500 })
			return img
		}

		const rect = this.add
			.rectangle(px, py, TILE - 4, TILE - 4, 0xf59e0b)
			.setAlpha(0)
			.setDepth(py + 50)
		this.tweens.add({ targets: rect, alpha: 1, duration: 500 })
		return rect
	}

	private cheerWorkers(w1: CeremonyWorker, w2: CeremonyWorker) {
		for (const w of [w1, w2]) {
			this.tweens.add({
				targets: w,
				y: (w as { y: number }).y - 6,
				duration: 100,
				yoyo: true,
				ease: "Quad.easeOut",
			})
		}
	}

	private spawnClickFX(cx: number, cy: number) {
		const labels = ["CLANG!", "WHOOSH!", "ZAP!", "BANG!", "SPARK!"]
		const label = labels[Math.floor(Math.random() * labels.length)]
		const txt = this.add
			.text(cx + (Math.random() - 0.5) * 40, cy - 10, label, {
				fontSize: "9px",
				color: "#fbbf24",
				fontFamily: "monospace",
				fontStyle: "bold",
			})
			.setOrigin(0.5)
			.setDepth(3000)
		this.tweens.add({
			targets: txt,
			y: txt.y - 24,
			alpha: 0,
			duration: 600,
			onComplete: () => txt.destroy(),
		})

		// Sparks
		for (let i = 0; i < 6; i++) {
			const angle = (Math.PI * 2 * i) / 6 + Math.random() * 0.5
			const dist = 12 + Math.random() * 20
			const spark = this.add.rectangle(cx, cy, 4, 4, 0xfbbf24).setDepth(3001)
			this.tweens.add({
				targets: spark,
				x: cx + Math.cos(angle) * dist,
				y: cy + Math.sin(angle) * dist,
				alpha: 0,
				duration: 350,
				onComplete: () => spark.destroy(),
			})
		}
	}

	private spawnConfetti(cx: number, cy: number) {
		const colors = [0xff6b6b, 0x4ecdc4, 0xffe66d, 0x6c5ce7, 0x00b894, 0xfbbf24]
		for (let i = 0; i < 40; i++) {
			const color = colors[Math.floor(Math.random() * colors.length)]
			const x = cx + (Math.random() - 0.5) * 80
			const startY = cy - 40
			const piece = this.add.rectangle(x, startY, 5, 5, color).setDepth(3000)
			this.tweens.add({
				targets: piece,
				x: x + (Math.random() - 0.5) * 60,
				y: startY + 90 + Math.random() * 40,
				alpha: 0,
				angle: Math.random() * 360,
				duration: 700 + Math.random() * 600,
				delay: Math.random() * 300,
				ease: "Quad.easeIn",
				onComplete: () => piece.destroy(),
			})
		}
	}

	private showNpcCelebration(upgradeKey: string) {
		// Prefer Marcus, then any present NPC
		const marcus = this.npcSprites.get("trainer_marcus")
		const npc = marcus ?? this.npcSprites.values().next().value

		if (!npc) return

		const line =
			UPGRADE_CELEBRATIONS[upgradeKey] ?? "New equipment! This is awesome!"

		const bubble = this.add
			.text(npc.sprite.x, npc.sprite.y - TILE / 2 - 24, `"${line}"`, {
				fontSize: "7px",
				color: "#1e1b2e",
				fontFamily: "monospace",
				backgroundColor: "#ffffff",
				padding: { x: 4, y: 3 },
				wordWrap: { width: 130 },
				align: "center",
			})
			.setOrigin(0.5, 1)
			.setDepth(3500)

		this.time.delayedCall(3800, () => {
			this.tweens.add({
				targets: bubble,
				alpha: 0,
				duration: 400,
				onComplete: () => bubble.destroy(),
			})
		})
	}

	// ── Scene management ─────────────────────────────────────────────────────

	updateGymData(data: GymSceneData) {
		this.registry.set("gymData", data)
		if (this.pollTimer) {
			this.pollTimer.destroy()
			this.pollTimer = null
		}
		for (const [, sprite] of this.npcSprites) {
			sprite.destroy()
		}
		this.npcSprites.clear()
		this.scene.restart()
	}

	shutdown() {
		if (this.pollTimer) {
			this.pollTimer.destroy()
			this.pollTimer = null
		}
		for (const [, sprite] of this.npcSprites) {
			sprite.destroy()
		}
		this.npcSprites.clear()
	}
}
