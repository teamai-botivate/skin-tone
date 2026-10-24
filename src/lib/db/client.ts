import { logger } from "../logger";
import path from "node:path";
import { getParsedSchemaStatements } from "./schema";

export interface DatabaseClient {
  query<T = any>(sql: string, params?: any[]): Promise<T[]>;
  get<T = any>(sql: string, params?: any[]): Promise<T | null>;
  exec(sql: string): Promise<void>;
  transaction<T>(fn: (tx: DatabaseClient) => Promise<T>): Promise<T>;
}

interface MemoryDbState {
  users: Map<string, { id: string; email: string; name: string; password_hash: string; created_at: string; updated_at: string }>;
  creditBalances: Map<string, { user_id: string; balance: number; updated_at: string }>;
  creditTransactions: Array<{
    id: string;
    user_id: string;
    amount: number;
    balance_after: number;
    operation_type: string;
    operation_id: string | null;
    description: string;
    created_at: string;
  }>;
  userSessions: Map<string, { id: string; user_id: string; expires_at: string; created_at: string }>;
  rateLimits: Map<string, { key: string; attempts: number; locked_until: string | null; updated_at: string }>;
}

declare global {
  // eslint-disable-next-line no-var
  var _letstyle_db: DatabaseClient | undefined;
  // eslint-disable-next-line no-var
  var _letstyle_db_init_promise: Promise<void> | undefined;
  // eslint-disable-next-line no-var
  var _letstyle_memory_state: MemoryDbState | undefined;
}

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
  let resolvedPath = dbPath;
  if (!resolvedPath) {
    if (process.env.SQLITE_DB_PATH) {
      resolvedPath = process.env.SQLITE_DB_PATH;
    } else if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
      resolvedPath = "/tmp/letstyle.db";
    } else {
      resolvedPath = path.resolve(process.cwd(), "letstyle.db");
    }
  }

  const sqlite = new DatabaseSync(resolvedPath);

  // Enable WAL mode, busy timeout, synchronous mode, and foreign keys for optimal performance and concurrency
  sqlite.exec("PRAGMA journal_mode = WAL;");
  sqlite.exec("PRAGMA busy_timeout = 10000;");
  sqlite.exec("PRAGMA synchronous = NORMAL;");
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

function getMemoryState(): MemoryDbState {
  if (!globalThis._letstyle_memory_state) {
    globalThis._letstyle_memory_state = {
      users: new Map(),
      creditBalances: new Map(),
      creditTransactions: [],
      userSessions: new Map(),
      rateLimits: new Map(),
    };
  }
  return globalThis._letstyle_memory_state;
}

