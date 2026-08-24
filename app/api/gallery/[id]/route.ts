import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { del } from "@vercel/blob";
import {
  deleteGalleryItem,
  getGalleryItem,
  updateGalleryItem,
} from "@/lib/gallery";
import { requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

// Next.js 15+ : dynamic route params are a Promise and must be awaited.
type Ctx = { params: Promise<{ id: string }> };

export async function DELETE(req: NextRequest, { params }: Ctx) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  const { id } = await params;
  const item = await getGalleryItem(id);
  if (!item) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Remove the image file, but don't let a missing file block the record delete
  try {
    await del(item.blobPathname);
  } catch (err) {
    console.error("Could not delete blob file (continuing)", err);
  }

  try {
    await deleteGalleryItem(id);
  } catch (err) {
    console.error("Failed to delete gallery record", err);
    return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  }

  revalidatePath("/");
  return NextResponse.json({ success: true });
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  const { id } = await params;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const updated = await updateGalleryItem(id, {
      title: typeof body.title === "string" ? body.title.trim() : undefined,
      category:
        typeof body.category === "string" ? body.category.trim() : undefined,
      description:
        typeof body.description === "string" ? body.description.trim() : undefined,
      order: typeof body.order === "number" ? body.order : undefined,
    });

    if (!updated) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    revalidatePath("/");
    return NextResponse.json({ item: updated });
  } catch (err) {
    console.error("Failed to update gallery item", err);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
}
