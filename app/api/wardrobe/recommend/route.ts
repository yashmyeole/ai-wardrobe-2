// app/api/wardrobe/recommend/route.ts
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { query } from "@/lib/db";
import { getTextEmbedding } from "@/lib/embeddings";
import { getAuthContext } from "@/lib/auth-middleware";

const bodySchema = z.object({
  query: z.string().min(1),
  limit: z.number().int().min(1).max(50).optional().default(10),
});

function vectorLiteralFromArray(arr: number[]) {
  const numeric = arr.map((v) => Number(v) || 0);
  return `[${numeric.join(",")}]`;
}

// Define which categories are "complete outfits" (don't need other items)
const COMPLETE_OUTFIT_CATEGORIES = new Set([
  "dress",
  "kurta",
  "saree",
  "lehenga",
  "sherwani",
  "jumpsuit",
  "romper",
  "full_suit",
  "formal_suit",
]);

// Define category hierarchy for outfit building
const OUTFIT_PRIORITY = {
  shirt: 1,
  pants: 2,
  shoes: 3,
  dress: 10, // Complete outfit
  kurta: 10,
};

interface OutfitItem {
  id: string;
  imageUrl: string;
  description: string;
  category: string;
  style: string;
  season: string;
  colors: string[];
  tags: string[];
  score: number;
  distance: number;
}

interface CuratedOutfit {
  items: OutfitItem[];
  message: string;
  isComplete: boolean;
  totalScore: number;
}

/**
 * Curate an outfit by selecting the best items from search results
 * Returns only what's needed for the occasion
 */
function curateOutfit(items: OutfitItem[], userQuery: string): CuratedOutfit {
  if (items.length === 0) {
    return {
      items: [],
      message: `Sorry, there are no items in your wardrobe that match "${userQuery}". Try uploading more clothes or adjusting your search!`,
      isComplete: false,
      totalScore: 0,
    };
  }

  // Check if user is asking for traditional/ethnic wear
  const isTraditionalQuery =
    /traditional|indian|ethnic|kurta|saree|lehenga|sherwani/i.test(userQuery);

  // First: Look for complete outfit items (prioritize if query mentions them)
  const completeOutfitItems = items.filter((item) =>
    COMPLETE_OUTFIT_CATEGORIES.has(item.category.toLowerCase())
  );

  // If traditional wear is requested, prioritize those items
  if (isTraditionalQuery) {
    const traditionalCategories = new Set([
      "kurta",
      "saree",
      "lehenga",
      "sherwani",
    ]);
    const traditionalItems = completeOutfitItems.filter((item) =>
      traditionalCategories.has(item.category.toLowerCase())
    );

    if (traditionalItems.length > 0) {
      const bestTraditional = traditionalItems[0]; // Already sorted by distance/score
      if (bestTraditional.score >= 0.5) {
        return {
          items: [bestTraditional],
          message: `Perfect! This ${bestTraditional.category} is ideal for "${userQuery}". It's a complete traditional look!`,
          isComplete: true,
          totalScore: bestTraditional.score,
        };
      }
    }
  }

  // Otherwise, look for any complete outfit with high confidence
  const completeOutfitItem = completeOutfitItems.find(
    (item) => item.score >= 0.6
  );

  if (completeOutfitItem) {
    return {
      items: [completeOutfitItem],
      message: `Perfect! This ${completeOutfitItem.category} is ideal for "${userQuery}". It's a complete look by itself!`,
      isComplete: true,
      totalScore: completeOutfitItem.score,
    };
  }

  // Otherwise, build a complete outfit with shirt/pants/shoes
  const outfit: OutfitItem[] = [];
  const usedIndices = new Set<number>();

  // Priority categories to select
  const requiredCategories = ["shirt", "pants", "shoes"];

  // Try to find items for each required category
  for (const category of requiredCategories) {
    const candidateItems = items.filter(
      (item, idx) =>
        !usedIndices.has(idx) &&
        item.category.toLowerCase().includes(category.toLowerCase())
    );

    if (candidateItems.length > 0) {
      // Pick the best match for this category
      const bestMatch = candidateItems.reduce((prev, current) =>
        prev.score > current.score ? prev : current
      );
      outfit.push(bestMatch);
      usedIndices.add(items.indexOf(bestMatch));
    }
  }

  // Check if we found a complete outfit
  if (outfit.length === 3) {
    const totalScore = outfit.reduce((sum, item) => sum + item.score, 0) / 3;
    return {
      items: outfit,
      message: `Great! I've put together a ${outfit[0].style} outfit for "${userQuery}". Here's what I recommend:`,
      isComplete: true,
      totalScore,
    };
  }

  // If we couldn't find a complete outfit, return what we found
  if (outfit.length > 0) {
    const totalScore =
      outfit.reduce((sum, item) => sum + item.score, 0) / outfit.length;
    const missingItems = requiredCategories.filter(
      (cat) => !outfit.some((item) => item.category.toLowerCase().includes(cat))
    );

    return {
      items: outfit,
      message: `I found ${
        outfit.length
      } items that match "${userQuery}", but I'm missing ${missingItems.join(
        ", "
      )}. Here's what I have:`,
      isComplete: false,
      totalScore,
    };
  }

  // No items found at all
  return {
    items: [],
    message: `Sorry, I couldn't find suitable items in your wardrobe for "${userQuery}". Consider uploading more clothes!`,
    isComplete: false,
    totalScore: 0,
  };
}

