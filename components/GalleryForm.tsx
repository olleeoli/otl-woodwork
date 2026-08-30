"use client";

import { useEffect, useRef, useState } from "react";
import type { ChangeEvent, DragEvent, FormEvent } from "react";
import { GALLERY_CATEGORIES } from "@/types/gallery";
import type { GalleryItem } from "@/types/gallery";

/**
 * Shared by "Add a photo" and "Edit", so the two can't drift apart.
 * In edit mode the existing photo shows until a replacement is picked; the
 * old file is deleted server-side only once the replacement saves.
 */
export default function GalleryForm({
  mode,
  item,
  adminKey,
  onSaved,
  onCancel,
}: {
  mode: "create" | "edit";
  item?: GalleryItem;
  adminKey: string;
  onSaved: (item: GalleryItem) => void;
  onCancel?: () => void;
}) {
  const isEdit = mode === "edit";
  const knownCategory =
    item && (GALLERY_CATEGORIES as readonly string[]).includes(item.category);

  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [title, setTitle] = useState(item?.title ?? "");
  const [category, setCategory] = useState<string>(
    item ? (knownCategory ? item.category : "Other") : GALLERY_CATEGORIES[0]
  );
  const [customCategory, setCustomCategory] = useState(
    item && !knownCategory ? item.category : ""
  );
  const [description, setDescription] = useState(item?.description ?? "");

  const [dragging, setDragging] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewRef = useRef<string | null>(null);

  useEffect(() => {
    previewRef.current = previewUrl;
  }, [previewUrl]);

  useEffect(() => {
    return () => {
      if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    };
  }, []);

  function acceptFile(f: File | null) {
    if (!f) return;
    if (!f.type.startsWith("image/")) {
      setError("That file isn't an image.");
      return;
    }
    setError("");
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(f);
    setPreviewUrl(URL.createObjectURL(f));
  }

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    acceptFile(e.target.files?.[0] ?? null);
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    acceptFile(e.dataTransfer.files?.[0] ?? null);
  }

  function clearFile() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(null);
    setPreviewUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");

    const finalCategory =
      category === "Other" && customCategory.trim()
        ? customCategory.trim()
        : category;

    if (!isEdit && !file) return setError("Pick a photo first.");
    if (!title.trim()) return setError("Give the piece a title.");

    setSubmitting(true);
    try {
      let imageUrl: string | undefined;
      let blobPathname: string | undefined;

      if (file) {
        const uploadForm = new FormData();
        uploadForm.append("file", file);
        const uploadRes = await fetch("/api/gallery/upload", {
          method: "POST",
          headers: { "x-admin-key": adminKey },
          body: uploadForm,
        });
        const uploadData = await uploadRes.json();
        if (!uploadRes.ok) throw new Error(uploadData.error || "Upload failed");
        imageUrl = uploadData.url;
        blobPathname = uploadData.pathname;
      }

      const res = await fetch(
        isEdit ? `/api/gallery/${item!.id}` : "/api/gallery",
        {
          method: isEdit ? "PATCH" : "POST",
          headers: {
            "Content-Type": "application/json",
            "x-admin-key": adminKey,
          },
          body: JSON.stringify({
            title: title.trim(),
            category: finalCategory,
            description: description.trim(),
            ...(imageUrl && blobPathname ? { imageUrl, blobPathname } : {}),
          }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not save");

      onSaved(data.item);

      if (!isEdit) {
        clearFile();
        setTitle("");
        setDescription("");
        setCustomCategory("");
        setCategory(GALLERY_CATEGORIES[0]);
        setSuccess(`"${data.item.title}" is live on the site.`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  const shownImage = previewUrl ?? item?.imageUrl ?? null;

  return (
    <form className="form" onSubmit={handleSubmit}>
      {shownImage ? (
        <div className="preview-wrap">
          {/* Local object URL or a Blob URL — next/image adds nothing here */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={shownImage} alt={title || "Gallery photo"} />
          <button
            type="button"
            className="preview-clear"
            onClick={() => (previewUrl ? clearFile() : fileInputRef.current?.click())}
          >
            {previewUrl && isEdit ? "Undo replacement" : "Change photo"}
          </button>
        </div>
      ) : (
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
          <strong>Drop a photo here, or click to browse</strong>
          <span>JPG, PNG, WEBP or GIF · up to 10MB</span>
        </div>
      )}

      {isEdit && previewUrl && (
        <p className="field-hint">
          The photo you&apos;re replacing is deleted when you save.
        </p>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        style={{ display: "none" }}
      />

      <div className="field">
        <label htmlFor={`g-title-${mode}`}>Title</label>
        <input
          id={`g-title-${mode}`}
          type="text"
          placeholder="Walnut end-grain cutting board"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>

      <div className="field">
        <label htmlFor={`g-category-${mode}`}>Category</label>
        <select
          id={`g-category-${mode}`}
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          {GALLERY_CATEGORIES.map((c) => (
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
        <label htmlFor={`g-description-${mode}`}>Details (optional)</label>
        <textarea
          id={`g-description-${mode}`}
          rows={3}
          placeholder="Wood species, dimensions, finish, anything worth mentioning."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>

      {error && <p className="alert alert-error">{error}</p>}
      {success && <p className="alert alert-success">{success}</p>}

      <div className="form-actions">
        <button type="submit" className="btn btn-solid" disabled={submitting}>
          {submitting ? "Saving…" : isEdit ? "Save changes" : "Add to Gallery"}
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
