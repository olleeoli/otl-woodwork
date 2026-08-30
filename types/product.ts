/**
 * A shop product. Phase 1 covers stock items only — one fixed price, a
 * quantity on hand. Made-to-order options (material / size / finish) come
 * later and will hang off this same record.
 */
export interface Product {
  /** URL segment and primary key. Never changes once created, so links keep working. */
  slug: string;
  title: string;
  category: string;
  /** Integer cents. Never a float — 19.99 in binary floating point is a rounding bug. */
  priceCents: number;
  /** On hand. 0 renders as sold out rather than disappearing. */
  quantity: number;
  description?: string;
  /** Vercel Blob URLs. The first is the cover image. */
  images: string[];
  /** Blob pathnames, index-aligned with images, so files can be deleted later. */
  blobPathnames: string[];
  shippingTier: ShippingTier;

  /* Optional spec-table rows. Shown on the product page only when filled in. */
  species?: string;
  dimensions?: string;
  finish?: string;
  shipsIn?: string;

  /** Hidden products stay off /shop, so a listing can be built over several sittings. */
  active: boolean;
  createdAt: number;
  /** Sort key, newest first. Defaults to createdAt. */
  order: number;
}

export type ShippingTier = "small" | "medium" | "large";

/**
 * Shipping tiers from the ecommerce plan. Nothing calculates postage in
 * Phase 1 — this is recorded now so the data exists when checkout lands.
 */
export const SHIPPING_TIERS: { value: ShippingTier; label: string }[] = [
  { value: "small", label: "Small — coasters, keepsakes (up to 3 lb)" },
  { value: "medium", label: "Medium — boards, plaques, wall art (4–8 lb)" },
  { value: "large", label: "Large — lazy susans, oversize boards (9–20 lb)" },
];

/**
 * Shop categories. Deliberately separate from GALLERY_CATEGORIES — the
 * gallery documents finished jobs, this lists things for sale, and the two
 * don't have to group the same way.
 */
export const PRODUCT_CATEGORIES = [
  "Cutting Boards",
  "Charcuterie & Serving",
  "Signs & Plaques",
  "Wall Art",
  "Home Decor",
  "Other",
] as const;
