export interface GalleryItem {
  id: string;
  title: string;
  category: string;
  description?: string;
  imageUrl: string;
  /** Vercel Blob pathname — needed to delete the file from storage later */
  blobPathname: string;
  createdAt: number;
  /** Sort key. Defaults to createdAt so newest shows first. */
  order: number;
}

/**
 * Categories shown in the admin dropdown and as filter chips on the site.
 * Edit this list freely — it is the only place categories are defined.
 * Picking "Other" in the admin form lets you type a one-off category.
 */
export const GALLERY_CATEGORIES = [
  "Cutting Boards",
  "Furniture",
  "Signs",
  "Home Decor",
  "Custom Orders",
  "Other",
] as const;
