import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { randomUUID } from "crypto";
import { listGalleryItems, saveGalleryItem } from "@/lib/gallery";
import { requireAdmin } from "@/lib/auth";
import type { GalleryItem } from "@/types/gallery";

export const dynamic = "force-dynamic";

/** Public — the landing page and anyone else can read the gallery. */
export async function GET() {
  try {
    const items = await listGalleryItems();
    return NextResponse.json({ items });
  } catch (err) {
    console.error("Failed to list gallery items", err);
    return NextResponse.json({ error: "Failed to load gallery" }, { status: 500 });
  }
}

/** Admin — save metadata for an image that was already uploaded to Blob. */
export async function POST(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const title = typeof body.title === "string" ? body.title.trim() : "";
  const category = typeof body.category === "string" ? body.category.trim() : "";
  const description =
    typeof body.description === "string" ? body.description.trim() : "";
  const imageUrl = typeof body.imageUrl === "string" ? body.imageUrl : "";
  const blobPathname =
    typeof body.blobPathname === "string" ? body.blobPathname : "";

  if (!title || !category || !imageUrl || !blobPathname) {
    return NextResponse.json(
      { error: "Missing required fields: title, category, imageUrl, blobPathname" },
      { status: 400 }
    );
  }

  const now = Date.now();
  const item: GalleryItem = {
    id: randomUUID(),
    title,
    category,
    description: description || undefined,
    imageUrl,
    blobPathname,
    createdAt: now,
    order: now,
  };

  try {
    await saveGalleryItem(item);
  } catch (err) {
    console.error("Failed to save gallery item", err);
    return NextResponse.json(
      { error: "Could not save. Is the Redis store connected?" },
      { status: 500 }
    );
  }

  // Push the new photo to the live homepage immediately instead of waiting
  // out the 60s cache window.
  revalidatePath("/");

  return NextResponse.json({ item }, { status: 201 });
}
