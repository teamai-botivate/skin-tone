import { logger } from "../logger";
import path from "node:path";
import fs from "node:fs";

export interface DatabaseClient {
  query<T = any>(sql: string, params?: any[]): Promise<T[]>;
  get<T = any>(sql: string, params?: any[]): Promise<T | null>;
  exec(sql: string): Promise<void>;
  transaction<T>(fn: (tx: DatabaseClient) => Promise<T>): Promise<T>;
}

let dbInstance: DatabaseClient | null = null;
let initialized = false;

function normalizeSqlForSqlite(sql: string): string {
  // Convert $1, $2, etc. to ? for SQLite
  return sql.replace(/\$(\d+)/g, "?");
}

function getDatabaseConfig(): { isPostgres: boolean; url: string } {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL || "";
  const isPostgres = url.startsWith("postgres://") || url.startsWith("postgresql://");
  return { isPostgres, url };
}

async function createPostgresClient(connectionString: string): Promise<DatabaseClient> {
  const { Pool } = await import("pg");
  const pool = new Pool({
    connectionString,
    ssl: connectionString.includes("sslmode=disable")
      ? false
      : { rejectUnauthorized: false },
    max: 10,
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 30000,
  });

  const client: DatabaseClient = {
    async query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
      const res = await pool.query(sql, params);
      return res.rows as T[];
    },
    async get<T = any>(sql: string, params: any[] = []): Promise<T | null> {
      const res = await pool.query(sql, params);
      return (res.rows[0] as T) || null;
    },
    async exec(sql: string): Promise<void> {
      await pool.query(sql);
    },
    async transaction<T>(fn: (tx: DatabaseClient) => Promise<T>): Promise<T> {
      const conn = await pool.connect();
      const txClient: DatabaseClient = {
        async query<R = any>(sql: string, params: any[] = []): Promise<R[]> {
          const res = await conn.query(sql, params);
          return res.rows as R[];
        },
        async get<R = any>(sql: string, params: any[] = []): Promise<R | null> {
          const res = await conn.query(sql, params);
          return (res.rows[0] as R) || null;
        },
        async exec(sql: string): Promise<void> {
          await conn.query(sql);
        },
        async transaction<R>(_subFn: (tx: DatabaseClient) => Promise<R>): Promise<R> {
          throw new Error("Nested transactions are not supported");
        },
      };

      try {
        await conn.query("BEGIN");
        const result = await fn(txClient);
        await conn.query("COMMIT");
        return result;
      } catch (err) {
        await conn.query("ROLLBACK").catch(() => {});
        throw err;
      } finally {
        conn.release();
      }
    },
  };

  return client;
}

async function createSqliteClient(dbPath?: string): Promise<DatabaseClient> {
  const { DatabaseSync } = await import("node:sqlite");
  const resolvedPath = dbPath || path.resolve(process.cwd(), "letstyle.db");
  const sqlite = new DatabaseSync(resolvedPath);

  // Enable WAL mode and foreign keys for optimal performance and concurrency
  sqlite.exec("PRAGMA journal_mode = WAL;");
  sqlite.exec("PRAGMA foreign_keys = ON;");

  // Mutex to queue concurrent transactions on the SQLite connection
  let txLock = Promise.resolve();
  async function withTxLock<R>(fn: () => Promise<R>): Promise<R> {
    let release: () => void;
    const nextLock = new Promise<void>((resolve) => {
      release = resolve;
    });
    const prevLock = txLock;
    txLock = nextLock;

    await prevLock;
    try {
      return await fn();
    } finally {
      release!();
    }
  }

  const client: DatabaseClient = {
    async query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
      const normalizedSql = normalizeSqlForSqlite(sql);
      const stmt = sqlite.prepare(normalizedSql);
      return stmt.all(...params) as T[];
    },
    async get<T = any>(sql: string, params: any[] = []): Promise<T | null> {
      const normalizedSql = normalizeSqlForSqlite(sql);
      const stmt = sqlite.prepare(normalizedSql);
      const row = stmt.get(...params);
      return (row as T) || null;
    },
    async exec(sql: string): Promise<void> {
      sqlite.exec(sql);
    },
    async transaction<T>(fn: (tx: DatabaseClient) => Promise<T>): Promise<T> {
      return await withTxLock(async () => {
        sqlite.exec("BEGIN IMMEDIATE;");
        try {
          const result = await fn(client);
          sqlite.exec("COMMIT;");
          return result;
        } catch (err) {
          try {
            sqlite.exec("ROLLBACK;");
          } catch {
            // ignore
          }
          throw err;
        }
      });
    },
  };

  return client;
}

export async function getDb(): Promise<DatabaseClient> {
  if (dbInstance) {
    return dbInstance;
  }

  const { isPostgres, url } = getDatabaseConfig();

  if (isPostgres) {
    logger.info("Connecting to PostgreSQL database");
    dbInstance = await createPostgresClient(url);
  } else {
    const sqlitePath = process.env.SQLITE_DB_PATH || path.resolve(process.cwd(), "letstyle.db");
    logger.info({ sqlitePath }, "Using persistent SQLite database");
    dbInstance = await createSqliteClient(sqlitePath);
  }

  if (!initialized) {
    await initializeSchema(dbInstance);
    initialized = true;
  }

  return dbInstance;
}

async function initializeSchema(client: DatabaseClient): Promise<void> {
  try {
    const schemaFile = path.resolve(process.cwd(), "src/lib/db/schema.sql");
    if (fs.existsSync(schemaFile)) {
      const sql = fs.readFileSync(schemaFile, "utf-8");
      // Split on semicolons for SQLite execution safety
      const statements = sql
        .split(";")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);

      for (const statement of statements) {
        await client.exec(statement);
      }
      logger.info("Database schema initialized successfully");
    }
  } catch (err) {
    logger.error({ err }, "Failed to initialize database schema");
    throw err;
  }
}
