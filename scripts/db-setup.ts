// Creates the hap_voice database (if needed) and applies the schema. Idempotent.
import "../lib/load-env" // must be first — populates process.env before anything reads it
import { Client } from "pg"
import { readFile } from "node:fs/promises"
import { join } from "node:path"

async function main() {
  const url = new URL(process.env.DATABASE_URL || "postgres://localhost:5432/hap_voice")
  const dbName = url.pathname.replace(/^\//, "") || "hap_voice"

  // 1. Ensure the database exists (connect to the server's default DB).
  const adminUrl = new URL(url.toString())
  adminUrl.pathname = "/postgres"
  const admin = new Client({ connectionString: adminUrl.toString() })
  await admin.connect()
  const exists = await admin.query(`SELECT 1 FROM pg_database WHERE datname = $1`, [dbName])
  if (exists.rowCount === 0) {
    console.log(`Creating database "${dbName}"…`)
    await admin.query(`CREATE DATABASE "${dbName}"`)
  } else {
    console.log(`Database "${dbName}" already exists.`)
  }
  await admin.end()

  // 2. Apply the schema.
  const schema = await readFile(join(process.cwd(), "db", "schema.sql"), "utf8")
  const db = new Client({ connectionString: url.toString() })
  await db.connect()
  await db.query(schema)
  await db.end()
  console.log("Schema applied. ✔")
}

main().catch((err) => {
  console.error("db:setup failed:", err.message)
  process.exit(1)
})
