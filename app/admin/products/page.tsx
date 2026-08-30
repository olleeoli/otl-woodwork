"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent, DragEvent, ChangeEvent } from "react";
import Link from "next/link";
import { PRODUCT_CATEGORIES, SHIPPING_TIERS } from "@/types/product";
import type { Product, ShippingTier } from "@/types/product";
import { formatUSD } from "@/lib/money";

// Same key as the gallery admin, so signing in once covers both screens.
const STORAGE_KEY = "otl_admin_key";

interface Staged {
  file: File;
  previewUrl: string;
}

export default function ProductAdminPage() {
  const [adminKey, setAdminKey] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);

  // Login
  const [keyInput, setKeyInput] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loggingIn, setLoggingIn] = useState(false);

  // Listing
  const [products, setProducts] = useState<Product[]>([]);
  const [loadingList, setLoadingList] = useState(false);

  // New-product form
  const [staged, setStaged] = useState<Staged[]>([]);
  const [title, setTitle] = useState("");
  const [price, setPrice] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [category, setCategory] = useState<string>(PRODUCT_CATEGORIES[0]);
  const [customCategory, setCustomCategory] = useState("");
  const [shippingTier, setShippingTier] = useState<ShippingTier>("medium");
  const [description, setDescription] = useState("");
  const [species, setSpecies] = useState("");
  const [dimensions, setDimensions] = useState("");
  const [finish, setFinish] = useState("");
  const [shipsIn, setShipsIn] = useState("");
  const [active, setActive] = useState(true);

  const [dragging, setDragging] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [formSuccess, setFormSuccess] = useState("");

  const fileInputRef = useRef<HTMLInputElement>(null);
  // Mirrored in an effect (never during render) so the unmount cleanup below
  // can revoke whatever object URLs were live at teardown.
  const stagedRef = useRef<Staged[]>([]);

  const loadProducts = useCallback(async (key: string) => {
    setLoadingList(true);
    try {
      const res = await fetch("/api/products", {
        cache: "no-store",
        headers: { "x-admin-key": key },
      });
      const data = await res.json();
      setProducts(data.products ?? []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => {
    stagedRef.current = staged;
  }, [staged]);

  // Restore a previous session and load the list in one pass. sessionStorage
  // only exists after mount, so setting state from this effect is correct
  // here in a way the lint rule can't express.
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    const stored = sessionStorage.getItem(STORAGE_KEY);
    if (stored) {
      setAdminKey(stored);
      loadProducts(stored);
    }
    setChecking(false);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [loadProducts]);

  useEffect(() => {
    return () => {
      for (const s of stagedRef.current) URL.revokeObjectURL(s.previewUrl);
    };
  }, []);

  async function handleLogin(e: FormEvent) {
    e.preventDefault();
    setLoginError("");
    setLoggingIn(true);
    try {
      // An empty POST returns 401 for a bad key, 400 for a good key with no body
      const res = await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-key": keyInput },
        body: JSON.stringify({}),
      });
      if (res.status === 401) {
        setLoginError("That password isn't right.");
        return;
      }
      if (res.status === 503) {
        const data = await res.json().catch(() => ({}));
        setLoginError(data.error || "Admin access isn't configured yet.");
        return;
      }
      sessionStorage.setItem(STORAGE_KEY, keyInput);
      setAdminKey(keyInput);
      loadProducts(keyInput);
    } catch {
      setLoginError("Couldn't reach the server. Try again.");
    } finally {
      setLoggingIn(false);
    }
  }

  function handleLogout() {
    sessionStorage.removeItem(STORAGE_KEY);
    setAdminKey(null);
    setProducts([]);
    setKeyInput("");
  }

  function acceptFiles(list: FileList | null) {
    if (!list || list.length === 0) return;
    const images = Array.from(list).filter((f) => f.type.startsWith("image/"));
    if (images.length === 0) {
      setFormError("Those files aren't images.");
      return;
    }
    setFormError("");
    setStaged((prev) => [
      ...prev,
      ...images.map((file) => ({ file, previewUrl: URL.createObjectURL(file) })),
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

  function removeStaged(index: number) {
    setStaged((prev) => {
      const target = prev[index];
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((_, i) => i !== index);
    });
  }

  function resetForm() {
    for (const s of staged) URL.revokeObjectURL(s.previewUrl);
    setStaged([]);
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
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!adminKey) return;

    setFormError("");
    setFormSuccess("");

    const finalCategory =
      category === "Other" && customCategory.trim()
        ? customCategory.trim()
        : category;

    if (staged.length === 0) return setFormError("Add at least one photo.");
    if (!title.trim()) return setFormError("Give the product a title.");
    if (!price.trim()) return setFormError("Set a price.");

    setSubmitting(true);
    try {
      // 1. Push every photo to Blob first, keeping upload order as photo order
      const images: string[] = [];
      const blobPathnames: string[] = [];

      for (const item of staged) {
        const uploadForm = new FormData();
        uploadForm.append("file", item.file);
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

      // 2. Save the product record pointing at them
      const res = await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-key": adminKey },
        body: JSON.stringify({
          title: title.trim(),
          category: finalCategory,
          price: price.trim(),
          quantity: Number(quantity) || 0,
          description: description.trim() || undefined,
          species: species.trim() || undefined,
          dimensions: dimensions.trim() || undefined,
          finish: finish.trim() || undefined,
          shipsIn: shipsIn.trim() || undefined,
          shippingTier,
          images,
          blobPathnames,
          active,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not save");

      setProducts((prev) => [data.product, ...prev]);
      setFormSuccess(
        active
          ? `"${data.product.title}" is live in the shop.`
          : `"${data.product.title}" is saved but hidden.`
      );
      resetForm();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleActive(product: Product) {
    if (!adminKey) return;
    try {
      const res = await fetch(`/api/products/${product.slug}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-admin-key": adminKey },
        body: JSON.stringify({ active: !product.active }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Update failed");
      setProducts((prev) =>
        prev.map((p) => (p.slug === product.slug ? data.product : p))
      );
    } catch (err) {
      alert(err instanceof Error ? err.message : "Update failed");
    }
  }

  async function handleDelete(product: Product) {
    if (!adminKey) return;
    if (
      !confirm(
        `Delete "${product.title}" and its photos? This can't be undone.`
      )
    )
      return;

    try {
      const res = await fetch(`/api/products/${product.slug}`, {
        method: "DELETE",
        headers: { "x-admin-key": adminKey },
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Delete failed");
      }
      setProducts((prev) => prev.filter((p) => p.slug !== product.slug));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Delete failed");
    }
  }

  if (checking) return null;

  // ---------- Login ----------
  if (!adminKey) {
    return (
      <main className="login-wrap">
        <form className="login-card" onSubmit={handleLogin}>
          <h1>Shop Admin</h1>
          <p className="sub">Sign in to add or edit products.</p>
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

  const liveCount = products.filter((p) => p.active).length;

  // ---------- Dashboard ----------
  return (
    <main className="admin-wrap">
      <div className="admin-head">
        <div>
          <h1>Shop Admin</h1>
          <p className="sub">
            {products.length} listed · {liveCount} live ·{" "}
            {products.length - liveCount} hidden
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.75rem" }}>
          <Link href="/shop" className="link-btn" style={{ textDecoration: "none" }}>
            View shop ↗
          </Link>
          <Link href="/admin" className="link-btn" style={{ textDecoration: "none" }}>
            Gallery
          </Link>
          <button className="link-btn" onClick={handleLogout} type="button">
            Sign out
          </button>
        </div>
      </div>

      <section className="card">
        <h2>Add a product</h2>
        <form className="form" onSubmit={handleCreate}>
          {staged.length > 0 && (
            <div className="thumb-strip">
              {staged.map((s, i) => (
                <figure key={s.previewUrl}>
                  {/* Local object URL preview — next/image isn't useful here */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={s.previewUrl} alt={`Photo ${i + 1}`} />
                  <button
                    type="button"
                    onClick={() => removeStaged(i)}
                    aria-label={`Remove photo ${i + 1}`}
                  >
                    ×
                  </button>
                  {i === 0 && <span className="cover-tag">Cover</span>}
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
              {staged.length > 0
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
            <label htmlFor="title">Title</label>
            <input
              id="title"
              type="text"
              placeholder="End-grain board — walnut & maple"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="field-row">
            <div className="field">
              <label htmlFor="price">Price (USD)</label>
              <input
                id="price"
                type="text"
                inputMode="decimal"
                placeholder="145.00"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="qty">Quantity in stock</label>
              <input
                id="qty"
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
              <label htmlFor="category">Category</label>
              <select
                id="category"
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
              <label htmlFor="tier">Shipping tier</label>
              <select
                id="tier"
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
            <label htmlFor="description">Description</label>
            <textarea
              id="description"
              rows={3}
              placeholder="What a photo can't say — how it was built, how it wears, what makes this one different."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="field-row">
            <div className="field">
              <label htmlFor="species">Species (optional)</label>
              <input
                id="species"
                type="text"
                placeholder="Black walnut, hard maple"
                value={species}
                onChange={(e) => setSpecies(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="dimensions">Dimensions (optional)</label>
              <input
                id="dimensions"
                type="text"
                placeholder={'16" × 12" × 1.5"'}
                value={dimensions}
                onChange={(e) => setDimensions(e.target.value)}
              />
            </div>
          </div>

          <div className="field-row">
            <div className="field">
              <label htmlFor="finish">Finish (optional)</label>
              <input
                id="finish"
                type="text"
                placeholder="Food-safe oil & beeswax"
                value={finish}
                onChange={(e) => setFinish(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="shipsIn">Ships in (optional)</label>
              <input
                id="shipsIn"
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

          {formError && <p className="alert alert-error">{formError}</p>}
          {formSuccess && <p className="alert alert-success">{formSuccess}</p>}

          <button type="submit" className="btn btn-solid" disabled={submitting}>
            {submitting ? "Saving…" : "Save product"}
          </button>
        </form>
      </section>

      <div className="admin-section-head">
        <h2>Listed ({products.length})</h2>
        <button
          className="link-btn"
          onClick={() => adminKey && loadProducts(adminKey)}
          type="button"
        >
          {loadingList ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {products.length === 0 && !loadingList ? (
        <div className="gallery-empty">
          <p style={{ margin: 0 }}>
            Nothing listed yet. Add your first product above.
          </p>
        </div>
      ) : (
        <div className="admin-grid">
          {products.map((product) => (
            <div key={product.slug} className="admin-item">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={product.images[0]} alt={product.title} />
              <div className="admin-item-body">
                <p className="t">{product.title}</p>
                <p className="c">
                  {product.category} ·{" "}
                  {product.quantity > 0
                    ? `${product.quantity} in stock`
                    : "sold out"}
                </p>
                <p className="c">
                  <span className="price">{formatUSD(product.priceCents)}</span>{" "}
                  <span className={product.active ? "pill live" : "pill hidden-pill"}>
                    {product.active ? "Live" : "Hidden"}
                  </span>
                </p>
              </div>
              <div className="admin-item-actions">
                <button
                  type="button"
                  className="link-btn"
                  onClick={() => toggleActive(product)}
                >
                  {product.active ? "Hide" : "Make live"}
                </button>
                <button
                  type="button"
                  className="del"
                  onClick={() => handleDelete(product)}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
