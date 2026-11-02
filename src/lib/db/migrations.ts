import { logger } from "../logger";
import type { DatabaseClient } from "./client";
import { SCHEMA_SQL } from "./schema";

/**
 * Background generation / Web Push tables. An earlier, abandoned implementation created
 * tables with these same names but different columns (e.g. generation_jobs.progress,
 * push_subscriptions.id). Because the schema uses CREATE TABLE IF NOT EXISTS, such a
 * table silently survives, the schema's indexes then fail, and every job insert errors.
 *
 * Only these feature tables are ever checked — core tables (users, sessions, credits)
 * are never touched.
 */
const FEATURE_TABLES = ["generation_jobs", "generation_job_images", "push_subscriptions"] as const;

/** Column names and index names for a table, read from the current schema itself. */
function expectedShape(table: string): { columns: string[]; indexes: string[] } {
  // Line endings follow the checkout (CRLF on Windows), so accept both
  const tableMatch = new RegExp(`CREATE TABLE IF NOT EXISTS ${table} \\(([\\s\\S]*?)\\r?\\n\\);`).exec(SCHEMA_SQL);
  const columns = (tableMatch?.[1] ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim().split(/\s+/)[0])
    // Column names are lowercase identifiers (e.g. p256dh); constraint lines start uppercase
    .filter((word) => word && /^[a-z_][a-z0-9_]*$/.test(word));
  const indexes = [...SCHEMA_SQL.matchAll(new RegExp(`CREATE INDEX IF NOT EXISTS (\\w+) ON ${table}\\(`, "g"))].map((m) => m[1]);
  return { columns, indexes };
}

async function existingColumns(db: DatabaseClient, dialect: "sqlite" | "postgres", table: string): Promise<string[]> {
  if (dialect === "sqlite") {
    const rows = await db.query<{ name: string }>(`PRAGMA table_info(${table})`);
    return rows.map((r) => r.name);
  }
  const rows = await db.query<{ column_name: string }>(
    "SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1",
    [table],
  );
  return rows.map((r) => r.column_name);
}

/**
 * Moves an incompatible feature table aside as `<table>_legacy_<timestamp>` (nothing is
 * deleted) so the schema can create the table it expects. Index names the schema needs
 * are freed: in SQLite named indexes keep their name after a table rename, so ours are
 * dropped from the legacy table (an index holds no data); in Postgres every index of the
 * legacy table, including primary-key/unique ones, is renamed with the same suffix.
 */
export async function retireIncompatibleFeatureTables(
  db: DatabaseClient,
  dialect: "sqlite" | "postgres",
): Promise<string[]> {
  const retired: string[] = [];
  for (const table of FEATURE_TABLES) {
    const columns = await existingColumns(db, dialect, table);
    if (columns.length === 0) continue; // table doesn't exist yet

    const expected = expectedShape(table);
    const compatible =
      expected.columns.length === columns.length && expected.columns.every((c) => columns.includes(c));
    if (compatible) continue;

    const suffix = `legacy_${Date.now()}`;
    const legacyName = `${table}_${suffix}`;
    await db.exec(`ALTER TABLE ${table} RENAME TO ${legacyName}`);

    if (dialect === "sqlite") {
      for (const index of expected.indexes) {
        await db.exec(`DROP INDEX IF EXISTS ${index}`);
      }
    } else {
      const indexes = await db.query<{ indexname: string }>(
        "SELECT indexname FROM pg_indexes WHERE schemaname = current_schema() AND tablename = $1",
        [legacyName],
      );
      for (const { indexname } of indexes) {
        // Postgres identifiers are limited to 63 characters
        const renamed = `${indexname}_${suffix}`.slice(-63);
        await db.exec(`ALTER INDEX "${indexname}" RENAME TO "${renamed}"`);
      }
    }

    logger.warn(
      { table, legacyTable: legacyName, found: columns, expected: expected.columns },
      "Moved incompatible table from an earlier implementation aside; recreating it with the current schema",
    );
    retired.push(legacyName);
  }
  return retired;
}
