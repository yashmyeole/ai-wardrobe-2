import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  hashPassword,
  createUser,
  getUserByEmail,
  createToken,
  hashToken,
  storeSession,
} from "@/lib/auth-utils";

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  name: z.string().optional(),
  gender: z.enum(["M", "F"]),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password, name, gender } = registerSchema.parse(body);

    // Check if user already exists
    const existingUser = await getUserByEmail(email);
    if (existingUser) {
      return NextResponse.json(
        { error: "User already exists" },
        { status: 409 }
      );
    }

    // Hash password
    const passwordHash = await hashPassword(password);

    // Create user with gender
    const user = await createUser(email, passwordHash, name, gender);

    // Create token
    const token = createToken({
      userId: user.id,
      email: user.email,
    });

    // Store session
    const tokenHash = hashToken(token);
    const userAgent = request.headers.get("user-agent") || "";
    const ipAddress =
      request.headers.get("x-forwarded-for") ||
      request.headers.get("x-real-ip") ||
      "";

    await storeSession(user.id, tokenHash, ipAddress, userAgent);

    // Return user and token
    return NextResponse.json(
      {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          gender: user.gender,
        },
        token,
      },
      {
        status: 201,
        headers: {
          "Set-Cookie": `auth_token=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${
            7 * 24 * 60 * 60
          }`,
        },
      }
    );
  } catch (error: any) {
    if (error.name === "ZodError") {
      return NextResponse.json(
        { error: "Invalid input", details: error.errors },
        { status: 400 }
      );
    }

    console.error("Register error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
