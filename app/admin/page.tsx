"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent, DragEvent, ChangeEvent } from "react";
import { GALLERY_CATEGORIES } from "@/types/gallery";
import type { GalleryItem } from "@/types/gallery";

const STORAGE_KEY = "otl_admin_key";

export default function AdminPage() {
  const [adminKey, setAdminKey] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);

  // Login form
  const [keyInput, setKeyInput] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loggingIn, setLoggingIn] = useState(false);

  // Gallery list
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);

  // Upload form
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<string>(GALLERY_CATEGORIES[0]);
  const [customCategory, setCustomCategory] = useState("");
  const [description, setDescription] = useState("");
  const [dragging, setDragging] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [formSuccess, setFormSuccess] = useState("");

  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadItems = useCallback(async () => {
    setLoadingItems(true);
    try {
      const res = await fetch("/api/gallery", { cache: "no-store" });
      const data = await res.json();
      setItems(data.items ?? []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingItems(false);
    }
  }, []);

  // Restore a previous session
  useEffect(() => {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    if (stored) setAdminKey(stored);
    setChecking(false);
  }, []);

  useEffect(() => {
    if (adminKey) loadItems();
  }, [adminKey, loadItems]);

  // Release the object URL when the preview changes or unmounts
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  /** Verify the password against the server before letting the user in. */
  async function handleLogin(e: FormEvent) {
    e.preventDefault();
    setLoginError("");
    setLoggingIn(true);
    try {
      // An empty POST returns 401 for a bad key, 400 for a good key with no body
      const res = await fetch("/api/gallery", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-key": keyInput },
        body: JSON.stringify({}),
      });
      if (res.status === 401) {
        setLoginError("That password isn't right.");
        return;
      }
      if (res.status === 503) {
        // No ADMIN_KEY configured on the server — say what to fix.
        const data = await res.json().catch(() => ({}));
        setLoginError(data.error || "Admin access isn't configured yet.");
        return;
      }
      sessionStorage.setItem(STORAGE_KEY, keyInput);
      setAdminKey(keyInput);
    } catch {
      setLoginError("Couldn't reach the server. Try again.");
    } finally {
      setLoggingIn(false);
    }
  }

  function handleLogout() {
    sessionStorage.removeItem(STORAGE_KEY);
    setAdminKey(null);
    setItems([]);
    setKeyInput("");
  }

  function acceptFile(f: File | null) {
    if (!f) return;
    if (!f.type.startsWith("image/")) {
      setFormError("That file isn't an image.");
      return;
    }
    setFormError("");
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

  function resetForm() {
    clearFile();
    setTitle("");
    setDescription("");
    setCustomCategory("");
    setCategory(GALLERY_CATEGORIES[0]);
  }

  async function handleUpload(e: FormEvent) {
    e.preventDefault();
    if (!adminKey) return;

    setFormError("");
    setFormSuccess("");

    const finalCategory =
      category === "Other" && customCategory.trim()
        ? customCategory.trim()
        : category;

    if (!file) return setFormError("Pick a photo first.");
    if (!title.trim()) return setFormError("Give the piece a title.");

    setSubmitting(true);
    try {
      // 1. Upload the image file to Blob storage
      const uploadForm = new FormData();
      uploadForm.append("file", file);

      const uploadRes = await fetch("/api/gallery/upload", {
        method: "POST",
        headers: { "x-admin-key": adminKey },
        body: uploadForm,
      });
      const uploadData = await uploadRes.json();
      if (!uploadRes.ok) throw new Error(uploadData.error || "Upload failed");

      // 2. Save the metadata pointing at it
      const createRes = await fetch("/api/gallery", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-key": adminKey },
        body: JSON.stringify({
          title: title.trim(),
          category: finalCategory,
          description: description.trim() || undefined,
          imageUrl: uploadData.url,
          blobPathname: uploadData.pathname,
        }),
      });
      const createData = await createRes.json();
      if (!createRes.ok) throw new Error(createData.error || "Could not save");

      setItems((prev) => [createData.item, ...prev]);
      setFormSuccess(`"${createData.item.title}" is live on the site.`);
      resetForm();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(item: GalleryItem) {
    if (!adminKey) return;
    if (!confirm(`Remove "${item.title}" from the gallery? This can't be undone.`))
      return;

    try {
      const res = await fetch(`/api/gallery/${item.id}`, {
        method: "DELETE",
        headers: { "x-admin-key": adminKey },
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Delete failed");
      }
      setItems((prev) => prev.filter((i) => i.id !== item.id));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Delete failed");
    }
  }

  if (checking) return null;

  // ---------- Login screen ----------
  if (!adminKey) {
    return (
      <main className="login-wrap">
        <form className="login-card" onSubmit={handleLogin}>
          <h1>Gallery Admin</h1>
          <p className="sub">Sign in to add or remove photos.</p>
          <div className="field">
            <label htmlFor="pw">Password</label>
            <input
              id="pw"
              type="password"
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              autoFocus
              autoComplete="current-password"
            />
          </div>
          {loginError && (
            <p className="alert alert-error" style={{ marginTop: "1rem" }}>
              {loginError}
            </p>
          )}
          <button
            type="submit"
            className="btn btn-solid"
            disabled={loggingIn || !keyInput}
          >
            {loggingIn ? "Checking…" : "Sign in"}
          </button>
        </form>
      </main>
    );
  }

  // ---------- Admin dashboard ----------
  return (
    <main className="admin-wrap">
      <div className="admin-head">
        <div>
          <h1>Gallery Admin</h1>
          <p className="sub">
            Photos you add here go live on the site right away.
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.75rem" }}>
          <a href="/" className="link-btn" style={{ textDecoration: "none" }}>
            View site ↗
          </a>
          <button className="link-btn" onClick={handleLogout} type="button">
            Sign out
          </button>
        </div>
      </div>

      <section className="card">
        <h2>Add a photo</h2>
        <form className="form" onSubmit={handleUpload}>
          {previewUrl ? (
            <div className="preview-wrap">
              {/* Local object URL preview — next/image isn't useful here */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={previewUrl} alt="Preview of the photo to upload" />
              <button type="button" className="preview-clear" onClick={clearFile}>
                Change photo
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

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            style={{ display: "none" }}
          />

          <div className="field">
            <label htmlFor="title">Title</label>
            <input
              id="title"
              type="text"
              placeholder="Walnut end-grain cutting board"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="field">
            <label htmlFor="category">Category</label>
            <select
              id="category"
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
            <label htmlFor="description">Details (optional)</label>
            <textarea
              id="description"
              rows={3}
              placeholder="Wood species, dimensions, finish, anything worth mentioning."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          {formError && <p className="alert alert-error">{formError}</p>}
          {formSuccess && <p className="alert alert-success">{formSuccess}</p>}

          <button type="submit" className="btn btn-solid" disabled={submitting}>
            {submitting ? "Uploading…" : "Add to Gallery"}
          </button>
        </form>
      </section>

      <div className="admin-section-head">
        <h2>In the gallery ({items.length})</h2>
        <button className="link-btn" onClick={loadItems} type="button">
          {loadingItems ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {items.length === 0 && !loadingItems ? (
        <div className="gallery-empty">
          <p style={{ margin: 0 }}>Nothing here yet. Add your first photo above.</p>
        </div>
      ) : (
        <div className="admin-grid">
          {items.map((item) => (
            <div key={item.id} className="admin-item">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={item.imageUrl} alt={item.title} />
              <div className="admin-item-body">
                <p className="t">{item.title}</p>
                <p className="c">{item.category}</p>
              </div>
              <button
                type="button"
                className="del"
                onClick={() => handleDelete(item)}
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
