// app/api/auth/me/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-middleware";

export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthContext(request);

    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    return NextResponse.json({
      user: auth.user,
    });
  } catch (error: any) {
    console.error("Me endpoint error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
