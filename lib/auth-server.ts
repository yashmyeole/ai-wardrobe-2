// lib/auth-server.ts
import { cookies } from "next/headers";
import { verifyToken, getUserById, verifySession, hashToken } from "./auth-utils";

export interface AuthUser {
  id: number;
  email: string;
  name: string | null;
}

export async function getAuthUser(): Promise<AuthUser | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("auth_token")?.value;

    if (!token) {
      return null;
    }

    const payload = verifyToken(token);
    if (!payload) {
      return null;
    }

    // Verify session exists in database
    const tokenHash = hashToken(token);
    const sessionExists = await verifySession(payload.userId, tokenHash);

    if (!sessionExists) {
      return null;
    }

    const user = await getUserById(payload.userId);
    return user || null;
  } catch {
    return null;
  }
}

export async function requireAuth() {
  const user = await getAuthUser();
  return user;
}
