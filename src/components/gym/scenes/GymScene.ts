import Phaser from "phaser"
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

export class GymScene extends Phaser.Scene {
	private dragStart: { x: number; y: number } | null = null
	private categoryCounters: Record<string, number> = {}
	private npcSprites: Map<string, NpcSprite> = new Map()
	private pollTimer: Phaser.Time.TimerEvent | null = null

	constructor() {
		super({ key: "GymScene" })
	}

	create() {
		const data = this.registry.get("gymData") as GymSceneData | undefined

		this.renderFloor()
		this.renderWalls()
		this.renderDoor()

		if (data) {
			this.renderUnlockedEquipment(data.unlocked)
			this.renderLockedEquipment(data.locked)
		}

		this.setupCamera()
		this.startSimPolling()
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

			this.add
				.image(px, py, upgrade.key)
				.setDisplaySize(EQUIP_SIZE, EQUIP_SIZE)
				.setDepth(equipDepth)

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
	}

	private setupCamera() {
		const cam = this.cameras.main
		cam.setBounds(0, 0, GRID_W * TILE, GRID_H * TILE)
		cam.centerOn((GRID_W * TILE) / 2, (GRID_H * TILE) / 2)

		this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
			this.dragStart = { x: pointer.x, y: pointer.y }
		})

		this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
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
				const newZoom = Phaser.Math.Clamp(cam.zoom - deltaY * 0.001, 0.5, 3)
				cam.setZoom(newZoom)
			},
		)

		if ("ontouchstart" in window) {
			let startDistance = 0
			let startZoom = 1

			this.input.on("pointerdown", () => {
				const pointers = this.input.manager.pointers.filter((p) => p.isDown)
				if (pointers.length === 2) {
					const dx = pointers[0].x - pointers[1].x
					const dy = pointers[0].y - pointers[1].y
					startDistance = Math.sqrt(dx * dx + dy * dy)
					startZoom = cam.zoom
				}
			})

			this.input.on("pointermove", () => {
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
