import request from "supertest"
import { describe, expect, it } from "vitest"

const { createApp } = await import("../../server/app.js")
const app = createApp()

describe("GET /api/health", () => {
	it("returns ok status with version info", async () => {
		const res = await request(app).get("/api/health")
		expect(res.status).toBe(200)
		expect(res.body.status).toBe("ok")
		expect(res.body).toHaveProperty("gitSha")
		expect(res.body).toHaveProperty("buildTime")
	})

	it("defaults version fields to dev when not set by the build", async () => {
		const res = await request(app).get("/api/health")
		// This suite runs outside the Docker build, so GIT_SHA/BUILD_TIME are unset.
		expect(res.body.gitSha).toBe("dev")
		expect(res.body.buildTime).toBe("dev")
	})
})
