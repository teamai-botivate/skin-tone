import { getDb, DatabaseClient } from "../db";
import { INITIAL_FREE_CREDITS, OperationType } from "./config";
import { logger } from "../logger";
import { randomUUID } from "node:crypto";

export interface CreditDeductionResult {
  success: boolean;
  error?: "INSUFFICIENT_CREDITS" | "USER_NOT_FOUND" | "CONCURRENCY_ERROR" | "ALREADY_PROCESSED";
  required?: number;
  available?: number;
  balance?: number;
  transactionId?: string;
}

export interface CreditLedgerEntry {
  id: string;
  userId: string;
  amount: number;
  balanceAfter: number;
  operationType: string;
  operationId: string | null;
  description: string;
  createdAt: string;
}

/**
 * Grants initial free credits to a user exactly once.
 * Thread-safe and idempotent: subsequent calls for the same user will be safely ignored.
 */
export async function grantInitialCredits(
  userId: string,
  amount: number = INITIAL_FREE_CREDITS,
): Promise<{ granted: boolean; balance: number }> {
  const db = await getDb();

  return await db.transaction(async (tx) => {
    // Check if initial grant has already been given to this user
    const existingGrant = await tx.get(
      "SELECT id FROM credit_transactions WHERE user_id = $1 AND operation_type = 'initial_grant'",
      [userId],
    );

    if (existingGrant) {
      const balanceRow = await tx.get<{ balance: number }>(
        "SELECT balance FROM credit_balances WHERE user_id = $1",
        [userId],
      );
      return { granted: false, balance: balanceRow?.balance ?? 0 };
    }

    const now = new Date().toISOString();
    const txId = randomUUID();

    // Check if a balance record already exists
    const existingBalance = await tx.get<{ balance: number }>(
      "SELECT balance FROM credit_balances WHERE user_id = $1",
      [userId],
    );

    const newBalance = (existingBalance?.balance ?? 0) + amount;

    if (existingBalance) {
      await tx.query(
        "UPDATE credit_balances SET balance = $1, updated_at = $2 WHERE user_id = $3",
        [newBalance, now, userId],
      );
    } else {
      await tx.query(
        "INSERT INTO credit_balances (user_id, balance, updated_at) VALUES ($1, $2, $3)",
        [userId, newBalance, now],
      );
    }

    // Record in immutable credit ledger
    await tx.query(
      "INSERT INTO credit_transactions (id, user_id, amount, balance_after, operation_type, operation_id, description, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
      [
        txId,
        userId,
        amount,
        newBalance,
        "initial_grant",
        null,
        `Welcome gift: ${amount} free credits`,
        now,
      ],
    );

    logger.info({ userId, amount, newBalance }, "Initial free credits granted");
    return { granted: true, balance: newBalance };
  });
}

/**
 * Retrieves the user's current verified credit balance from the database.
 */
export async function getCreditBalance(userId: string): Promise<number> {
  const db = await getDb();
  const row = await db.get<{ balance: number }>(
    "SELECT balance FROM credit_balances WHERE user_id = $1",
    [userId],
  );
  return row ? row.balance : 0;
}

/**
 * Retrieves the full credit transaction audit ledger for a user.
 */
export async function getCreditTransactions(
  userId: string,
  limit: number = 50,
): Promise<CreditLedgerEntry[]> {
  const db = await getDb();
  const rows = await db.query<any>(
    "SELECT id, user_id as \"userId\", amount, balance_after as \"balanceAfter\", operation_type as \"operationType\", operation_id as \"operationId\", description, created_at as \"createdAt\" FROM credit_transactions WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2",
    [userId, limit],
  );
  return rows.map((r) => ({
    id: r.id,
    userId: r.userId || r.user_id,
    amount: r.amount,
    balanceAfter: r.balanceAfter ?? r.balance_after,
    operationType: r.operationType || r.operation_type,
    operationId: r.operationId ?? r.operation_id,
    description: r.description,
    createdAt: r.createdAt || r.created_at,
  }));
}

