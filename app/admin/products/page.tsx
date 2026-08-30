"use client";

import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import Link from "next/link";
import ProductForm from "@/components/ProductForm";
import type { Product } from "@/types/product";
import { formatUSD } from "@/lib/money";

// Same key as the gallery admin, so signing in once covers both screens.
const STORAGE_KEY = "otl_admin_key";

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

  /** Slug of the product currently open for editing, if any. */
  const [editingSlug, setEditingSlug] = useState<string | null>(null);

  /**
   * Clock sampled when the list loads. Reading Date.now() during render is
   * impure and can make the hold badge unstable between renders; Refresh
   * re-samples it.
   */
  const [now, setNow] = useState(0);

  const loadProducts = useCallback(async (key: string) => {
    setLoadingList(true);
    try {
      const res = await fetch("/api/products", {
        cache: "no-store",
        headers: { "x-admin-key": key },
      });
      const data = await res.json();
      setProducts(data.products ?? []);
      setNow(Date.now());
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingList(false);
    }
  }, []);

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
    setEditingSlug(null);
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

  /** Release a hold left behind when a buyer abandoned Square's checkout. */
  async function clearHold(product: Product) {
    if (!adminKey) return;
    try {
      const res = await fetch(`/api/products/${product.slug}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-admin-key": adminKey },
        body: JSON.stringify({ clearHold: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not clear the hold");
      setProducts((prev) =>
        prev.map((p) => (p.slug === product.slug ? data.product : p))
      );
    } catch (err) {
      alert(err instanceof Error ? err.message : "Could not clear the hold");
    }
  }

  async function handleDelete(product: Product) {
    if (!adminKey) return;
    if (!confirm(`Delete "${product.title}" and its photos? This can't be undone.`))
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
      if (editingSlug === product.slug) setEditingSlug(null);
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
  const editing = products.find((p) => p.slug === editingSlug) ?? null;

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

      {editing ? (
        <section className="card">
          <h2>Editing “{editing.title}”</h2>
          <ProductForm
            mode="edit"
            key={editing.slug}
            product={editing}
            adminKey={adminKey}
            onSaved={(updated) => {
              setProducts((prev) =>
                prev.map((p) => (p.slug === updated.slug ? updated : p))
              );
              setEditingSlug(null);
            }}
            onCancel={() => setEditingSlug(null)}
          />
        </section>
      ) : (
        <section className="card">
          <h2>Add a product</h2>
          <ProductForm
            mode="create"
            adminKey={adminKey}
            onSaved={(created) => setProducts((prev) => [created, ...prev])}
          />
        </section>
      )}

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
            <div
              key={product.slug}
              className={
                product.slug === editingSlug ? "admin-item editing" : "admin-item"
              }
            >
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
                  </span>{" "}
                  {product.reservedUntil && product.reservedUntil > now ? (
                    <span className="pill held">On hold</span>
                  ) : null}
                </p>
              </div>
              <div className="admin-item-actions">
                <button
                  type="button"
                  className="link-btn"
                  onClick={() => {
                    setEditingSlug(product.slug);
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className="link-btn"
                  onClick={() => toggleActive(product)}
                >
                  {product.active ? "Hide" : "Make live"}
                </button>
                {product.reservedUntil && product.reservedUntil > now ? (
                  <button
                    type="button"
                    className="link-btn"
                    onClick={() => clearHold(product)}
                  >
                    Clear hold
                  </button>
                ) : null}
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
