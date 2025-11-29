// lib/auth-utils.ts
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { query } from "./db";

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key-change-this";
const TOKEN_EXPIRY = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds

export interface User {
  id: number;
  email: string;
  name: string | null;
  gender: "M" | "F";
}

export interface AuthPayload {
  userId: number;
  email: string;
}

// Hash password
export async function hashPassword(password: string): Promise<string> {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
}

// Compare password with hash
export async function comparePassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// Create JWT token
export function createToken(payload: AuthPayload): string {
  const header = {
    alg: "HS256",
    typ: "JWT",
  };

  const now = Math.floor(Date.now() / 1000);
  const tokenPayload = {
    ...payload,
    iat: now,
    exp: now + TOKEN_EXPIRY / 1000,
  };

  const headerB64 = Buffer.from(JSON.stringify(header)).toString("base64url");
  const payloadB64 = Buffer.from(JSON.stringify(tokenPayload)).toString(
    "base64url"
  );

  const signature = crypto
    .createHmac("sha256", JWT_SECRET)
    .update(`${headerB64}.${payloadB64}`)
    .digest("base64url");

  return `${headerB64}.${payloadB64}.${signature}`;
}

// Verify JWT token
export function verifyToken(token: string): AuthPayload | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;

    const [headerB64, payloadB64, signatureB64] = parts;

    // Verify signature
    const expectedSignature = crypto
      .createHmac("sha256", JWT_SECRET)
      .update(`${headerB64}.${payloadB64}`)
      .digest("base64url");

    if (signatureB64 !== expectedSignature) {
      return null;
    }

    // Decode and verify payload
    const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString());

    const now = Math.floor(Date.now() / 1000);
    if (payload.exp < now) {
      return null;
    }

    return {
      userId: payload.userId,
      email: payload.email,
    };
  } catch {
    return null;
  }
}

// Get user by email
export async function getUserByEmail(email: string): Promise<User | null> {
  const result = await query(
    "SELECT id, email, name, gender FROM public.users WHERE email = $1",
    [email]
  );
  return result.rows[0] || null;
}

// Get user by ID
export async function getUserById(id: number): Promise<User | null> {
  const result = await query(
    "SELECT id, email, name, gender FROM public.users WHERE id = $1",
    [id]
  );
  return result.rows[0] || null;
}

// Create user
export async function createUser(
  email: string,
  passwordHash: string,
  name?: string,
  gender?: "M" | "F"
): Promise<User> {
  const result = await query(
    "INSERT INTO public.users (email, password_hash, name, gender) VALUES ($1, $2, $3, $4) RETURNING id, email, name, gender",
    [email, passwordHash, name || null, gender || "M"]
  );
  return result.rows[0];
}

// Store session token
export async function storeSession(
  userId: number,
  tokenHash: string,
  ipAddress?: string,
  userAgent?: string
): Promise<void> {
  const expiresAt = new Date(Date.now() + TOKEN_EXPIRY);
  await query(
    "INSERT INTO public.sessions (user_id, token_hash, expires_at, ip_address, user_agent) VALUES ($1, $2, $3, $4, $5)",
    [userId, tokenHash, expiresAt, ipAddress || null, userAgent || null]
  );
}

// Verify session exists
export async function verifySession(
  userId: number,
  tokenHash: string
): Promise<boolean> {
  const result = await query(
    "SELECT id FROM public.sessions WHERE user_id = $1 AND token_hash = $2 AND expires_at > NOW()",
    [userId, tokenHash]
  );
  return result.rows.length > 0;
}

// Hash token for storage
export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

// Verify user credentials
export async function verifyCredentials(
  email: string,
  password: string
): Promise<User | null> {
  try {
    const result = await query(
      "SELECT id, email, name, gender, password_hash FROM public.users WHERE email = $1",
      [email]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const user = result.rows[0];
    const isValidPassword = await comparePassword(password, user.password_hash);

    if (!isValidPassword) {
      return null;
    }

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      gender: user.gender,
    };
  } catch {
    return null;
  }
}
