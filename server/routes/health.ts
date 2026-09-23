import { Router } from "express"

export const healthRouter = Router()

healthRouter.get("/health", (_req, res) => {
	res.json({
		status: "ok",
		gitSha: process.env.GIT_SHA ?? "dev",
		buildTime: process.env.BUILD_TIME ?? "dev",
	})
})
