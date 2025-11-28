// app/api/wardrobe/recommend/route.ts
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { query } from "@/lib/db";
import { getTextEmbedding } from "@/lib/embeddings";

const bodySchema = z.object({
  query: z.string().min(1),
  limit: z.number().int().min(1).max(50).optional().default(3),
});

function vectorLiteralFromArray(arr: number[]) {
  const numeric = arr.map((v) => Number(v) || 0);
  return `[${numeric.join(",")}]`;
}

export async function POST(req: NextRequest) {
  try {
    const raw = await req.json().catch(() => ({}));
    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.format() },
        { status: 400 }
      );
    }
    const { query: userQuery, limit } = parsed.data;

    // Generate embedding from user query using the same method as descriptions
    let embedding: number[] | null = null;
    try {
      embedding = await getTextEmbedding(userQuery);
      if (!Array.isArray(embedding) || embedding.length === 0) {
        embedding = null;
      }
    } catch (err) {
      console.warn(
        "Query embedding failed, falling back to keyword search",
        err
      );
      embedding = null;
    }

    // If we have an embedding, run similarity search on item descriptions
    if (embedding) {
      const embLiteral = vectorLiteralFromArray(embedding);

      // Query: compute L2 distance via <-> operator between user query embedding and item description embeddings
      const sql = `
        SELECT
          id,
          image_url,
          description,
          category,
          style,
          season,
          colors,
          tags,
          (embedding <-> $1::vector) AS distance
        FROM public.wardrobe_items
        WHERE embedding IS NOT NULL AND status = 'ready'
        ORDER BY distance ASC
        LIMIT $2;
      `;
      const params = [embLiteral, limit];
      const res = await query(sql, params);
      const rows = res && res.rows ? res.rows : [];

      const recommendations = rows.map((r: any) => {
        const distance = Number(r.distance ?? 1e9);
        // Normalize distance to similarity score (0-1, higher is better)
        const score = Math.exp(-distance);
        const explanation = `Matches your request "${userQuery}". Item description: "${r.description?.substring(
          0,
          100
        )}..."`;

        return {
          item: {
            id: String(r.id),
            imageUrl: r.image_url,
            description: r.description,
            category: r.category,
            style: r.style,
            season: r.season,
            colors: Array.isArray(r.colors)
              ? r.colors
              : r.colors
              ? JSON.parse(r.colors)
              : [],
            tags: Array.isArray(r.tags)
              ? r.tags
              : r.tags
              ? JSON.parse(r.tags)
              : [],
          },
          explanation,
          score,
        };
      });

      return NextResponse.json({ recommendations }, { status: 200 });
    }

    // Fallback: embedding unavailable — do a keyword search on description and metadata
    const kw = `%${userQuery}%`;
    const fallbackSql = `
      SELECT id, image_url, description, category, style, season, colors, tags
      FROM public.wardrobe_items
      WHERE status = 'ready' AND (
        description ILIKE $1 
        OR category ILIKE $1 
        OR style ILIKE $1 
        OR tags::text ILIKE $1 
        OR colors::text ILIKE $1
      )
      ORDER BY created_at DESC
      LIMIT $2;
    `;
    const fallbackRes = await query(fallbackSql, [kw, limit]);
    const fallbackRows =
      fallbackRes && fallbackRes.rows ? fallbackRes.rows : [];

    const fallbackRecs = fallbackRows.map((r: any, i: number) => ({
      item: {
        id: String(r.id),
        imageUrl: r.image_url,
        description: r.description,
        category: r.category,
        style: r.style,
        season: r.season,
        colors: Array.isArray(r.colors)
          ? r.colors
          : r.colors
          ? JSON.parse(r.colors)
          : [],
        tags: Array.isArray(r.tags) ? r.tags : r.tags ? JSON.parse(r.tags) : [],
      },
      explanation: `Keyword match for "${userQuery}" in item description and metadata.`,
      score: 0.5 - i * 0.05,
    }));

    return NextResponse.json(
      { recommendations: fallbackRecs },
      { status: 200 }
    );
  } catch (err: any) {
    console.error("/api/wardrobe/recommend error", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
