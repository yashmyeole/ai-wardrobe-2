// app/api/wardrobe/recommend/route.ts
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { query } from "@/lib/db";
import { getTextEmbedding } from "@/lib/embeddings";
import { getAuthContext } from "@/lib/auth-middleware";

// OpenAI client for validation
function getOpenAIClient() {
  const { OpenAI } = require("openai");
  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });
}

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
 * Use AI to validate and score outfit matches against user's intent
 * This ensures the recommendations are truly aligned with what the user wants
 */
async function validateOutfitMatches(
  userQuery: string,
  items: OutfitItem[]
): Promise<OutfitItem[]> {
  if (items.length === 0) return items;

  try {
    const openai = getOpenAIClient();

    // Build item descriptions for validation
    const itemsList = items
      .map(
        (item, idx) =>
          `${idx + 1}. ${item.category.toUpperCase()}: ${item.description}`
      )
      .join("\n");

    const validationPrompt = `You are an expert fashion stylist validating outfit recommendations.

User's request: "${userQuery}"

Available clothing items:
${itemsList}

Analyze each item and provide a confidence score (0-100) indicating how well it matches the user's request.
Consider:
1. Occasion appropriateness (formal, casual, traditional, etc.)
2. Season/weather suitability
3. Style compatibility
4. Color and fabric appropriateness
5. Cultural context (traditional vs western wear)

CRITICAL: Be strict - only high confidence (70+) for true matches. Reject items that don't fit the user's intent.

Format your response as ONLY a JSON array with no markdown or extra text:
[
  {"index": 1, "confidence": 85, "reason": "Perfect formal blue shirt for office meetings"},
  {"index": 2, "confidence": 42, "reason": "Wrong occasion - too casual for formal event"},
  ...
]`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "user",
          content: validationPrompt,
        },
      ],
      max_tokens: 1000,
      temperature: 0.3, // Lower temp for consistency
    });

    const responseText = response.choices?.[0]?.message?.content || "[]";
    const scores = JSON.parse(responseText);

    // Apply confidence scores and filter low-confidence matches
    const validatedItems = items
      .map((item, idx) => {
        const scoreData = scores.find((s: any) => s.index === idx + 1);
        const confidence = scoreData?.confidence || 0;
        return {
          ...item,
          confidence,
          validationReason: scoreData?.reason || "",
        };
      })
      .filter((item: any) => item.confidence >= 65) // Only keep 65+ confidence
      .sort((a: any, b: any) => b.confidence - a.confidence); // Sort by confidence desc

    return validatedItems;
  } catch (error) {
    console.warn("AI validation failed, using all items:", error);
    return items; // Fall back to unvalidated items
  }
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

    // Step 1: Use AI to validate items match the user's intent
    // This filters out items that don't truly fit what the user is looking for
    const validatedItems = await validateOutfitMatches(userQuery, allItems);

    if (validatedItems.length === 0) {
      // If validation filtered out everything, provide helpful feedback
      return NextResponse.json(
        {
          outfit: {
            message: `I couldn't find items in your wardrobe that confidently match "${userQuery}". Try being more specific about the occasion, style, or occasion (e.g., "formal blue shirt for a wedding" or "casual summer dress").`,
            isComplete: false,
            items: [],
            averageScore: "0",
          },
        },
        { status: 200 }
      );
    }

    // Step 2: Curate the outfit intelligently using validated items
    const outfit = curateOutfit(validatedItems, userQuery);

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
