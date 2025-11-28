// lib/embeddings.ts
import { pipeline, env } from "@xenova/transformers";
import { writeFile, unlink } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

// Disable local model files to use remote models
env.allowLocalModels = false;

// @ts-ignore
env.platform = "node";

// OpenAI client
let openaiClient: any = null;

function getOpenAIClient() {
  if (!openaiClient) {
    const { OpenAI } = require("openai");
    openaiClient = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }
  return openaiClient;
}

// Helper: convert Buffer to base64 data URI
function bufferToBase64DataURI(buffer: Buffer, mimeType: string): string {
  const b64 = buffer.toString("base64");
  const mime = mimeType || "image/jpeg";
  return `data:${mime};base64,${b64}`;
}

// CLIP model for image embeddings
let imageEmbeddingModel: any = null;
let textEmbeddingModel: any = null;

function uniqueTempPath(ext = ".jpg") {
  const name = `img-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 9)}${ext}`;
  return join(tmpdir(), name);
}

/**
 * Generate a 512-d CLIP image embedding from a Buffer.
 * Writes the buffer to a temp file, passes the file path to Xenova, then deletes the temp file.
 *
 * @param imageBuffer Buffer | ArrayBuffer | Uint8Array
 * @param mimeType optional mime type (e.g. 'image/jpeg' or 'image/png') used for file extension
 */

export async function getImageEmbedding(
  imageBuffer: Buffer | ArrayBuffer | Uint8Array,
  mimeType = "image/jpeg"
): Promise<number[]> {
  // pick extension from mimeType
  const ext = mimeType.includes("png") ? ".png" : ".jpg";

  // ensure model loaded
  try {
    if (!imageEmbeddingModel) {
      imageEmbeddingModel = await pipeline(
        "image-feature-extraction",
        "Xenova/clip-vit-base-patch32"
      );
    }
  } catch (err) {
    console.error("Failed to load image embedding model:", err);
    return new Array(512).fill(0);
  }

  // normalize input to Buffer
  let buffer: Buffer;
  if (imageBuffer instanceof Buffer) buffer = imageBuffer;
  else if (imageBuffer instanceof Uint8Array) buffer = Buffer.from(imageBuffer);
  else if (imageBuffer instanceof ArrayBuffer)
    buffer = Buffer.from(imageBuffer);
  else buffer = Buffer.from(imageBuffer as any);

  const tempPath = uniqueTempPath(ext);
  try {
    // write file to temp path
    await writeFile(tempPath, buffer);

    // pass file path (string) to Xenova pipeline
    // many Xenova backends accept a local file path string
    const output = await imageEmbeddingModel(tempPath, {
      pooling: "mean",
      normalize: true,
    });

    const embedding = (output as any).data || output || [];
    const embeddingArray = Array.isArray(embedding)
      ? embedding
      : Array.from(embedding as any);

    // ensure numeric and exactly 512 dims
    const numeric = embeddingArray
      .slice(0, 512)
      .map((v: any) => Number(v) || 0);
    // If embedding is shorter than 512, pad with zeros
    if (numeric.length < 512) {
      return numeric.concat(new Array(512 - numeric.length).fill(0));
    }
    return numeric;
  } catch (error) {
    console.error(
      "Error generating image embedding (file path method):",
      error
    );
    return new Array(512).fill(0);
  } finally {
    // attempt cleanup; ignore errors
    try {
      await unlink(tempPath);
    } catch (e) {
      /* ignore cleanup error */
    }
  }
}

// List of candidate CLIP text encoders / pipelines to try (ordered)
const CLIP_TEXT_CANDIDATES = [
  {
    task: "text-feature-extraction",
    model: "Xenova/clip-text-vit-base-patch32",
  },
  { task: "feature-extraction", model: "Xenova/clip-text-vit-base-patch32" },
  { task: "feature-extraction", model: "Xenova/clip-text-small" },
  { task: "feature-extraction", model: "Xenova/clip-text-vit-large-patch14" },
  // sentence-transformers fallback (different space/dim)
  {
    task: "feature-extraction",
    model: "sentence-transformers/all-MiniLM-L6-v2",
  },
];

// Desired embedding dimension for CLIP base = 512
const TARGET_DIM = 512;

export async function getTextEmbedding(text: string): Promise<number[]> {
  // Just delegate to OpenAI helper
  const emb = await getTextEmbeddingOpenAI(text);

  // OpenAI returns 1536-d; we need 512-d for our DB column (vector(512))
  const numeric = emb.map((v: any) => Number(v) || 0);

  if (numeric.length < TARGET_DIM) {
    return numeric.concat(new Array(TARGET_DIM - numeric.length).fill(0));
  }

  console.log(numeric[500], numeric[501], numeric[502]);
  return numeric.slice(0, TARGET_DIM);
}

// Use OpenAI embeddings if API key is available
export async function getTextEmbeddingOpenAI(text: string): Promise<number[]> {
  const { OpenAI } = await import("openai");

  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY not configured");
  }

  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  const response = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: text,
  });

  const vec = response.data?.[0]?.embedding;
  if (!vec) {
    throw new Error("OpenAI returned no embedding");
  }

  return vec.map((v: any) => Number(v) || 0);
}

/**
 * Generate embedding from image description text using OpenAI.
 * Converts OpenAI's 1536-d embedding to 512-d for consistency with image embeddings.
 *
 * @param description Text description of the clothing item
 * @returns 512-dimensional embedding array
 */
export async function getDescriptionEmbedding(
  description: string
): Promise<number[]> {
  if (!description || description.trim().length === 0) {
    throw new Error("Description cannot be empty");
  }

  const embedding = await getTextEmbeddingOpenAI(description);
  
  // Convert from OpenAI's 1536-d to our target 512-d
  const numeric = embedding.map((v: any) => Number(v) || 0);

  if (numeric.length < TARGET_DIM) {
    return numeric.concat(new Array(TARGET_DIM - numeric.length).fill(0));
  }

  return numeric.slice(0, TARGET_DIM);
}

/**
 * Generate image description using OpenAI Vision API.
 *
 * @param imageBuffer Image buffer
 * @param mimeType MIME type of the image (e.g., 'image/jpeg')
 * @returns Description text from the model
 */
export async function getImageDescription(
  imageBuffer: Buffer | ArrayBuffer | Uint8Array,
  mimeType: string
): Promise<string> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY not configured");
  }

  // Normalize input to Buffer
  let buffer: Buffer;
  if (imageBuffer instanceof Buffer) buffer = imageBuffer;
  else if (imageBuffer instanceof Uint8Array) buffer = Buffer.from(imageBuffer);
  else if (imageBuffer instanceof ArrayBuffer)
    buffer = Buffer.from(imageBuffer);
  else buffer = Buffer.from(imageBuffer as any);

  // Convert to base64 data URI
  const dataUri = bufferToBase64DataURI(buffer, mimeType);

  const openai = getOpenAIClient();

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini", // Using gpt-4o-mini for better compatibility and cost-efficiency
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Describe this clothing item in detail. Include: type of garment, color, style, material (if visible), fit, occasion suitability, and any notable features or patterns.",
            },
            {
              type: "image_url",
              image_url: { url: dataUri },
            },
          ] as any,
        },
      ],
      max_tokens: 300,
    });

    const description = response.choices?.[0]?.message?.content;
    if (!description) {
      throw new Error("No description returned from OpenAI");
    }

    return description.trim();
  } catch (error: any) {
    console.error("Error generating image description:", error);
    throw new Error(
      `Failed to generate image description: ${error.message || "Unknown error"}`
    );
  }
}
