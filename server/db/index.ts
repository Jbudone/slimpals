import { drizzle } from "drizzle-orm/mysql2"
import mysql from "mysql2/promise"
import * as schema from "./schema.js"

const pool = mysql.createPool(
	process.env.DATABASE_URL ??
		"mysql://slimpals:slimpals@localhost:3306/slimpals",
)

export const db = drizzle(pool, { schema, mode: "default" })
