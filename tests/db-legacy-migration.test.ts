import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

// Reproduces "Could not start generation": a local database that already has
// generation_jobs / push_subscriptions tables from an earlier, abandoned implementation
// (DDL copied from a real affected letstyle.db). CREATE TABLE IF NOT EXISTS kept those
// tables, schema init failed on the lease_until index, and job inserts hit missing columns.
const dbFile = path.join(os.tmpdir(), `letstyle-legacy-${process.pid}-${Date.now()}.db`);
process.env.SQLITE_DB_PATH = dbFile;
delete process.env.DATABASE_URL;
delete process.env.POSTGRES_URL;

const legacy = new DatabaseSync(dbFile);
legacy.exec(`
CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL, password_hash TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
INSERT INTO users VALUES ('user-1', 'a@example.com', 'A', 'hash', '2026-01-01', '2026-01-01');
CREATE TABLE push_subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_push_sub_user ON push_subscriptions(user_id);
CREATE INDEX idx_push_sub_endpoint ON push_subscriptions(endpoint);
CREATE TABLE generation_jobs (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  progress INTEGER NOT NULL DEFAULT 0,
  step_label TEXT NOT NULL DEFAULT 'Initializing styling engine...',
  profile_json TEXT NOT NULL,
  context_json TEXT,
  recommendations_json TEXT,
  error_message TEXT,
  notification_sent INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT
);
CREATE INDEX idx_gen_jobs_user ON generation_jobs(user_id);
CREATE INDEX idx_generation_jobs_user ON generation_jobs(user_id, created_at);
INSERT INTO generation_jobs (id, user_id, profile_json, created_at, updated_at) VALUES ('old-job', 'user-1', '{}', '2026-01-01', '2026-01-01');
`);
legacy.close();

import { logger } from "../src/lib/logger";
import { getDb } from "../src/lib/db";
import { retireIncompatibleFeatureTables } from "../src/lib/db/migrations";
import { createGenerationJob, getGenerationJobForUser } from "../src/lib/generation-jobs";
import { savePushSubscription } from "../src/lib/push-notifications";
import type { SkinTuneProfile } from "../src/lib/skintune-schemas";
logger.level = "fatal";

console.log("======================================================================");
console.log("REGRESSION TEST: LEGACY BACKGROUND-JOB TABLES ON AN EXISTING DATABASE");
console.log("======================================================================");

const profile = {
  name: "A", pronouns: "she/her/women", gender: "female", ageGroup: "25–34", height: "", photoUrl: "", bodyPhotoUrl: "",
  appearance: { skinTone: "Medium", undertone: "Warm", confidence: 90, contrast: "Medium" }, bodyBuild: "", fit: "",
  style: [], colorsLove: [], colorsAvoid: [], restrictions: [], occasion: "Everyday", impression: [], budget: "", customStyleNotes: "",
} as SkinTuneProfile;

async function main() {
  console.log("\n[Test 1] Schema initializes on a database with incompatible legacy tables...");
  const db = await getDb();
  const tables = (await db.query<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")).map((r) => r.name);
  assert.ok(tables.includes("generation_job_images"), "Previously never created because init aborted");
  const legacyTables = tables.filter((t) => t.includes("_legacy_"));
  assert.equal(legacyTables.length, 2, `Both legacy tables moved aside, not deleted (${legacyTables.join(", ")})`);
  const jobColumns = (await db.query<{ name: string }>("PRAGMA table_info(generation_jobs)")).map((r) => r.name);
  assert.ok(jobColumns.includes("stage") && jobColumns.includes("lease_owner"), "Current generation_jobs layout");
  const legacyJobs = legacyTables.find((t) => t.startsWith("generation_jobs_legacy_"))!;
  assert.equal((await db.get<{ n: number }>(`SELECT count(*) AS n FROM ${legacyJobs}`))?.n, 1, "Legacy rows preserved");
  assert.equal((await db.get<{ n: number }>("SELECT count(*) AS n FROM users"))?.n, 1, "Core tables untouched");
  console.log("✓ Test 1 Passed");

  console.log("\n[Test 2] Starting a generation now works (was: 'Could not start generation')...");
  const job = await createGenerationJob("user-1", { profile, context: { occasion: "Everyday", details: "" } });
  assert.equal(job.status, "pending");
  assert.equal((await getGenerationJobForUser(job.id, "user-1"))?.stage, "queued");
  await savePushSubscription("user-1", { endpoint: "https://push.example.test/device", keys: { p256dh: "p", auth: "a" } }, null);
  await savePushSubscription("user-1", { endpoint: "https://push.example.test/device", keys: { p256dh: "p2", auth: "a2" } }, null);
  assert.equal((await db.get<{ n: number }>("SELECT count(*) AS n FROM push_subscriptions"))?.n, 1, "Upsert by endpoint works on the new table");
  console.log("✓ Test 2 Passed");

  console.log("\n[Test 3] The migration is idempotent and never touches compatible tables...");
  assert.deepEqual(await retireIncompatibleFeatureTables(db, "sqlite"), []);
  assert.equal((await getGenerationJobForUser(job.id, "user-1"))?.id, job.id, "New job still there");
  console.log("✓ Test 3 Passed");

  console.log("\n======================================================================");
  console.log("LEGACY TABLE MIGRATION TESTS PASSED");
  console.log("======================================================================");
}

main()
  .then(
    () => 0,
    (err) => {
      console.error("\n✗ TEST FAILED:", err);
      return 1;
    },
  )
  .then((code) => {
    for (const suffix of ["", "-wal", "-shm"]) {
      try {
        fs.rmSync(dbFile + suffix, { force: true });
      } catch {
        // SQLite may still hold the file on Windows; it lives in the OS temp dir.
      }
    }
    process.exit(code);
  });
