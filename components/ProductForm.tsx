"use client";

import { useEffect, useRef, useState } from "react";
import type { ChangeEvent, DragEvent, FormEvent } from "react";
import { PRODUCT_CATEGORIES, SHIPPING_TIERS } from "@/types/product";
import type { Product, ShippingTier, ProductVideo } from "@/types/product";

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

/**
 * One video in the form. Mirrors Photo's split: videos already on the
 * product carry a uploadId and a status; a newly picked one also carries
 * local upload progress until Mux takes the file.
 */
interface FormVideo extends ProductVideo {
  /** 0–100 while the browser is PUTting to Mux. Absent once handed off. */
  uploadProgress?: number;
}

function toPhotos(product?: Product): Photo[] {
  if (!product) return [];
  return product.images.map((url, i) => ({
    key: `${url}-${i}`,
    url,
    pathname: product.blobPathnames[i],
  }));
}

function toVideos(product?: Product): FormVideo[] {
  return product?.videos ? [...product.videos] : [];
}

const MAX_VIDEO_BYTES = 500 * 1024 * 1024; // 500MB

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
  const [videos, setVideos] = useState<FormVideo[]>(() => toVideos(product));
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
  const [videoError, setVideoError] = useState("");
  const [success, setSuccess] = useState("");

  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
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

    /**
   * While any video sits in "processing", ask the server whether Mux has
   * finished. The webhook writes the result to Redis under the uploadId
   * whether or not it knew the product slug, so this covers the "Add a
   * product" case where the slug doesn't exist yet.
   *
   * Polls every 3s and stops as soon as nothing is processing. Videos still
   * uploading (uploadProgress set) are skipped — they aren't at Mux yet.
   */
    useEffect(() => {
      const pending = videos.filter(
        (v) => v.status === "processing" && v.uploadProgress === undefined
      );
      if (pending.length === 0) return;
  
      let cancelled = false;
  
      const timer = setInterval(async () => {
        for (const video of pending) {
          try {
            const res = await fetch(
              `/api/products/video-upload/status?uploadId=${video.uploadId}`,
              { headers: { "x-admin-key": adminKey }, cache: "no-store" }
            );
            if (!res.ok) continue;
            const data = await res.json();
            if (cancelled || data.status === "processing") continue;
  
            setVideos((prev) =>
              prev.map((v) =>
                v.uploadId === video.uploadId
                  ? {
                      ...v,
                      status: data.status,
                      playbackId: data.playbackId ?? v.playbackId,
                      assetId: data.assetId ?? v.assetId,
                      durationSec: data.durationSec ?? v.durationSec,
                    }
                  : v
              )
            );
          } catch {
            // A failed poll is not worth surfacing — try again next tick.
          }
        }
      }, 3000);
  
      return () => {
        cancelled = true;
        clearInterval(timer);
      };
    }, [videos, adminKey]);
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

  /**
   * Video goes straight from the browser to Mux. A 400MB body would blow
   * past the serverless request limit, so our server only hands back a
   * one-time upload URL and never sees the bytes.
   */
  async function acceptVideo(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("video/")) {
      setVideoError("That file isn't a video.");
      return;
    }
    if (file.size > MAX_VIDEO_BYTES) {
      setVideoError(
        `That video is ${(file.size / 1024 / 1024).toFixed(0)}MB — the limit is 500MB.`
      );
      return;
    }
    setVideoError("");

    let uploadId: string;
    let uploadUrl: string;
    try {
      const res = await fetch("/api/products/video-upload", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-key": adminKey },
        body: JSON.stringify(isEdit ? { slug: product!.slug } : {}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not start the upload");
      uploadId = data.uploadId;
      uploadUrl = data.uploadUrl;
    } catch (err) {
      setVideoError(err instanceof Error ? err.message : "Could not start the upload");
      return;
    }

    setVideos((prev) => [
      ...prev,
      {
        uploadId,
        status: "processing",
        alt: "",
        createdAt: Date.now(),
        uploadProgress: 0,
      },
    ]);

    // XHR rather than fetch — fetch still can't report upload progress, and
    // a multi-minute video with no progress bar feels broken.
    try {
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", uploadUrl);
        xhr.upload.onprogress = (e) => {
          if (!e.lengthComputable) return;
          const pct = Math.round((e.loaded / e.total) * 100);
          setVideos((prev) =>
            prev.map((v) =>
              v.uploadId === uploadId ? { ...v, uploadProgress: pct } : v
            )
          );
        };
        xhr.onload = () =>
          xhr.status < 400
            ? resolve()
            : reject(new Error(`Upload failed (${xhr.status})`));
        xhr.onerror = () => reject(new Error("Upload failed"));
        xhr.send(file);
      });

      // Handed off. Mux transcodes from here and the webhook finishes it.
      setVideos((prev) =>
        prev.map((v) =>
          v.uploadId === uploadId ? { ...v, uploadProgress: undefined } : v
        )
      );
    } catch (err) {
      setVideoError(err instanceof Error ? err.message : "Upload failed");
      setVideos((prev) => prev.filter((v) => v.uploadId !== uploadId));
    }
  }

  function removeVideo(uploadId: string) {
    setVideos((prev) => prev.filter((v) => v.uploadId !== uploadId));
  }

  function setVideoAlt(uploadId: string, alt: string) {
    setVideos((prev) =>
      prev.map((v) => (v.uploadId === uploadId ? { ...v, alt } : v))
    );
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
        // Strip the form-only progress field before it reaches the API.
        videos: videos.map(({ uploadProgress: _drop, ...v }) => v),
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
        setVideos([]);
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

      {/* ---------- Video ---------- */}

      {videos.length > 0 && (
        <div className="thumb-strip">
          {videos.map((video, i) => (
            <figure key={video.uploadId}>
              {video.status === "ready" && video.playbackId ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={`https://image.mux.com/${video.playbackId}/thumbnail.jpg?time=0`}
                  alt={video.alt || `Video ${i + 1}`}
                />
              ) : (
                <div className="video-placeholder">
                  {video.uploadProgress !== undefined
                    ? `${video.uploadProgress}%`
                    : video.status === "errored"
                      ? "Failed"
                      : "Processing…"}
                </div>
              )}
              <button
                type="button"
                onClick={() => removeVideo(video.uploadId)}
                aria-label={`Remove video ${i + 1}`}
              >
                ×
              </button>
            </figure>
          ))}
        </div>
      )}

      {videos.map((video, i) => (
        <div className="field" key={`alt-${video.uploadId}`}>
          <label htmlFor={`valt-${video.uploadId}`}>Video {i + 1} caption</label>
          <input
            id={`valt-${video.uploadId}`}
            type="text"
            placeholder="Grain close-up under raking light"
            value={video.alt}
            onChange={(e) => setVideoAlt(video.uploadId, e.target.value)}
          />
        </div>
      ))}

      <div className="dropzone" onClick={() => videoInputRef.current?.click()}>
        <strong>
          {videos.length > 0 ? "Add another video" : "Add a video (optional)"}
        </strong>
        <span>MP4, MOV or WEBM · up to 500MB · plays after the photos</span>
      </div>

      <input
        ref={videoInputRef}
        type="file"
        accept="video/mp4,video/quicktime,video/webm"
        onChange={(e) => {
          acceptVideo(e.target.files?.[0]);
          if (videoInputRef.current) videoInputRef.current.value = "";
        }}
        style={{ display: "none" }}
      />

      {videoError && <p className="alert alert-error">{videoError}</p>}

      {/* ---------- Details ---------- */}

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
          {submitting ? "Saving…" : isEdit ? "Save changes" : "Save product"}
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