/**
 * Atomically checks and reserves/deducts credits for an operation.
 * Guarantees that concurrent requests cannot overspend the balance or result in a negative balance.
 * Protects against duplicate retries via optional operationId.
 */
export async function deductCredits(
  userId: string,
  cost: number,
  operationType: OperationType,
  operationId?: string,
  description?: string,
): Promise<CreditDeductionResult> {
  if (cost <= 0) {
    const currentBalance = await getCreditBalance(userId);
    return { success: true, balance: currentBalance };
  }

  const db = await getDb();

  return await db.transaction(async (tx) => {
    // If an operationId is specified, check if this exact operation was already charged
    if (operationId) {
      const existingTx = await tx.get<{ id: string; balance_after: number }>(
        "SELECT id, balance_after FROM credit_transactions WHERE user_id = $1 AND operation_id = $2 AND operation_type = $3",
        [userId, operationId, operationType],
      );
      if (existingTx) {
        logger.warn(
          { userId, operationId, operationType },
          "Operation with this ID was already processed; skipping duplicate charge",
        );
        return {
          success: true,
          balance: existingTx.balance_after,
          transactionId: existingTx.id,
        };
      }
    }

    // Fetch current balance
    const balanceRow = await tx.get<{ balance: number }>(
      "SELECT balance FROM credit_balances WHERE user_id = $1",
      [userId],
    );

    if (!balanceRow) {
      return {
        success: false,
        error: "USER_NOT_FOUND",
        required: cost,
        available: 0,
      };
    }

    if (balanceRow.balance < cost) {
      return {
        success: false,
        error: "INSUFFICIENT_CREDITS",
        required: cost,
        available: balanceRow.balance,
      };
    }

    const now = new Date().toISOString();
    const newBalance = balanceRow.balance - cost;
    const txId = randomUUID();

    // Atomic update guarded by balance >= cost
    await tx.query(
      "UPDATE credit_balances SET balance = $1, updated_at = $2 WHERE user_id = $3 AND balance >= $4",
      [newBalance, now, userId, cost],
    );

    // Record deduction in the immutable ledger
    await tx.query(
      "INSERT INTO credit_transactions (id, user_id, amount, balance_after, operation_type, operation_id, description, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
      [
        txId,
        userId,
        -cost,
        newBalance,
        operationType,
        operationId || null,
        description || `Deduction for ${operationType} (${cost} credits)`,
        now,
      ],
    );

    logger.info(
      { userId, cost, newBalance, operationType, operationId },
      "Credits deducted successfully",
    );

    return {
      success: true,
      balance: newBalance,
      transactionId: txId,
    };
  });
}

/**
 * Atomically refunds credits when a paid AI operation fails.
 * Adds an audit entry in credit_transactions documenting the refund.
 */
export async function refundCredits(
  userId: string,
  cost: number,
  operationType: OperationType,
  operationId?: string,
  reason?: string,
): Promise<{ success: boolean; newBalance: number }> {
  if (cost <= 0) {
    const current = await getCreditBalance(userId);
    return { success: true, newBalance: current };
  }

  const db = await getDb();

  return await db.transaction(async (tx) => {
    const balanceRow = await tx.get<{ balance: number }>(
      "SELECT balance FROM credit_balances WHERE user_id = $1",
      [userId],
    );

    const currentBalance = balanceRow?.balance ?? 0;
    const newBalance = currentBalance + cost;
    const now = new Date().toISOString();
    const txId = randomUUID();

    await tx.query(
      "UPDATE credit_balances SET balance = $1, updated_at = $2 WHERE user_id = $3",
      [newBalance, now, userId],
    );

    const desc = reason
      ? `Refund for ${operationType}: ${reason}`
      : `Refund of ${cost} credits for failed ${operationType}`;

    await tx.query(
      "INSERT INTO credit_transactions (id, user_id, amount, balance_after, operation_type, operation_id, description, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
      [txId, userId, cost, newBalance, "refund", operationId || null, desc, now],
    );

    logger.info(
      { userId, cost, newBalance, operationType, reason },
      "Credits refunded successfully",
    );

    return { success: true, newBalance };
  });
}