function createMemoryClient(): DatabaseClient {
  logger.warn("Using in-memory database client fallback");

  function executeSql(sql: string, params: any[] = []): any[] {
    const state = getMemoryState();
    const cleanSql = sql.trim().replace(/\s+/g, " ");

    // users - lookup by email
    if (cleanSql.includes("FROM users WHERE email =")) {
      const email = String(params[0] ?? "").toLowerCase().trim();
      for (const u of state.users.values()) {
        if (u.email.toLowerCase() === email) {
          return [u];
        }
      }
      return [];
    }

    // users - lookup by id
    if (cleanSql.includes("FROM users WHERE id =")) {
      const id = String(params[0] ?? "");
      const user = state.users.get(id);
      return user ? [user] : [];
    }

    // users - insert
    if (cleanSql.startsWith("INSERT INTO users")) {
      const [id, email, name, passwordHash, createdAt, updatedAt] = params;
      const normalizedEmail = String(email).toLowerCase().trim();
      for (const u of state.users.values()) {
        if (u.email.toLowerCase() === normalizedEmail) {
          throw new Error("UNIQUE constraint failed: users.email");
        }
      }
      state.users.set(id, {
        id,
        email: normalizedEmail,
        name,
        password_hash: passwordHash,
        created_at: createdAt,
        updated_at: updatedAt,
      });
      return [];
    }

    // credit_balances - select
    if (cleanSql.includes("FROM credit_balances WHERE user_id =")) {
      const userId = String(params[0] ?? "");
      const bal = state.creditBalances.get(userId);
      return bal ? [{ balance: bal.balance }] : [];
    }

    // credit_balances - insert
    if (cleanSql.startsWith("INSERT INTO credit_balances")) {
      const [userId, balance, updatedAt] = params;
      state.creditBalances.set(userId, {
        user_id: userId,
        balance: Number(balance),
        updated_at: updatedAt,
      });
      return [];
    }

    // credit_balances - update with balance check
    if (cleanSql.startsWith("UPDATE credit_balances SET balance =") && cleanSql.includes("balance >=")) {
      const [newBalance, updatedAt, userId, cost] = params;
      const bal = state.creditBalances.get(userId);
      if (bal && bal.balance >= Number(cost)) {
        bal.balance = Number(newBalance);
        bal.updated_at = updatedAt;
      }
      return [];
    }

    // credit_balances - simple update
    if (cleanSql.startsWith("UPDATE credit_balances SET balance =")) {
      const [newBalance, updatedAt, userId] = params;
      const bal = state.creditBalances.get(userId);
      if (bal) {
        bal.balance = Number(newBalance);
        bal.updated_at = updatedAt;
      }
      return [];
    }

    // credit_transactions - initial grant check
    if (cleanSql.includes("FROM credit_transactions") && cleanSql.includes("operation_type = 'initial_grant'")) {
      const userId = String(params[0] ?? "");
      const tx = state.creditTransactions.find(
        (t) => t.user_id === userId && t.operation_type === "initial_grant",
      );
      return tx ? [{ id: tx.id }] : [];
    }

    // credit_transactions - duplicate operation check
    if (cleanSql.includes("FROM credit_transactions") && cleanSql.includes("operation_id =") && cleanSql.includes("operation_type =")) {
      const [userId, opId, opType] = params;
      const tx = state.creditTransactions.find(
        (t) => t.user_id === userId && t.operation_id === opId && t.operation_type === opType,
      );
      return tx ? [{ id: tx.id, balance_after: tx.balance_after }] : [];
    }

    // credit_transactions - list history
    if (cleanSql.includes("FROM credit_transactions WHERE user_id =") && cleanSql.includes("ORDER BY created_at DESC")) {
      const userId = String(params[0] ?? "");
      const limit = Number(params[1]) || 50;
      const list = state.creditTransactions
        .filter((t) => t.user_id === userId)
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, limit);
      return list;
    }

    // credit_transactions - insert
    if (cleanSql.startsWith("INSERT INTO credit_transactions")) {
      const [id, userId, amount, balanceAfter, opType, opId, desc, createdAt] = params;
      state.creditTransactions.push({
        id,
        user_id: userId,
        amount: Number(amount),
        balance_after: Number(balanceAfter),
        operation_type: opType,
        operation_id: opId,
        description: desc,
        created_at: createdAt,
      });
      return [];
    }

    // user_sessions - insert
    if (cleanSql.startsWith("INSERT INTO user_sessions")) {
      const [token, userId, expiresAt, createdAt] = params;
      state.userSessions.set(token, {
        id: token,
        user_id: userId,
        expires_at: expiresAt,
        created_at: createdAt,
      });
      return [];
    }

    // user_sessions - select
    if (cleanSql.includes("FROM user_sessions WHERE id =")) {
      const token = String(params[0] ?? "");
      const session = state.userSessions.get(token);
      return session ? [session] : [];
    }

    // user_sessions - delete
    if (cleanSql.startsWith("DELETE FROM user_sessions WHERE id =")) {
      const token = String(params[0] ?? "");
      state.userSessions.delete(token);
      return [];
    }

    // auth_rate_limits - select
    if (cleanSql.includes("FROM auth_rate_limits WHERE key =")) {
      const key = String(params[0] ?? "");
      const rl = state.rateLimits.get(key);
      return rl ? [rl] : [];
    }

    // auth_rate_limits - insert
    if (cleanSql.startsWith("INSERT INTO auth_rate_limits")) {
      const [key, attempts, lockedUntil, updatedAt] = params;
      state.rateLimits.set(key, {
        key,
        attempts: Number(attempts),
        locked_until: lockedUntil,
        updated_at: updatedAt,
      });
      return [];
    }

    // auth_rate_limits - update
    if (cleanSql.startsWith("UPDATE auth_rate_limits SET")) {
      const [attempts, lockedUntil, updatedAt, key] = params;
      const rl = state.rateLimits.get(key);
      if (rl) {
        rl.attempts = Number(attempts);
        rl.locked_until = lockedUntil;
        rl.updated_at = updatedAt;
      }
      return [];
    }

    // auth_rate_limits - delete
    if (cleanSql.startsWith("DELETE FROM auth_rate_limits WHERE key =")) {
      const key = String(params[0] ?? "");
      state.rateLimits.delete(key);
      return [];
    }

    // For any DDL (CREATE TABLE, INDEX, PRAGMA)
    return [];
  }

  const client: DatabaseClient = {
    async query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
      return executeSql(sql, params) as T[];
    },
    async get<T = any>(sql: string, params: any[] = []): Promise<T | null> {
      const rows = executeSql(sql, params);
      return (rows[0] as T) || null;
    },
    async exec(sql: string): Promise<void> {
      executeSql(sql);
    },
    async transaction<T>(fn: (tx: DatabaseClient) => Promise<T>): Promise<T> {
      return await fn(client);
    },
  };

  return client;
}

export async function getDb(): Promise<DatabaseClient> {
  if (globalThis._letstyle_db) {
    if (globalThis._letstyle_db_init_promise) {
      await globalThis._letstyle_db_init_promise;
    }
    return globalThis._letstyle_db;
  }

  const { isPostgres, url } = getDatabaseConfig();

  let client: DatabaseClient;
  if (isPostgres) {
    logger.info("Connecting to PostgreSQL database");
    client = await createPostgresClient(url);
  } else {
    try {
      const sqlitePath =
        process.env.SQLITE_DB_PATH ||
        (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME
          ? "/tmp/letstyle.db"
          : path.resolve(process.cwd(), "letstyle.db"));
      logger.info({ sqlitePath }, "Using persistent SQLite database");
      client = await createSqliteClient(sqlitePath);
    } catch (sqliteErr) {
      logger.warn({ sqliteErr }, "SQLite unavailable; falling back to in-memory store");
      client = createMemoryClient();
    }
  }

  globalThis._letstyle_db = client;

  if (!globalThis._letstyle_db_init_promise) {
    globalThis._letstyle_db_init_promise = initializeSchema(client).catch((err) => {
      globalThis._letstyle_db_init_promise = undefined;
      throw err;
    });
  }

  await globalThis._letstyle_db_init_promise;

  return client;
}

async function initializeSchema(client: DatabaseClient): Promise<void> {
  try {
    const statements = getParsedSchemaStatements();
    for (const statement of statements) {
      await client.exec(statement);
    }
    logger.info("Database schema initialized successfully");
  } catch (err) {
    logger.error({ err }, "Failed to initialize database schema");
    throw err;
  }
}
