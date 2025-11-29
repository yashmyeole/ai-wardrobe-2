// lib/auth-middleware.ts
import { NextRequest, NextResponse } from "next/server";
import { verifyToken, getUserById, verifySession, hashToken } from "./auth-utils";

export interface AuthContext {
  userId: number;
  email: string;
  user: any;
}

export async function getAuthContext(
  req: NextRequest
): Promise<AuthContext | null> {
  try {
    let token: string | null = null;

    // Try Authorization header first
    const authHeader = req.headers.get("authorization");
    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.substring(7);
    }

    // Fall back to cookie if no Authorization header
    if (!token) {
      token = req.cookies.get("auth_token")?.value || null;
    }

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
    if (!user) {
      return null;
    }

    return {
      userId: payload.userId,
      email: payload.email,
      user,
    };
  } catch {
    return null;
  }
}

export function requireAuth(fn: Function) {
  return async (req: NextRequest) => {
    const auth = await getAuthContext(req);
    if (!auth) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }
    return fn(req, auth);
  };
}
