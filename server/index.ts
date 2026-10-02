import { createApp } from "./app.js"
import { db } from "./db/index.js"
import { GeminiAIService } from "./services/ai/index.js"
import { createAppScheduler } from "./services/scheduler/jobs.js"
import { isSchedulerEnabled } from "./services/scheduler/schedule.js"

const aiService = new GeminiAIService()
const scheduler = createAppScheduler(aiService, db)
const app = createApp({ aiService, scheduler })
const PORT = Number(process.env.PORT ?? 3000)

app.listen(PORT, () => {
	console.log(`Server running on http://localhost:${PORT}`)
	if (isSchedulerEnabled()) {
		scheduler.start()
	} else {
		console.log(
			"[scheduler] disabled (set SCHEDULER_ENABLED=1 to run scheduled jobs)",
		)
	}
})
