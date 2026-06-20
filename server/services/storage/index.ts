import { randomUUID } from "node:crypto"
import { createWriteStream, mkdirSync } from "node:fs"
import path from "node:path"

export interface StorageService {
	upload(file: Express.Multer.File): Promise<string>
}

export class LocalStorageService implements StorageService {
	private dir: string

	constructor(dir = "uploads") {
		this.dir = dir
		mkdirSync(this.dir, { recursive: true })
	}

	async upload(file: Express.Multer.File): Promise<string> {
		const ext = path.extname(file.originalname) || ".jpg"
		const filename = `${randomUUID()}${ext}`
		const dest = path.join(this.dir, filename)

		await new Promise<void>((resolve, reject) => {
			const ws = createWriteStream(dest)
			ws.on("finish", resolve)
			ws.on("error", reject)
			ws.write(file.buffer)
			ws.end()
		})

		return `/uploads/${filename}`
	}
}

export class BunnyCDNStorageService implements StorageService {
	private apiKey: string
	private storageZone: string
	private cdnUrl: string

	constructor() {
		this.apiKey = process.env.BUNNYCDN_API_KEY ?? ""
		this.storageZone = process.env.BUNNYCDN_STORAGE_ZONE ?? ""
		this.cdnUrl = process.env.BUNNYCDN_CDN_URL ?? ""

		if (!this.apiKey || !this.storageZone || !this.cdnUrl) {
			throw new Error(
				"BunnyCDN requires BUNNYCDN_API_KEY, BUNNYCDN_STORAGE_ZONE, and BUNNYCDN_CDN_URL",
			)
		}
	}

	async upload(file: Express.Multer.File): Promise<string> {
		const ext = path.extname(file.originalname) || ".jpg"
		const filename = `${randomUUID()}${ext}`

		const url = `https://storage.bunnycdn.com/${this.storageZone}/${filename}`

		const res = await fetch(url, {
			method: "PUT",
			headers: {
				AccessKey: this.apiKey,
				"Content-Type": "application/octet-stream",
			},
			body: file.buffer,
		})

		if (!res.ok) {
			const text = await res.text()
			throw new Error(`BunnyCDN upload failed (${res.status}): ${text}`)
		}

		return `${this.cdnUrl}/${filename}`
	}
}

export function createStorageService(): StorageService {
	const provider = process.env.STORAGE_PROVIDER ?? "local"
	if (provider === "local") return new LocalStorageService()
	if (provider === "bunnycdn") return new BunnyCDNStorageService()
	throw new Error(`Unknown STORAGE_PROVIDER: ${provider}`)
}
