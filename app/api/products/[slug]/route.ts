import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { del } from "@vercel/blob";
import { deleteProduct, getProduct, updateProduct } from "@/lib/products";
import { parsePriceToCents } from "@/lib/money";
import { requireAdmin } from "@/lib/auth";
import type { ShippingTier } from "@/types/product";
import { SHIPPING_TIERS } from "@/types/product";

export const dynamic = "force-dynamic";

// Next.js 15+ : dynamic route params are a Promise and must be awaited.
type Ctx = { params: Promise<{ slug: string }> };

function str(v: unknown): string | undefined {
  return typeof v === "string" ? v.trim() : undefined;
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  const { slug } = await params;
  const product = await getProduct(slug);
  if (!product) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Remove the image files, but never let a missing file block the record delete
  for (const pathname of product.blobPathnames) {
    try {
      await del(pathname);
    } catch (err) {
      console.error("Could not delete blob file (continuing)", pathname, err);
    }
  }

  try {
    await deleteProduct(slug);
  } catch (err) {
    console.error("Failed to delete product", err);
    return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  }

  revalidatePath("/shop");
  revalidatePath(`/shop/${slug}`);
  return NextResponse.json({ success: true });
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  const { slug } = await params;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Price, if sent, is re-parsed server-side rather than trusted.
  let priceCents: number | undefined;
  if (body.price !== undefined) {
    const parsed = parsePriceToCents(String(body.price));
    if (parsed === null) {
      return NextResponse.json(
        { error: "Price must be a number like 145 or 145.00" },
        { status: 400 }
      );
    }
    priceCents = parsed;
  }

  const tierInput = str(body.shippingTier) as ShippingTier | undefined;
  const shippingTier =
    tierInput && SHIPPING_TIERS.some((t) => t.value === tierInput)
      ? tierInput
      : undefined;

  try {
    const updated = await updateProduct(slug, {
      title: str(body.title),
      category: str(body.category),
      description: str(body.description),
      species: str(body.species),
      dimensions: str(body.dimensions),
      finish: str(body.finish),
      shipsIn: str(body.shipsIn),
      priceCents,
      shippingTier,
      quantity:
        body.quantity === undefined
          ? undefined
          : Math.max(0, Math.floor(Number(body.quantity) || 0)),
      active: typeof body.active === "boolean" ? body.active : undefined,
      order: typeof body.order === "number" ? body.order : undefined,
    });

    if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });

    revalidatePath("/shop");
    revalidatePath(`/shop/${slug}`);
    return NextResponse.json({ product: updated });
  } catch (err) {
    console.error("Failed to update product", err);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
}
