import { and, eq } from "drizzle-orm"
import { Router } from "express"
import { XMLParser } from "fast-xml-parser"
import multer from "multer"
import { db } from "../db/index.js"
import { stepRecords, weightEntries } from "../db/schema.js"
import type { AuthRequest } from "../middleware/requireAuth.js"

const upload = multer({
	storage: multer.memoryStorage(),
	limits: { fileSize: 200 * 1024 * 1024 },
})

type HealthRecord = {
	"@_type": string
	"@_value"?: string
	"@_startDate"?: string
	"@_endDate"?: string
	"@_unit"?: string
}

function parseAppleHealthXml(buffer: Buffer): {
	weightRecords: { kg: number; recordedAt: Date }[]
	stepRecords: { steps: number; recordedAt: Date }[]
} {
	const parser = new XMLParser({
		ignoreAttributes: false,
		attributeNamePrefix: "@_",
		isArray: (name) => name === "Record",
	})

	const xml = parser.parse(buffer)
	const records: HealthRecord[] =
		xml?.HealthData?.Record ?? xml?.["health-data"]?.Record ?? []

	const weightRecords: { kg: number; recordedAt: Date }[] = []
	const stepResults: { steps: number; recordedAt: Date }[] = []

	for (const rec of records) {
		const type = rec["@_type"]
		const value = rec["@_value"]
		const startDate = rec["@_startDate"]

		if (!type || !value || !startDate) continue

		if (type === "HKQuantityTypeIdentifierBodyMass") {
			let kg = Number.parseFloat(value)
			if (Number.isNaN(kg) || kg <= 0) continue
			const unit = rec["@_unit"]
			if (unit === "lb") {
				kg = kg * 0.453592
			}
			weightRecords.push({ kg, recordedAt: new Date(startDate) })
		} else if (type === "HKQuantityTypeIdentifierStepCount") {
			const steps = Number.parseInt(value, 10)
			if (Number.isNaN(steps) || steps <= 0) continue
			stepResults.push({ steps, recordedAt: new Date(startDate) })
		}
	}

	return { weightRecords, stepRecords: stepResults }
}

export const appleHealthRouter = Router()

appleHealthRouter.post(
	"/health/import",
	upload.single("file"),
	async (req, res) => {
		const userId = (req as AuthRequest).user.id
		const file = (req as AuthRequest & { file?: Express.Multer.File }).file

		if (!file) {
			res.status(400).json({ error: "No file uploaded" })
			return
		}

		if (
			!file.originalname.endsWith(".xml") &&
			file.mimetype !== "text/xml" &&
			file.mimetype !== "application/xml"
		) {
			res.status(400).json({ error: "File must be an XML file" })
			return
		}

		let parsed: ReturnType<typeof parseAppleHealthXml>
		try {
			parsed = parseAppleHealthXml(file.buffer)
		} catch {
			res.status(400).json({ error: "Invalid Apple Health XML file" })
			return
		}

		if (parsed.weightRecords.length === 0 && parsed.stepRecords.length === 0) {
			res.status(400).json({
				error:
					"No health records found. Ensure this is an Apple Health export file.",
			})
			return
		}

		let weightEntriesImported = 0
		let weightEntriesSkipped = 0

		for (const rec of parsed.weightRecords) {
			const [existing] = await db
				.select({ id: weightEntries.id })
				.from(weightEntries)
				.where(
					and(
						eq(weightEntries.userId, userId),
						eq(weightEntries.recordedAt, rec.recordedAt),
					),
				)
				.limit(1)

			if (existing) {
				weightEntriesSkipped++
				continue
			}

			await db.insert(weightEntries).values({
				userId,
				weightKg: Math.round(rec.kg * 10),
				source: "apple_health",
				recordedAt: rec.recordedAt,
			})
			weightEntriesImported++
		}

		let stepRecordsSaved = 0
		for (const rec of parsed.stepRecords) {
			await db.insert(stepRecords).values({
				userId,
				steps: rec.steps,
				source: "apple_health",
				recordedAt: rec.recordedAt,
			})
			stepRecordsSaved++
		}

		res.json({
			weightEntriesImported,
			weightEntriesSkipped,
			stepRecordsSaved,
		})
	},
)
