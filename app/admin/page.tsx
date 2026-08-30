"use client";

import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import Link from "next/link";
import GalleryForm from "@/components/GalleryForm";
import type { GalleryItem } from "@/types/gallery";

// Same key as the shop admin, so signing in once covers both screens.
const STORAGE_KEY = "otl_admin_key";

export default function AdminPage() {
  const [adminKey, setAdminKey] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);

  // Login
  const [keyInput, setKeyInput] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loggingIn, setLoggingIn] = useState(false);

  // Listing
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);

  /** Id of the photo currently open for editing, if any. */
  const [editingId, setEditingId] = useState<string | null>(null);

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

  // Restore a previous session and load the list in one pass. sessionStorage
  // only exists after mount, so setting state from this effect is correct
  // here in a way the lint rule can't express.
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    const stored = sessionStorage.getItem(STORAGE_KEY);
    if (stored) {
      setAdminKey(stored);
      loadItems();
    }
    setChecking(false);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [loadItems]);

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
        const data = await res.json().catch(() => ({}));
        setLoginError(data.error || "Admin access isn't configured yet.");
        return;
      }
      sessionStorage.setItem(STORAGE_KEY, keyInput);
      setAdminKey(keyInput);
      loadItems();
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
    setEditingId(null);
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
      if (editingId === item.id) setEditingId(null);
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
          <h1>Gallery Admin</h1>
          <p className="sub">Sign in to add, edit, or remove photos.</p>
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

  const editing = items.find((i) => i.id === editingId) ?? null;

  // ---------- Dashboard ----------
  return (
    <main className="admin-wrap">
      <div className="admin-head">
        <div>
          <h1>Gallery Admin</h1>
          <p className="sub">
            Photos you add or change here go live on the site right away.
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.75rem" }}>
          <Link href="/" className="link-btn" style={{ textDecoration: "none" }}>
            View site ↗
          </Link>
          <Link
            href="/admin/products"
            className="link-btn"
            style={{ textDecoration: "none" }}
          >
            Shop
          </Link>
          <button className="link-btn" onClick={handleLogout} type="button">
            Sign out
          </button>
        </div>
      </div>

      {editing ? (
        <section className="card">
          <h2>Editing “{editing.title}”</h2>
          <GalleryForm
            mode="edit"
            key={editing.id}
            item={editing}
            adminKey={adminKey}
            onSaved={(updated) => {
              setItems((prev) =>
                prev.map((i) => (i.id === updated.id ? updated : i))
              );
              setEditingId(null);
            }}
            onCancel={() => setEditingId(null)}
          />
        </section>
      ) : (
        <section className="card">
          <h2>Add a photo</h2>
          <GalleryForm
            mode="create"
            adminKey={adminKey}
            onSaved={(created) => setItems((prev) => [created, ...prev])}
          />
        </section>
      )}

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
            <div
              key={item.id}
              className={item.id === editingId ? "admin-item editing" : "admin-item"}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={item.imageUrl} alt={item.title} />
              <div className="admin-item-body">
                <p className="t">{item.title}</p>
                <p className="c">{item.category}</p>
              </div>
              <div className="admin-item-actions">
                <button
                  type="button"
                  className="link-btn"
                  onClick={() => {
                    setEditingId(item.id);
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className="del"
                  onClick={() => handleDelete(item)}
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
