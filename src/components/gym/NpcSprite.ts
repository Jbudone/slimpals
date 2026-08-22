import type Phaser from "phaser"
import {
	resolveAnimationAvailability,
	resolvePoseKey,
	resolveWalkKey,
} from "./npcAnimation.js"

const TILE = 32
const MOVE_DURATION = 1500

function moodEmoji(mood: number): string {
	if (mood >= 40) return "\u{1F60A}"
	if (mood >= 0) return "\u{1F610}"
	return "\u{1F624}"
}

export type NpcState = {
	npcKey: string
	isPresent: boolean
	position: { x: number; y: number }
	currentActivity: string
	targetEquipmentKey: string | null
	facingDirection: "up" | "down" | "left" | "right"
	mood: number
	currentAnimation: string
	isInteractable: boolean
}

export class NpcSprite {
	sprite: Phaser.GameObjects.Sprite
	shadow: Phaser.GameObjects.Ellipse
	nameLabel: Phaser.GameObjects.Text
	chatBubble: Phaser.GameObjects.Text | null = null
	private scene: Phaser.Scene
	private npcKey: string
	private baseSpriteKey: string
	private availableSpriteKeys: ReadonlySet<string>
	private moveTween: Phaser.Tweens.Tween | null = null
	private bobTween: Phaser.Tweens.Tween | null = null
	private activityTween: Phaser.Tweens.Tween | null = null
	private usingPoseArt = false
	private baseY = 0

	constructor(
		scene: Phaser.Scene,
		npcKey: string,
		x: number,
		y: number,
		availableSpriteKeys: ReadonlySet<string> = new Set(),
	) {
		this.scene = scene
		this.npcKey = npcKey
		this.availableSpriteKeys = availableSpriteKeys
		const spriteKey = `npc_${npcKey}`
		this.baseSpriteKey = spriteKey

		const px = x * TILE + TILE / 2
		const py = y * TILE + TILE / 2
		this.baseY = py

		this.shadow = scene.add
			.ellipse(px, py + TILE * 0.35, TILE * 0.6, TILE * 0.2, 0x000000, 0.3)
			.setAlpha(0)

		this.sprite = scene.add
			.sprite(px, py, spriteKey)
			.setDisplaySize(TILE, TILE)
			.setAlpha(0)
			.setInteractive({ useHandCursor: true })

		this.nameLabel = scene.add
			.text(px, py - TILE / 2 - 2, "", {
				fontSize: "8px",
				color: "#e2e8f0",
				fontFamily: "monospace",
				align: "center",
				backgroundColor: "#1e1b2ecc",
				padding: { x: 2, y: 1 },
			})
			.setOrigin(0.5, 1)
			.setAlpha(0)
	}

	fadeIn() {
		this.scene.tweens.add({
			targets: [this.sprite, this.nameLabel, this.shadow],
			alpha: { from: 0, to: 1 },
			duration: 600,
		})
		this.shadow.setAlpha(0)
		this.scene.tweens.add({
			targets: this.shadow,
			alpha: { from: 0, to: 0.3 },
			duration: 600,
		})
	}

	fadeOut(onComplete?: () => void) {
		this.scene.tweens.add({
			targets: [this.sprite, this.nameLabel, this.shadow],
			alpha: 0,
			duration: 600,
			onComplete,
		})
		this.hideChatBubble()
	}

	moveTo(tileX: number, tileY: number) {
		const targetPx = tileX * TILE + TILE / 2
		const targetPy = tileY * TILE + TILE / 2

		if (this.moveTween) this.moveTween.stop()

		const dx = targetPx - this.sprite.x
		const dy = targetPy - this.sprite.y
		if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return

		this.sprite.setFlipX(dx < 0)
		this.baseY = targetPy
		this.startWalking()

		this.moveTween = this.scene.tweens.add({
			targets: [this.shadow],
			x: targetPx,
			y: targetPy + TILE * 0.35,
			duration: MOVE_DURATION,
			ease: "Sine.easeInOut",
		})

		this.scene.tweens.add({
			targets: this.sprite,
			x: targetPx,
			duration: MOVE_DURATION,
			ease: "Sine.easeInOut",
			onUpdate: () => {
				this.nameLabel.setPosition(this.sprite.x, this.sprite.y - TILE / 2 - 2)
				this.updateDepth()
				if (this.chatBubble) {
					this.chatBubble.setPosition(
						this.sprite.x,
						this.sprite.y - TILE / 2 - 14,
					)
				}
			},
			onComplete: () => {
				this.moveTween = null
			},
		})

		this.scene.tweens.add({
			targets: this.sprite,
			y: targetPy,
			duration: MOVE_DURATION,
			ease: "Sine.easeInOut",
			onComplete: () => {
				this.stopWalking()
			},
		})
	}

