// app/api/wardrobe/upload/route.ts
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getFirebaseAdmin } from "@/lib/firebaseAdmin";
import { getImageDescription, getDescriptionEmbedding } from "@/lib/embeddings";
import { query } from "@/lib/db";
import { z } from "zod";

const uploadSchema = z.object({
  userId: z.string().optional(),
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

    // Generate image description using OpenAI Vision
    let description = "";
    try {
      description = await getImageDescription(buffer, file.type);
    } catch (err: any) {
      console.error("Failed to generate image description:", err);
      try {
        await fileRef.delete();
      } catch (e) {}
      return NextResponse.json(
        { error: "Failed to analyze image" },
        { status: 500 }
      );
    }

    // Generate embedding from description
    let descriptionEmbedding: number[] = [];
    try {
      descriptionEmbedding = await getDescriptionEmbedding(description);
    } catch (err: any) {
      console.error("Failed to generate description embedding:", err);
      try {
        await fileRef.delete();
      } catch (e) {}
      return NextResponse.json(
        { error: "Failed to process description" },
        { status: 500 }
      );
    }

    // Validate embedding
    if (!Array.isArray(descriptionEmbedding) || descriptionEmbedding.length === 0) {
      try {
        await fileRef.delete();
      } catch (e) {}
      return NextResponse.json(
        { error: "Embedding generation failed" },
        { status: 500 }
      );
    }

    // Insert row into database with description and its embedding
    let insertSql: string;
    let insertParams: any[];

    if (validated.userId) {
      insertSql = `
        INSERT INTO public.wardrobe_items
          (user_id, image_url, description, embedding, category, style, season, colors, tags, status, created_at, updated_at)
        VALUES ($1, $2, $3, $4::vector, $5, $6, $7, $8::jsonb, $9::jsonb, 'ready', now(), now())
        RETURNING id, user_id, image_url, description, embedding, category, style, season, colors, tags, status, created_at, updated_at;
      `;
      insertParams = [
        validated.userId,
        imageUrl,
        description,
        `[${descriptionEmbedding.join(",")}]`,
        validated.category,
        validated.style,
        validated.season,
        JSON.stringify(validated.colors),
        JSON.stringify(validated.tags),
      ];
    } else {
      insertSql = `
        INSERT INTO public.wardrobe_items
          (image_url, description, embedding, category, style, season, colors, tags, status, created_at, updated_at)
        VALUES ($1, $2, $3::vector, $4, $5, $6, $7::jsonb, $8::jsonb, 'ready', now(), now())
        RETURNING id, image_url, description, embedding, category, style, season, colors, tags, status, created_at, updated_at;
      `;
      insertParams = [
        imageUrl,
        description,
        `[${descriptionEmbedding.join(",")}]`,
        validated.category,
        validated.style,
        validated.season,
        JSON.stringify(validated.colors),
        JSON.stringify(validated.tags),
      ];
    }

    // Sanity check placeholder counts
    const placeholders = (insertSql.match(/\$\d+/g) || []).map((s) =>
      Number(s.slice(1))
    );
    const expected = placeholders.length ? Math.max(...placeholders) : 0;
    if (insertParams.length < expected) {
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

    const item = insertRes.rows[0];
    return NextResponse.json({ item }, { status: 201 });
  } catch (err: any) {
    console.error("Upload error", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
