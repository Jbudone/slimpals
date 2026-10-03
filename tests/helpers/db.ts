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

/** Tables a test has written to: an auto-increment past 1, or (for tables
 * without one) at least one row. Everything else is still pristine, so
 * truncating it would only cost time. */
async function dirtyTables(conn: mysql.PoolConnection): Promise<string[]> {
	try {
		// MySQL caches table statistics for a day; we need them live
		await conn.query("SET SESSION information_schema_stats_expiry = 0")
	} catch {
		// engines without the cache (MariaDB) are always live
	}
	const [rows] = await conn.query<mysql.RowDataPacket[]>(
		`SELECT TABLE_NAME AS name, AUTO_INCREMENT AS ai
		 FROM information_schema.TABLES
		 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE'
		   AND TABLE_NAME <> '__drizzle_migrations'`,
	)
	const dirty: string[] = []
	for (const r of rows) {
		const name = r.name as string
		if (r.ai != null) {
			if (Number(r.ai) > 1) dirty.push(name)
			continue
		}
		const [has] = await conn.query<mysql.RowDataPacket[]>(
			`SELECT 1 FROM \`${name}\` LIMIT 1`,
		)
		if (has.length) dirty.push(name)
	}
	return dirty
}

/** True when every migration file is already recorded as applied. */
async function schemaIsCurrent(conn: mysql.PoolConnection): Promise<boolean> {
	try {
		const files = (await readdir("./server/db/migrations")).filter((f) =>
			f.endsWith(".sql"),
		)
		const [applied] = await conn.query<mysql.RowDataPacket[]>(
			"SELECT hash FROM `__drizzle_migrations`",
		)
		const have = new Set(applied.map((r) => r.hash as string))
		return files.every((f) => have.has(f.replace(".sql", "")))
	} catch {
		return false // no migrations table yet: a fresh database
	}
}

export async function resetSchema() {
	if (!pool) {
		pool = mysql.createPool(parseDbUrl(TEST_DB_URL))
	}
	const conn = await pool.getConnection()
	try {
		await conn.query("SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci")
		// The tables are already built (the usual case after the first file):
		// each test cleans up after itself, so keep them. A changed or new
		// migration file takes the full drop-and-rebuild below.
		if (await schemaIsCurrent(conn)) {
			// like a fresh schema: empty (the seeds come with truncateAll)
			const dirty = await dirtyTables(conn)
			if (dirty.length) {
				await conn.query("SET FOREIGN_KEY_CHECKS = 0")
				for (const t of dirty) await conn.query(`TRUNCATE TABLE \`${t}\``)
				await conn.query("SET FOREIGN_KEY_CHECKS = 1")
			}
			return
		}
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
		const dirty = await dirtyTables(conn)
		if (dirty.length) {
			await conn.query("SET FOREIGN_KEY_CHECKS = 0")
			for (const t of dirty) await conn.query(`TRUNCATE TABLE \`${t}\``)
			await conn.query("SET FOREIGN_KEY_CHECKS = 1")
		}
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
