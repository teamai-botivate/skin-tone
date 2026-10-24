import { getDb } from "../db";
import { User } from "./types";
import { randomUUID } from "node:crypto";
import { normalizeEmail } from "./password";

export interface CreateUserData {
  name: string;
  email: string;
  passwordHash: string;
}

export async function getUserByEmail(email: string): Promise<(User & { passwordHash: string }) | null> {
  const normalized = normalizeEmail(email);
  const db = await getDb();
  const row = await db.get<{
    id: string;
    email: string;
    name: string;
    password_hash: string;
    created_at: string;
    updated_at: string;
  }>("SELECT id, email, name, password_hash, created_at, updated_at FROM users WHERE email = $1", [
    normalized,
  ]);

  if (!row) return null;

  return {
    id: row.id,
    email: row.email,
    name: row.name,
    passwordHash: row.password_hash,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getUserById(id: string): Promise<User | null> {
  const db = await getDb();
  const row = await db.get<{
    id: string;
    email: string;
    name: string;
    created_at: string;
    updated_at: string;
  }>("SELECT id, email, name, created_at, updated_at FROM users WHERE id = $1", [id]);

  if (!row) return null;

  return {
    id: row.id,
    email: row.email,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function createUser(data: CreateUserData): Promise<User> {
  const normalized = normalizeEmail(data.email);
  const id = randomUUID();
  const now = new Date().toISOString();

  const db = await getDb();
  await db.query(
    "INSERT INTO users (id, email, name, password_hash, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6)",
    [id, normalized, data.name.trim(), data.passwordHash, now, now],
  );

  return {
    id,
    email: normalized,
    name: data.name.trim(),
    createdAt: now,
    updatedAt: now,
  };
}
