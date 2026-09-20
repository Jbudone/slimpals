import { readdir, readFile } from "node:fs/promises"
import { join } from "node:path"
import { drizzle } from "drizzle-orm/mysql2"
import mysql from "mysql2/promise"
import * as schema from "../../server/db/schema.js"
import {
	seedBadges,
	seedGymClasses,
	seedGymUpgrades,
	seedNpcs,
} from "../../server/db/seed.js"

const TEST_DB_URL =
	process.env.TEST_DATABASE_URL ??
	"mysql://slimpals:slimpalspass@127.0.0.1:3307/slimpals_test"

function parseDbUrl(url: string) {
	const u = new URL(url)
	return {
		host: u.hostname,
		port: Number(u.port) || 3306,
		user: u.username,
		password: u.password,
		database: u.pathname.slice(1),
		charset: "utf8mb4",
	}
}

let pool: mysql.Pool | null = null

export async function getTestDb() {
	if (!pool) {
		pool = mysql.createPool(parseDbUrl(TEST_DB_URL))
	}
	return drizzle(pool, { schema, mode: "default" })
}

// Run migrations in autocommit mode (not inside a transaction) so that
// DDL with emoji ENUMs works correctly on MySQL 8.4.
async function runMigrationsInAutocommit(conn: mysql.PoolConnection) {
	const migrationsDir = "./server/db/migrations"
	const files = (await readdir(migrationsDir))
		.filter((f) => f.endsWith(".sql"))
		.sort()

	// Create __drizzle_migrations tracking table
	await conn.query(`CREATE TABLE IF NOT EXISTS \`__drizzle_migrations\` (
		id serial primary key,
		hash text not null,
		created_at bigint
	)`)

	// Check which have been applied (by filename/tag)
	const [applied] = await conn.query<mysql.RowDataPacket[]>(
		"SELECT hash FROM `__drizzle_migrations`",
	)
	const appliedHashes = new Set(applied.map((r) => r.hash as string))

	for (const file of files) {
		const sql = await readFile(join(migrationsDir, file), "utf8")
		// Compute a simple hash — just use the filename as a stable identifier
		const hash = file.replace(".sql", "")
		if (appliedHashes.has(hash)) continue

		// Split on statement breakpoints and run each statement individually
		const statements = sql
			.split("--> statement-breakpoint")
			.map((s) => s.trim())
			.filter(Boolean)

		for (const rawStmt of statements) {
			// Ensure CREATE TABLE statements use utf8mb4 so emoji ENUMs work
			let stmt = rawStmt
			if (/^\s*CREATE TABLE/i.test(stmt) && !/CHARACTER SET/i.test(stmt)) {
				stmt = stmt.replace(/\);\s*$/, ") CHARACTER SET utf8mb4;")
			}
			await conn.query(stmt)
		}

		await conn.query(
			"INSERT INTO `__drizzle_migrations` (hash, created_at) VALUES (?, ?)",
			[hash, Date.now()],
		)
	}
}

export async function resetSchema() {
	if (!pool) {
		pool = mysql.createPool(parseDbUrl(TEST_DB_URL))
	}
	const conn = await pool.getConnection()
	try {
		await conn.query("SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci")
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
		await runMigrationsInAutocommit(conn)
	} finally {
		conn.release()
	}
}

export async function truncateAll() {
	if (!pool) return
	const conn = await pool.getConnection()
	try {
		await conn.query("SET FOREIGN_KEY_CHECKS = 0")
		const tables = [
			"content_tuning_feedback",
			"reactions",
			"social_posts",
			"tournament_participants",
			"tournaments",
			"gym_npc_dialog_batches",
			"gym_npc_daily_state",
			"user_gym_npc_relationships",
			"user_gym_upgrades",
			"user_gyms",
			"user_badges",
			"daily_checkins",
			"user_challenges",
			"food_logs",
			"weight_entries",
			"step_records",
			"sprints",
			"weekly_inspirations",
			"invites",
			"session",
			"account",
			"verification",
			"users",
			"badges",
			"gym_npcs",
			"gym_upgrades_catalog",
			"gym_classes",
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
	await seedNpcs(db)
	await seedGymClasses(db)
}

export async function closeTestDb() {
	if (pool) {
		await pool.end()
		pool = null
	}
}