	/** Walk-cycle art if drawn, else the tween-based rocking fallback. */
	private startWalking() {
		const walkAnimKey = this.animKeyFor(resolveWalkKey(this.npcKey))
		if (walkAnimKey) {
			this.stopWalkBob()
			this.sprite.play(walkAnimKey)
			return
		}
		this.startWalkBob()
	}

	private stopWalking() {
		this.stopWalkBob()
		const walkAnimKey = this.animKeyFor(resolveWalkKey(this.npcKey))
		if (walkAnimKey && this.sprite.anims.currentAnim?.key === walkAnimKey) {
			this.sprite.anims.stop()
			this.sprite.setTexture(this.baseSpriteKey)
		}
	}

	private startWalkBob() {
		this.stopWalkBob()
		this.bobTween = this.scene.tweens.add({
			targets: this.sprite,
			angle: { from: -4, to: 4 },
			duration: 150,
			yoyo: true,
			repeat: -1,
			ease: "Sine.easeInOut",
		})
	}

	private stopWalkBob() {
		if (this.bobTween) {
			this.bobTween.stop()
			this.bobTween = null
			this.sprite.setAngle(0)
		}
	}

	/**
	 * Returns the `<key>_anim` Phaser animation key when real animated art is
	 * loaded and registered for `candidateKey`, else null (use tween fallback).
	 */
	private animKeyFor(candidateKey: string): string | null {
		if (
			resolveAnimationAvailability(candidateKey, this.availableSpriteKeys) ===
			"fallback"
		) {
			return null
		}
		const animKey = `${candidateKey}_anim`
		return this.scene.anims.exists(animKey) ? animKey : null
	}

	/** Exercise pose art for the given equipment if drawn, else the bob-tween fallback. */
	playActivity(equipmentKey?: string) {
		this.stopWalkBob()
		if (this.usingPoseArt || this.activityTween) return

		const poseKey = equipmentKey
			? resolvePoseKey(this.npcKey, equipmentKey)
			: null
		if (
			poseKey &&
			resolveAnimationAvailability(poseKey, this.availableSpriteKeys) === "art"
		) {
			this.usingPoseArt = true
			const poseAnimKey = `${poseKey}_anim`
			if (this.scene.anims.exists(poseAnimKey)) {
				this.sprite.play(poseAnimKey)
			} else {
				this.sprite.setTexture(poseKey)
			}
			return
		}

		this.activityTween = this.scene.tweens.add({
			targets: this.sprite,
			y: this.baseY - 3,
			angle: { from: -2, to: 2 },
			duration: 500,
			yoyo: true,
			repeat: -1,
			ease: "Sine.easeInOut",
		})
	}

	stopActivity() {
		if (this.usingPoseArt) {
			this.usingPoseArt = false
			if (this.sprite.anims.isPlaying) {
				this.sprite.anims.stop()
			}
			this.sprite.setTexture(this.baseSpriteKey)
			this.sprite.setFrame(0)
		}
		if (this.activityTween) {
			this.activityTween.stop()
			this.activityTween = null
			this.sprite.setAngle(0)
			this.sprite.y = this.baseY
		}
	}

	faceDirection(dir: "up" | "down" | "left" | "right") {
		this.sprite.setFlipX(dir === "left")
	}

	updateLabel(name: string, mood: number) {
		this.nameLabel.setText(`${name} ${moodEmoji(mood)}`)
	}

	updateDepth() {
		const depth = Math.floor(this.sprite.y)
		this.sprite.setDepth(depth)
		this.nameLabel.setDepth(depth + 1)
		if (this.chatBubble) {
			this.chatBubble.setDepth(depth + 1)
		}
	}

	showChatBubble() {
		if (this.chatBubble) return
		this.chatBubble = this.scene.add
			.text(this.sprite.x, this.sprite.y - TILE / 2 - 14, "\u{1F4AC}", {
				fontSize: "10px",
			})
			.setOrigin(0.5, 1)
			.setDepth(Math.floor(this.sprite.y) + 1)
	}

	hideChatBubble() {
		if (this.chatBubble) {
			this.chatBubble.destroy()
			this.chatBubble = null
		}
	}

	destroy() {
		if (this.moveTween) this.moveTween.stop()
		this.stopWalkBob()
		this.stopActivity()
		this.sprite.destroy()
		this.shadow.destroy()
		this.nameLabel.destroy()
		this.hideChatBubble()
	}
}
