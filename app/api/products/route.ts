import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { listProducts, saveProduct, uniqueSlug } from "@/lib/products";
import { parsePriceToCents } from "@/lib/money";
import { requireAdmin } from "@/lib/auth";
import type { Product, ShippingTier } from "@/types/product";
import { SHIPPING_TIERS } from "@/types/product";

export const dynamic = "force-dynamic";

function isAdmin(req: NextRequest): boolean {
  const key = process.env.ADMIN_KEY;
  return Boolean(key) && req.headers.get("x-admin-key") === key;
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/**
 * Public read returns live products only. The admin page passes its key to
 * see hidden ones too — a draft listing must never leak to the storefront.
 */
export async function GET(req: NextRequest) {
  try {
    const products = await listProducts({ includeHidden: isAdmin(req) });
    return NextResponse.json({ products });
  } catch (err) {
    console.error("Failed to list products", err);
    return NextResponse.json({ error: "Failed to load products" }, { status: 500 });
  }
}

/** Admin — create a product from metadata plus already-uploaded Blob images. */
export async function POST(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const title = str(body.title);
  const category = str(body.category);
  if (!title) return NextResponse.json({ error: "Title is required" }, { status: 400 });
  if (!category)
    return NextResponse.json({ error: "Category is required" }, { status: 400 });

  // The price is always re-parsed here. Whatever the browser thinks it is,
  // the server decides what gets stored.
  const priceCents = parsePriceToCents(str(body.price) || String(body.price ?? ""));
  if (priceCents === null) {
    return NextResponse.json(
      { error: "Price must be a number like 145 or 145.00" },
      { status: 400 }
    );
  }

  const quantity =
    typeof body.quantity === "number"
      ? Math.max(0, Math.floor(body.quantity))
      : Number.isFinite(Number(body.quantity))
        ? Math.max(0, Math.floor(Number(body.quantity)))
        : 0;

  const images = Array.isArray(body.images)
    ? body.images.filter((u): u is string => typeof u === "string" && u.length > 0)
    : [];
  const blobPathnames = Array.isArray(body.blobPathnames)
    ? body.blobPathnames.filter((p): p is string => typeof p === "string")
    : [];

  if (images.length === 0) {
    return NextResponse.json({ error: "Add at least one photo" }, { status: 400 });
  }

  const tierInput = str(body.shippingTier) as ShippingTier;
  const shippingTier: ShippingTier = SHIPPING_TIERS.some((t) => t.value === tierInput)
    ? tierInput
    : "medium";

  const now = Date.now();
  const product: Product = {
    slug: await uniqueSlug(title),
    title,
    category,
    priceCents,
    quantity,
    description: str(body.description) || undefined,
    images,
    blobPathnames,
    shippingTier,
    species: str(body.species) || undefined,
    dimensions: str(body.dimensions) || undefined,
    finish: str(body.finish) || undefined,
    shipsIn: str(body.shipsIn) || undefined,
    active: body.active !== false,
    createdAt: now,
    order: now,
  };

  try {
    await saveProduct(product);
  } catch (err) {
    console.error("Failed to save product", err);
    return NextResponse.json(
      { error: "Could not save. Is the Redis store connected?" },
      { status: 500 }
    );
  }

  revalidatePath("/shop");
  revalidatePath(`/shop/${product.slug}`);

  return NextResponse.json({ product }, { status: 201 });
}
