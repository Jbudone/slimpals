import { eq } from "drizzle-orm"
import { db } from "../db/index.js"
import { users } from "../db/schema.js"

let warned = false

/**
 * Dev-only login bypass, e.g. for Codespaces where clicking through the
 * login form on every rebuild is friction. Gated hard on NODE_ENV so a
 * misconfigured env var can never skip auth in production.
 */
export async function getDevAutologinUser() {
	if (process.env.NODE_ENV === "production") return null
	const email = process.env.DEV_AUTOLOGIN_EMAIL
	if (!email) return null

	const [user] = await db.select().from(users).where(eq(users.email, email))
	if (!user && !warned) {
		warned = true
		console.error(
			`[dev-autologin] DEV_AUTOLOGIN_EMAIL=${email} but no user with that email exists — run \`npm run seed\` first, or point it at an existing account. Falling back to normal login.`,
		)
	}
	return user ?? null
}