export async function POST(req: NextRequest) {
  try {
    // Check authentication
    const auth = await getAuthContext(req);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

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

    let allItems: OutfitItem[] = [];

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
        WHERE embedding IS NOT NULL AND status = 'ready' AND user_id = $2
        ORDER BY distance ASC
        LIMIT $3;
      `;
      const params = [embLiteral, auth.userId, limit];
      const res = await query(sql, params);
      const rows = res && res.rows ? res.rows : [];

      allItems = rows.map((r: any) => {
        const distance = Number(r.distance ?? 1e9);
        const score = Math.exp(-distance);

        return {
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
          score,
          distance,
        };
      });
    } else {
      // Fallback: embedding unavailable — do a keyword search on description and metadata
      const kw = `%${userQuery}%`;
      const fallbackSql = `
        SELECT id, image_url, description, category, style, season, colors, tags
        FROM public.wardrobe_items
        WHERE status = 'ready' AND user_id = $1 AND (
          description ILIKE $2 
          OR category ILIKE $2 
          OR style ILIKE $2 
          OR tags::text ILIKE $2 
          OR colors::text ILIKE $2
        )
        ORDER BY created_at DESC
        LIMIT $3;
      `;
      const fallbackRes = await query(fallbackSql, [auth.userId, kw, limit]);
      const fallbackRows =
        fallbackRes && fallbackRes.rows ? fallbackRes.rows : [];

      allItems = fallbackRows.map((r: any, i: number) => ({
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
        score: 0.5 - i * 0.05,
        distance: 999,
      }));
    }

    // Curate the outfit intelligently
    const outfit = curateOutfit(allItems, userQuery);

    // Format response
    const recommendation = {
      outfit: {
        message: outfit.message,
        isComplete: outfit.isComplete,
        items: outfit.items.map((item) => ({
          id: item.id,
          imageUrl: item.imageUrl,
          description: item.description,
          category: item.category,
          style: item.style,
          season: item.season,
          colors: item.colors,
          tags: item.tags,
          matchScore: (item.score * 100).toFixed(1),
        })),
        averageScore: (outfit.totalScore * 100).toFixed(1),
      },
    };

    return NextResponse.json(recommendation, { status: 200 });
  } catch (err: any) {
    console.error("/api/wardrobe/recommend error", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
