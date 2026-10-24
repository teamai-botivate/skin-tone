import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

async function runMigration() {
  console.log("==> Running LetStyle Database Migration...");
  const schemaPath = path.resolve(rootDir, "src/lib/db/schema.sql");
  const schemaSql = fs.readFileSync(schemaPath, "utf-8");

  const databaseUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;

  if (databaseUrl && (databaseUrl.startsWith("postgres://") || databaseUrl.startsWith("postgresql://"))) {
    console.log("==> Migrating PostgreSQL database:", databaseUrl.replace(/:[^:@]+@/, ":****@"));
    const { default: pg } = await import("pg");
    const pool = new pg.Pool({
      connectionString: databaseUrl,
      ssl: databaseUrl.includes("sslmode=disable") ? false : { rejectUnauthorized: false },
    });

    try {
      await pool.query(schemaSql);
      console.log("==> Migration successful! All PostgreSQL tables and indexes are up to date.");
    } catch (err) {
      console.error("==> Migration failed:", err);
      process.exit(1);
    } finally {
      await pool.end();
    }
  } else {
    const sqlitePath = process.env.SQLITE_DB_PATH || path.resolve(rootDir, "letstyle.db");
    console.log("==> Migrating persistent SQLite database at:", sqlitePath);
    const { DatabaseSync } = await import("node:sqlite");
    const db = new DatabaseSync(sqlitePath);
    db.exec("PRAGMA foreign_keys = ON;");

    const statements = schemaSql
      .split(";")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    for (const stmt of statements) {
      db.exec(stmt);
    }
    console.log("==> Migration successful! All SQLite tables and indexes are up to date.");
  }
}

runMigration().catch((err) => {
  console.error("Migration error:", err);
  process.exit(1);
});
