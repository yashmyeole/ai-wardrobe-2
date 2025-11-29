// lib/auth-context.ts
export interface AuthContextType {
  userId: number;
  email: string;
  gender: "M" | "F";
  name: string | null;
}

const AUTH_STORAGE_KEY = "ai_wardrobe_auth";

export function saveAuthContext(auth: AuthContextType): void {
  if (typeof window !== "undefined") {
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(auth));
  }
}

export function getAuthContext(): AuthContextType | null {
  if (typeof window !== "undefined") {
    const stored = localStorage.getItem(AUTH_STORAGE_KEY);
    return stored ? JSON.parse(stored) : null;
  }
  return null;
}

export function clearAuthContext(): void {
  if (typeof window !== "undefined") {
    localStorage.removeItem(AUTH_STORAGE_KEY);
  }
}
