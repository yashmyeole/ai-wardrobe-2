// app/api/image-description/route.ts
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

// Helper: convert File → base64 data URI
async function fileToBase64DataURI(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  const b64 = Buffer.from(bytes).toString("base64");
  const mime = file.type || "image/jpeg";
  return `data:${mime};base64,${b64}`;
}

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    // Convert image to base64 data URI
    const dataUri = await fileToBase64DataURI(file);

    // Call OpenAI Vision API via chat/completions
    const response = await openai.chat.completions.create({
      model: "gpt-4-vision-preview", // or whichever vision-enabled model you have access to
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "What is in this image? Describe the product in detail.",
            },
            {
              type: "image_url",
              image_url: { url: dataUri },
            },
          ] as any, // cast to any to bypass TypeScript warnings
        },
      ],
    });

    const desc = response.choices?.[0]?.message?.content || null;

    return NextResponse.json({ description: desc });
  } catch (err: any) {
    console.error("Error describing image:", err);
    return NextResponse.json(
      { error: err.message || "Server error" },
      { status: 500 }
    );
  }
}
