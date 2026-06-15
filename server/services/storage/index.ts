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

export function createStorageService(): StorageService {
	const provider = process.env.STORAGE_PROVIDER ?? "local"
	if (provider === "local") return new LocalStorageService()
	throw new Error(`Unknown STORAGE_PROVIDER: ${provider}`)
}
