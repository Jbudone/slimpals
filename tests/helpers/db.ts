import { drizzle } from "drizzle-orm/mysql2"
import { migrate } from "drizzle-orm/mysql2/migrator"
import mysql from "mysql2/promise"
import * as schema from "../../server/db/schema.js"
import { seedBadges, seedGymUpgrades } from "../../server/db/seed.js"

const TEST_DB_URL =
	process.env.TEST_DATABASE_URL ??
	"mysql://slimpals:slimpalspass@127.0.0.1:3307/slimpals_test"

let pool: mysql.Pool | null = null

export async function getTestDb() {
	if (!pool) {
		pool = mysql.createPool(TEST_DB_URL)
	}
	return drizzle(pool, { schema, mode: "default" })
}

export async function resetSchema() {
	if (!pool) {
		pool = mysql.createPool(TEST_DB_URL)
	}
	const conn = await pool.getConnection()
	try {
		const [tables] = await conn.query<mysql.RowDataPacket[]>(
			"SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()",
		)
		if (tables.length > 0) {
			await conn.query("SET FOREIGN_KEY_CHECKS = 0")
			for (const row of tables) {
				await conn.query(`DROP TABLE IF EXISTS \`${row.TABLE_NAME as string}\``)
			}
			await conn.query("SET FOREIGN_KEY_CHECKS = 1")
		}
	} finally {
		conn.release()
	}
	const db = await getTestDb()
	await migrate(db, { migrationsFolder: "./server/db/migrations" })
}

export async function truncateAll() {
	if (!pool) return
	const conn = await pool.getConnection()
	try {
		await conn.query("SET FOREIGN_KEY_CHECKS = 0")
		const tables = [
			"reactions",
			"social_posts",
			"tournament_participants",
			"tournaments",
			"user_gym_upgrades",
			"user_gyms",
			"user_badges",
			"daily_checkins",
			"user_challenges",
			"food_logs",
			"weight_entries",
			"step_records",
			"weekly_inspirations",
			"invites",
			"session",
			"account",
			"verification",
			"users",
			"badges",
			"gym_upgrades_catalog",
			"challenges",
		]
		for (const t of tables) {
			await conn.query(`TRUNCATE TABLE \`${t}\``)
		}
		await conn.query("SET FOREIGN_KEY_CHECKS = 1")
	} finally {
		conn.release()
	}
	const db = await getTestDb()
	await seedBadges(db)
	await seedGymUpgrades(db)
}

export async function closeTestDb() {
	if (pool) {
		await pool.end()
		pool = null
	}
}
