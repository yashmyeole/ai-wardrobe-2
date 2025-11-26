// app/api/wardrobe/items/route.ts (no auth)
import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    // optional: allow query param ?limit=50
    const url = new URL(req.url);
    const limit = Math.min(Number(url.searchParams.get("limit") ?? "100"), 500);

    const sql = `
      SELECT id, user_id, image_url, category, style, season, colors, tags, status, created_at, updated_at
      FROM public.wardrobe_items
      ORDER BY created_at DESC
      LIMIT $1;
    `;
    const res = await query(sql, [limit]);
    const items = res && res.rows ? res.rows : [];

    return NextResponse.json({ items }, { status: 200 });
  } catch (err) {
    console.error("GET /api/wardrobe/items error", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
