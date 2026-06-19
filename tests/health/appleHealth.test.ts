import request from "supertest"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import {
	invites,
	stepRecords,
	users,
	weightEntries,
} from "../../server/db/schema.js"
import {
	closeTestDb,
	getTestDb,
	resetSchema,
	truncateAll,
} from "../helpers/db.js"

const { createApp } = await import("../../server/app.js")
const app = createApp()

function buildAppleHealthXml(
	records: { type: string; value: string; startDate: string; unit?: string }[],
): string {
	const recordXml = records
		.map(
			(r) =>
				`<Record type="${r.type}" value="${r.value}" startDate="${r.startDate}" endDate="${r.startDate}" unit="${r.unit ?? "kg"}" />`,
		)
		.join("\n")
	return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE HealthData>
<HealthData>
${recordXml}
</HealthData>`
}

async function seedBase() {
	const db = await getTestDb()
	await db.insert(users).values({
		id: "admin-001",
		email: "admin@slimpals.test",
		name: "Admin",
	})
	await db.insert(invites).values({
		code: "HEALTH-INVITE",
		createdByUserId: "admin-001",
		expiresAt: new Date(Date.now() + 86_400_000),
	})
}

async function registerAndLogin(
	email = "health@slimpals.test",
	name = "Health User",
) {
	const res = await request(app).post("/api/auth/sign-up/email").send({
		name,
		email,
		password: "Password1!",
		inviteCode: "HEALTH-INVITE",
	})
	const cookies = res.headers["set-cookie"] as string[]
	return Array.isArray(cookies) ? cookies.join("; ") : cookies
}

beforeAll(async () => {
	await resetSchema()
})

beforeEach(async () => {
	await truncateAll()
	await seedBase()
})

afterAll(async () => {
	await closeTestDb()
})

describe("POST /api/health/import", () => {
	it("returns 401 without auth", async () => {
		const res = await request(app).post("/api/health/import")
		expect(res.status).toBe(401)
	})

	it("returns 400 when no file is uploaded", async () => {
		const cookie = await registerAndLogin()
		const res = await request(app)
			.post("/api/health/import")
			.set("Cookie", cookie)
		expect(res.status).toBe(400)
		expect(res.body.error).toMatch(/no file/i)
	})

	it("imports weight entries from valid Apple Health XML", async () => {
		const cookie = await registerAndLogin()
		const xml = buildAppleHealthXml([
			{
				type: "HKQuantityTypeIdentifierBodyMass",
				value: "80.5",
				startDate: "2026-01-15 08:00:00 -0500",
			},
			{
				type: "HKQuantityTypeIdentifierBodyMass",
				value: "79.8",
				startDate: "2026-01-16 08:00:00 -0500",
			},
		])

		const res = await request(app)
			.post("/api/health/import")
			.set("Cookie", cookie)
			.attach("file", Buffer.from(xml), "export.xml")

		expect(res.status).toBe(200)
		expect(res.body.weightEntriesImported).toBe(2)
		expect(res.body.weightEntriesSkipped).toBe(0)
	})

	it("imports step count records", async () => {
		const cookie = await registerAndLogin()
		const xml = buildAppleHealthXml([
			{
				type: "HKQuantityTypeIdentifierStepCount",
				value: "8432",
				startDate: "2026-01-15 08:00:00 -0500",
				unit: "count",
			},
			{
				type: "HKQuantityTypeIdentifierStepCount",
				value: "10201",
				startDate: "2026-01-16 08:00:00 -0500",
				unit: "count",
			},
		])

		const res = await request(app)
			.post("/api/health/import")
			.set("Cookie", cookie)
			.attach("file", Buffer.from(xml), "export.xml")

		expect(res.status).toBe(200)
		expect(res.body.stepRecordsSaved).toBe(2)

		const db = await getTestDb()
		const rows = await db.select().from(stepRecords)
		expect(rows.length).toBe(2)
		expect(rows[0].steps).toBe(8432)
	})

	it("skips duplicate weight entries with same timestamp", async () => {
		const cookie = await registerAndLogin()
		const xml = buildAppleHealthXml([
			{
				type: "HKQuantityTypeIdentifierBodyMass",
				value: "80.5",
				startDate: "2026-01-15 08:00:00 -0500",
			},
		])

		await request(app)
			.post("/api/health/import")
			.set("Cookie", cookie)
			.attach("file", Buffer.from(xml), "export.xml")

		const res = await request(app)
			.post("/api/health/import")
			.set("Cookie", cookie)
			.attach("file", Buffer.from(xml), "export.xml")

		expect(res.status).toBe(200)
		expect(res.body.weightEntriesImported).toBe(0)
		expect(res.body.weightEntriesSkipped).toBe(1)
	})

	it("sets source to apple_health on imported weight entries", async () => {
		const cookie = await registerAndLogin()
		const xml = buildAppleHealthXml([
			{
				type: "HKQuantityTypeIdentifierBodyMass",
				value: "75.0",
				startDate: "2026-02-01 09:00:00 -0500",
			},
		])

		await request(app)
			.post("/api/health/import")
			.set("Cookie", cookie)
			.attach("file", Buffer.from(xml), "export.xml")

		const db = await getTestDb()
		const rows = await db.select().from(weightEntries)
		expect(rows.length).toBe(1)
		expect(rows[0].source).toBe("apple_health")
	})

	it("returns 400 for a non-XML file", async () => {
		const cookie = await registerAndLogin()
		const res = await request(app)
			.post("/api/health/import")
			.set("Cookie", cookie)
			.attach("file", Buffer.from("not xml"), "data.txt")

		expect(res.status).toBe(400)
	})

	it("returns 400 when XML has no health records", async () => {
		const cookie = await registerAndLogin()
		const xml = '<?xml version="1.0"?><HealthData></HealthData>'

		const res = await request(app)
			.post("/api/health/import")
			.set("Cookie", cookie)
			.attach("file", Buffer.from(xml), "export.xml")

		expect(res.status).toBe(400)
		expect(res.body.error).toMatch(/no health records/i)
	})

	it("imported entries appear in GET /api/weight", async () => {
		const cookie = await registerAndLogin()
		const xml = buildAppleHealthXml([
			{
				type: "HKQuantityTypeIdentifierBodyMass",
				value: "82.3",
				startDate: "2026-03-01 07:30:00 -0500",
			},
		])

		await request(app)
			.post("/api/health/import")
			.set("Cookie", cookie)
			.attach("file", Buffer.from(xml), "export.xml")

		const weightRes = await request(app)
			.get("/api/weight")
			.set("Cookie", cookie)

		expect(weightRes.status).toBe(200)
		expect(weightRes.body.length).toBe(1)
		expect(weightRes.body[0].weightKg).toBeCloseTo(82.3, 0)
		expect(weightRes.body[0].source).toBe("apple_health")
	})

	it("handles mixed weight and step records in one file", async () => {
		const cookie = await registerAndLogin()
		const xml = buildAppleHealthXml([
			{
				type: "HKQuantityTypeIdentifierBodyMass",
				value: "78.0",
				startDate: "2026-01-10 08:00:00 -0500",
			},
			{
				type: "HKQuantityTypeIdentifierStepCount",
				value: "5000",
				startDate: "2026-01-10 12:00:00 -0500",
				unit: "count",
			},
			{
				type: "HKQuantityTypeIdentifierBodyMass",
				value: "77.5",
				startDate: "2026-01-11 08:00:00 -0500",
			},
		])

		const res = await request(app)
			.post("/api/health/import")
			.set("Cookie", cookie)
			.attach("file", Buffer.from(xml), "export.xml")

		expect(res.status).toBe(200)
		expect(res.body.weightEntriesImported).toBe(2)
		expect(res.body.stepRecordsSaved).toBe(1)
	})

	it("converts lb to kg when unit is lb", async () => {
		const cookie = await registerAndLogin()
		const xml = buildAppleHealthXml([
			{
				type: "HKQuantityTypeIdentifierBodyMass",
				value: "176.37",
				startDate: "2026-01-15 08:00:00 -0500",
				unit: "lb",
			},
		])

		const res = await request(app)
			.post("/api/health/import")
			.set("Cookie", cookie)
			.attach("file", Buffer.from(xml), "export.xml")

		expect(res.status).toBe(200)
		expect(res.body.weightEntriesImported).toBe(1)

		const weightRes = await request(app)
			.get("/api/weight")
			.set("Cookie", cookie)
		expect(weightRes.body[0].weightKg).toBeCloseTo(80.0, 0)
	})
})
