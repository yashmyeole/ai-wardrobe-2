// app/api/wardrobe/upload/route.ts
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getFirebaseAdmin } from "@/lib/firebaseAdmin";
import { getImageEmbedding } from "@/lib/embeddings";
import { query } from "@/lib/db"; // ensure tableHasColumn exported or implement similar
import { z } from "zod";

const uploadSchema = z.object({
  userId: z.string().optional(), // optional client-supplied user id (UNTRUSTED)
  category: z.enum([
    "shirt",
    "pants",
    "dress",
    "shoes",
    "accessory",
    "jacket",
    "other",
  ]),
  style: z.enum(["formal", "casual", "semi-formal", "sporty"]),
  season: z.enum(["summer", "winter", "spring", "fall", "any"]),
  colors: z.array(z.string()).default([]),
  tags: z.array(z.string()).default([]),
});

const MAX_BYTES = parseInt(process.env.MAX_UPLOAD_BYTES || "5242880", 10); // 5MB

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("file") as File | null;
    const metadataRaw = form.get("metadata") as string | null;

    if (!file || !metadataRaw) {
      return NextResponse.json(
        { error: "Missing file or metadata" },
        { status: 400 }
      );
    }

    const metadata = JSON.parse(metadataRaw);
    const validated = uploadSchema.parse(metadata);

    if (!file.type.startsWith("image/")) {
      return NextResponse.json({ error: "Invalid file type" }, { status: 400 });
    }
    if ((file.size ?? 0) > MAX_BYTES) {
      return NextResponse.json({ error: "File too large" }, { status: 400 });
    }
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Upload to Firebase
    const firebaseApp = getFirebaseAdmin();
    const bucket = firebaseApp.storage().bucket();
    const filename = `wardrobe/${Date.now()}-${file.name.replace(/\s+/g, "-")}`;
    const fileRef = bucket.file(filename);

    await fileRef.save(buffer, {
      metadata: { contentType: file.type },
      public: true,
    });

    const imageUrl = `https://storage.googleapis.com/${
      bucket.name
    }/${encodeURIComponent(filename)}`;

    // Insert row: detect if table has user_id column
    let insertSql: string;
    let insertParams: any[];

    if (validated.userId) {
      insertSql = `
        INSERT INTO public.wardrobe_items
          (user_id, image_url, category, style, season, colors, tags, status, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, 'processing', now(), now())
        RETURNING id;
      `;
      insertParams = [
        validated.userId,
        imageUrl,
        validated.category,
        validated.style,
        validated.season,
        JSON.stringify(validated.colors),
        JSON.stringify(validated.tags),
      ];
    } else {
      insertSql = `
        INSERT INTO public.wardrobe_items
          (image_url, category, style, season, colors, tags, status, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, 'processing', now(), now())
        RETURNING id;
      `;
      insertParams = [
        imageUrl,
        validated.category,
        validated.style,
        validated.season,
        JSON.stringify(validated.colors),
        JSON.stringify(validated.tags),
      ];
    }

    // sanity check placeholder counts
    const placeholders = (insertSql.match(/\$\d+/g) || []).map((s) =>
      Number(s.slice(1))
    );
    const expected = placeholders.length ? Math.max(...placeholders) : 0;
    if (insertParams.length < expected) {
      // cleanup file
      try {
        await fileRef.delete();
      } catch (e) {}
      return NextResponse.json(
        { error: "Server error: invalid params" },
        { status: 500 }
      );
    }

    const insertRes = await query(insertSql, insertParams);
    if (!insertRes || insertRes.rowCount === 0) {
      try {
        await fileRef.delete();
      } catch (e) {}
      return NextResponse.json({ error: "DB insert failed" }, { status: 500 });
    }

    const itemId = insertRes.rows[0].id;

    // Generate embedding
    // const embedding = await getImageEmbedding(buffer); // returns number[]
    // pass MIME so data URI is correct
    const embedding = await getImageEmbedding(buffer, file.type);

    // Fallback / validation
    if (!Array.isArray(embedding) || embedding.length === 0) {
      await query(
        "UPDATE public.wardrobe_items SET status = $1, updated_at = now() WHERE id = $2",
        ["failed", itemId]
      );
      return NextResponse.json(
        { error: "Embedding generation failed" },
        { status: 500 }
      );
    }

    // Convert to pgvector text format: "[0.1,0.2,...]"
    const numericEmbedding = embedding.map((v) => Number(v) || 0);
    const embeddingLiteral = `[${numericEmbedding.join(",")}]`;

    const updateSql = `
  UPDATE public.wardrobe_items
  SET embedding = $1::vector,
      status = 'ready',
      updated_at = now()
  WHERE id = $2
  RETURNING *;
`;
    const updateRes = await query(updateSql, [embeddingLiteral, itemId]);

    if (!updateRes || updateRes.rowCount === 0) {
      await query(
        "UPDATE public.wardrobe_items SET status = $1, updated_at = now() WHERE id = $2",
        ["failed", itemId]
      );
      return NextResponse.json(
        { error: "Failed to save embedding" },
        { status: 500 }
      );
    }

    const finalItem = updateRes.rows[0];
    return NextResponse.json({ item: finalItem }, { status: 201 });
  } catch (err: any) {
    console.error("Upload error", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
