import { betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { eq } from "drizzle-orm"
import { db } from "./db/index.js"
import {
	accounts,
	invites,
	sessions,
	users,
	verifications,
} from "./db/schema.js"

// Stores validated invite records while a registration request is in-flight.
// Keyed by email; cleared in the user.create.after hook once the user is created.
export const pendingInvites = new Map<string, { id: number; code: string }>()

export const auth = betterAuth({
	secret: process.env.BETTER_AUTH_SECRET ?? "dev-secret-please-change",
	baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
	basePath: "/api/auth",
	// Allow requests from the Vite dev server and any configured frontend URL
	trustedOrigins: [
		process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
		process.env.FRONTEND_URL ?? "http://localhost:5173",
		"http://localhost:5174",
	],
	database: drizzleAdapter(db, {
		provider: "mysql",
		schema: {
			user: users,
			session: sessions,
			account: accounts,
			verification: verifications,
		},
	}),
	emailAndPassword: {
		enabled: true,
	},
	databaseHooks: {
		user: {
			create: {
				async after(user) {
					const invite = pendingInvites.get(user.email)
					if (!invite) return
					pendingInvites.delete(user.email)
					await db
						.update(invites)
						.set({ usedByUserId: user.id })
						.where(eq(invites.id, invite.id))
				},
			},
		},
	},
})

export type Auth = typeof auth
