// app/api/wardrobe/items/route.ts
import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    // Basic pagination / sorting
    const limit = Math.min(
      Number(url.searchParams.get("limit") ?? "100"),
      1000
    );
    const offset = Math.max(Number(url.searchParams.get("offset") ?? "0"), 0);
    const sort = (url.searchParams.get("sort") || "created_at").toLowerCase();
    const sortColumn = sort === "updated_at" ? "updated_at" : "created_at";
    const sortDir =
      (url.searchParams.get("dir") || "desc").toLowerCase() === "asc"
        ? "ASC"
        : "DESC";

    // Read filters
    const category = url.searchParams.get("category");
    const style = url.searchParams.get("style");
    const season = url.searchParams.get("season");
    const status = url.searchParams.get("status");
    const userId = url.searchParams.get("userId");
    const colorsParam = url.searchParams.get("colors"); // CSV e.g. red,blue
    const tagsParam = url.searchParams.get("tags"); // CSV e.g. favorite,wedding
    const q = url.searchParams.get("q"); // free-text search

    // Build dynamic WHERE clauses and parameter array
    const where: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (category) {
      where.push(`category = $${idx++}`);
      params.push(category);
    }

    if (style) {
      where.push(`style = $${idx++}`);
      params.push(style);
    }

    if (season) {
      where.push(`season = $${idx++}`);
      params.push(season);
    }

    if (status) {
      where.push(`status = $${idx++}`);
      params.push(status);
    }

    if (userId) {
      where.push(`user_id = $${idx++}`);
      params.push(userId);
    }

    // colors and tags are stored as jsonb arrays (e.g. '["red","blue"]')
    // We'll support comma-separated lists and test for "any of these" using jsonb ?| text[]
    // Example: colors ?| array['red','blue']
    if (colorsParam) {
      const arr = colorsParam
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      if (arr.length > 0) {
        where.push(`(colors ?| $${idx} )`);
        params.push(arr);
        idx++;
      }
    }

    if (tagsParam) {
      const arr = tagsParam
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      if (arr.length > 0) {
        where.push(`(tags ?| $${idx} )`);
        params.push(arr);
        idx++;
      }
    }

    // free-text q matches category, style, tags (text), colors (text)
    if (q) {
      // We'll use ILIKE on fields. To search tags/colors (jsonb) we cast to text.
      const like = `%${q}%`;
      where.push(
        `(category ILIKE $${idx} OR style ILIKE $${idx} OR tags::text ILIKE $${idx} OR colors::text ILIKE $${idx})`
      );
      params.push(like);
      idx++;
    }

    // Combine where clauses
    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const sql = `
      SELECT id, user_id, image_url, category, style, season, colors, tags, status, created_at, updated_at
      FROM public.wardrobe_items
      ${whereSql}
      ORDER BY ${sortColumn} ${sortDir}
      LIMIT $${idx++} OFFSET $${idx++};
    `;
    params.push(limit, offset);

    const res = await query(sql, params);
    const items = res && res.rows ? res.rows : [];

    return NextResponse.json({ items, count: items.length }, { status: 200 });
  } catch (err) {
    console.error("GET /api/wardrobe/items error", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
