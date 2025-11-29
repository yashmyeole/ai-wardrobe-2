// app/api/auth/logout/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-middleware";

export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthContext(request);
    
    // Even if not authenticated, clear the cookie
    const response = NextResponse.json(
      { message: "Logged out successfully" },
      { status: 200 }
    );

    response.cookies.set("auth_token", "", {
      path: "/",
      httpOnly: true,
      sameSite: "strict",
      maxAge: 0,
    });

    return response;
  } catch (error: any) {
    console.error("Logout error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
