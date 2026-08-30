"use client";

import { useEffect, useRef, useState } from "react";
import type { ChangeEvent, DragEvent, FormEvent } from "react";
import { PRODUCT_CATEGORIES, SHIPPING_TIERS } from "@/types/product";
import type { Product, ShippingTier } from "@/types/product";

/**
 * One photo in the form. Photos already saved on the product carry url and
 * pathname; newly picked ones carry a File and a local preview until upload.
 * Order is meaningful — index 0 is the cover.
 */
interface Photo {
  key: string;
  url?: string;
  pathname?: string;
  file?: File;
  previewUrl?: string;
}

function toPhotos(product?: Product): Photo[] {
  if (!product) return [];
  return product.images.map((url, i) => ({
    key: `${url}-${i}`,
    url,
    pathname: product.blobPathnames[i],
  }));
}

/** Shared by "Add a product" and "Edit" so the two can never drift apart. */
export default function ProductForm({
  mode,
  product,
  adminKey,
  onSaved,
  onCancel,
}: {
  mode: "create" | "edit";
  product?: Product;
  adminKey: string;
  onSaved: (product: Product) => void;
  onCancel?: () => void;
}) {
  const isEdit = mode === "edit";

  const knownCategory =
    product && (PRODUCT_CATEGORIES as readonly string[]).includes(product.category);

  const [photos, setPhotos] = useState<Photo[]>(() => toPhotos(product));
  const [title, setTitle] = useState(product?.title ?? "");
  const [price, setPrice] = useState(
    product ? (product.priceCents / 100).toFixed(2) : ""
  );
  const [quantity, setQuantity] = useState(String(product?.quantity ?? 1));
  const [category, setCategory] = useState<string>(
    product ? (knownCategory ? product.category : "Other") : PRODUCT_CATEGORIES[0]
  );
  const [customCategory, setCustomCategory] = useState(
    product && !knownCategory ? product.category : ""
  );
  const [shippingTier, setShippingTier] = useState<ShippingTier>(
    product?.shippingTier ?? "medium"
  );
  const [description, setDescription] = useState(product?.description ?? "");
  const [species, setSpecies] = useState(product?.species ?? "");
  const [dimensions, setDimensions] = useState(product?.dimensions ?? "");
  const [finish, setFinish] = useState(product?.finish ?? "");
  const [shipsIn, setShipsIn] = useState(product?.shipsIn ?? "");
  const [active, setActive] = useState(product?.active ?? true);

  const [dragging, setDragging] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const fileInputRef = useRef<HTMLInputElement>(null);
  const photosRef = useRef<Photo[]>([]);

  useEffect(() => {
    photosRef.current = photos;
  }, [photos]);

  useEffect(() => {
    return () => {
      for (const p of photosRef.current) {
        if (p.previewUrl) URL.revokeObjectURL(p.previewUrl);
      }
    };
  }, []);

  function acceptFiles(list: FileList | null) {
    if (!list || list.length === 0) return;
    const images = Array.from(list).filter((f) => f.type.startsWith("image/"));
    if (images.length === 0) {
      setError("Those files aren't images.");
      return;
    }
    setError("");
    setPhotos((prev) => [
      ...prev,
      ...images.map((file, i) => ({
        key: `new-${Date.now()}-${i}`,
        file,
        previewUrl: URL.createObjectURL(file),
      })),
    ]);
  }

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    acceptFiles(e.target.files);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    acceptFiles(e.dataTransfer.files);
  }

  function removePhoto(key: string) {
    setPhotos((prev) => {
      const target = prev.find((p) => p.key === key);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((p) => p.key !== key);
    });
  }

  /** Move a photo to the front — the cover is simply the first one. */
  function makeCover(key: string) {
    setPhotos((prev) => {
      const target = prev.find((p) => p.key === key);
      if (!target) return prev;
      return [target, ...prev.filter((p) => p.key !== key)];
    });
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");

    const finalCategory =
      category === "Other" && customCategory.trim()
        ? customCategory.trim()
        : category;

    if (photos.length === 0) return setError("Add at least one photo.");
    if (!title.trim()) return setError("Give the product a title.");
    if (!price.trim()) return setError("Set a price.");

    setSubmitting(true);
    try {
      // Upload any newly added photos, preserving the on-screen order.
      const images: string[] = [];
      const blobPathnames: string[] = [];

      for (const photo of photos) {
        if (photo.url && photo.pathname !== undefined) {
          images.push(photo.url);
          blobPathnames.push(photo.pathname);
          continue;
        }
        if (!photo.file) continue;

        const uploadForm = new FormData();
        uploadForm.append("file", photo.file);
        const res = await fetch("/api/products/upload", {
          method: "POST",
          headers: { "x-admin-key": adminKey },
          body: uploadForm,
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Photo upload failed");
        images.push(data.url);
        blobPathnames.push(data.pathname);
      }

      const payload = {
        title: title.trim(),
        category: finalCategory,
        price: price.trim(),
        quantity: Number(quantity) || 0,
        description: description.trim(),
        species: species.trim(),
        dimensions: dimensions.trim(),
        finish: finish.trim(),
        shipsIn: shipsIn.trim(),
        shippingTier,
        images,
        blobPathnames,
        active,
      };

      const res = await fetch(
        isEdit ? `/api/products/${product!.slug}` : "/api/products",
        {
          method: isEdit ? "PATCH" : "POST",
          headers: {
            "Content-Type": "application/json",
            "x-admin-key": adminKey,
          },
          body: JSON.stringify(payload),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not save");

      onSaved(data.product);
      if (!isEdit) {
        for (const p of photos) {
          if (p.previewUrl) URL.revokeObjectURL(p.previewUrl);
        }
        setPhotos([]);
        setTitle("");
        setPrice("");
        setQuantity("1");
        setCategory(PRODUCT_CATEGORIES[0]);
        setCustomCategory("");
        setShippingTier("medium");
        setDescription("");
        setSpecies("");
        setDimensions("");
        setFinish("");
        setShipsIn("");
        setActive(true);
        setSuccess(
          active
            ? `"${data.product.title}" is live in the shop.`
            : `"${data.product.title}" is saved but hidden.`
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="form" onSubmit={handleSubmit}>
      {photos.length > 0 && (
        <div className="thumb-strip">
          {photos.map((photo, i) => (
            <figure key={photo.key}>
              {/* Mixed local previews and remote URLs — next/image adds nothing here */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photo.previewUrl ?? photo.url} alt={`Photo ${i + 1}`} />
              <button
                type="button"
                onClick={() => removePhoto(photo.key)}
                aria-label={`Remove photo ${i + 1}`}
              >
                ×
              </button>
              {i === 0 ? (
                <span className="cover-tag">Cover</span>
              ) : (
                <button
                  type="button"
                  className="cover-set"
                  onClick={() => makeCover(photo.key)}
                >
                  Make cover
                </button>
              )}
            </figure>
          ))}
        </div>
      )}

      <div
        className={dragging ? "dropzone dragging" : "dropzone"}
        onClick={() => fileInputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
      >
        <strong>
          {photos.length > 0
            ? "Add another photo"
            : "Drop photos here, or click to browse"}
        </strong>
        <span>JPG, PNG, WEBP or GIF · up to 10MB · first one is the cover</span>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={handleFileChange}
        style={{ display: "none" }}
      />

      <div className="field">
        <label htmlFor={`title-${mode}`}>Title</label>
        <input
          id={`title-${mode}`}
          type="text"
          placeholder="End-grain board — walnut & maple"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        {isEdit && (
          <p className="field-hint">
            Web address stays <code>/shop/{product!.slug}</code> — renaming the
            product won&apos;t break links you&apos;ve already shared.
          </p>
        )}
      </div>

      <div className="field-row">
        <div className="field">
          <label htmlFor={`price-${mode}`}>Price (USD)</label>
          <input
            id={`price-${mode}`}
            type="text"
            inputMode="decimal"
            placeholder="145.00"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor={`qty-${mode}`}>Quantity in stock</label>
          <input
            id={`qty-${mode}`}
            type="text"
            inputMode="numeric"
            placeholder="1"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
          />
        </div>
      </div>

      <div className="field-row">
        <div className="field">
          <label htmlFor={`category-${mode}`}>Category</label>
          <select
            id={`category-${mode}`}
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            {PRODUCT_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          {category === "Other" && (
            <input
              type="text"
              placeholder="Type a category name"
              value={customCategory}
              onChange={(e) => setCustomCategory(e.target.value)}
              style={{ marginTop: "0.5rem" }}
            />
          )}
        </div>
        <div className="field">
          <label htmlFor={`tier-${mode}`}>Shipping tier</label>
          <select
            id={`tier-${mode}`}
            value={shippingTier}
            onChange={(e) => setShippingTier(e.target.value as ShippingTier)}
          >
            {SHIPPING_TIERS.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="field">
        <label htmlFor={`description-${mode}`}>Description</label>
        <textarea
          id={`description-${mode}`}
          rows={3}
          placeholder="What a photo can't say — how it was built, how it wears, what makes this one different."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>

      <div className="field-row">
        <div className="field">
          <label htmlFor={`species-${mode}`}>Species (optional)</label>
          <input
            id={`species-${mode}`}
            type="text"
            placeholder="Black walnut, hard maple"
            value={species}
            onChange={(e) => setSpecies(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor={`dimensions-${mode}`}>Dimensions (optional)</label>
          <input
            id={`dimensions-${mode}`}
            type="text"
            placeholder={'16" × 12" × 1.5"'}
            value={dimensions}
            onChange={(e) => setDimensions(e.target.value)}
          />
        </div>
      </div>

      <div className="field-row">
        <div className="field">
          <label htmlFor={`finish-${mode}`}>Finish (optional)</label>
          <input
            id={`finish-${mode}`}
            type="text"
            placeholder="Food-safe oil & beeswax"
            value={finish}
            onChange={(e) => setFinish(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor={`shipsIn-${mode}`}>Ships in (optional)</label>
          <input
            id={`shipsIn-${mode}`}
            type="text"
            placeholder="2–3 business days"
            value={shipsIn}
            onChange={(e) => setShipsIn(e.target.value)}
          />
        </div>
      </div>

      <label className="check-row">
        <input
          type="checkbox"
          checked={active}
          onChange={(e) => setActive(e.target.checked)}
        />
        Live on the shop now
      </label>

      {error && <p className="alert alert-error">{error}</p>}
      {success && <p className="alert alert-success">{success}</p>}

      <div className="form-actions">
        <button type="submit" className="btn btn-solid" disabled={submitting}>
          {submitting
            ? "Saving…"
            : isEdit
              ? "Save changes"
              : "Save product"}
        </button>
        {onCancel && (
          <button
            type="button"
            className="link-btn"
            onClick={onCancel}
            disabled={submitting}
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
