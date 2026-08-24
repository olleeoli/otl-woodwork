"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import type { GalleryItem } from "@/types/gallery";

export default function GalleryGrid({ items }: { items: GalleryItem[] }) {
  const [active, setActive] = useState("All");
  const [openItem, setOpenItem] = useState<GalleryItem | null>(null);

  const categories = useMemo(() => {
    const seen: string[] = [];
    for (const item of items) {
      if (!seen.includes(item.category)) seen.push(item.category);
    }
    return ["All", ...seen];
  }, [items]);

  const filtered = useMemo(
    () => (active === "All" ? items : items.filter((i) => i.category === active)),
    [items, active]
  );

  const close = useCallback(() => setOpenItem(null), []);

  // Close the lightbox on Escape, and stop the page behind it from scrolling
  useEffect(() => {
    if (!openItem) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // The sticky header uses backdrop-filter, which creates a backdrop root
    // that renders through the lightbox scrim in Chromium. This class turns
    // the blur off for as long as the lightbox is open.
    document.body.classList.add("lb-open");
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      document.body.classList.remove("lb-open");
    };
  }, [openItem, close]);

  if (items.length === 0) {
    return (
      <div className="gallery-empty">
        <p style={{ margin: 0 }}>
          No pieces posted yet — new work will show up here.
        </p>
      </div>
    );
  }

  return (
    <>
      {categories.length > 2 && (
        <div className="filters">
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              className={cat === active ? "chip active" : "chip"}
              onClick={() => setActive(cat)}
            >
              {cat}
            </button>
          ))}
        </div>
      )}

      <div className="gallery-grid">
        {filtered.map((item, i) => (
          <button
            key={item.id}
            type="button"
            className="gallery-card"
            onClick={() => setOpenItem(item)}
            aria-label={`View ${item.title}`}
          >
            <div className="gallery-img">
              <Image
                src={item.imageUrl}
                alt={item.title}
                fill
                sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                style={{ objectFit: "cover" }}
                priority={i < 3}
              />
            </div>
            <div className="gallery-caption">
              <span className="title">{item.title}</span>
              <span className="cat">{item.category}</span>
            </div>
          </button>
        ))}
      </div>

      {openItem && (
        <div
          className="lb-overlay"
          onClick={close}
          role="dialog"
          aria-modal="true"
          aria-label={openItem.title}
        >
          <div className="lb-panel" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="lb-close"
              onClick={close}
              aria-label="Close"
            >
              &times;
            </button>
            <div className="lb-img">
              <Image
                src={openItem.imageUrl}
                alt={openItem.title}
                fill
                sizes="90vw"
                style={{ objectFit: "contain" }}
              />
            </div>
            <div className="lb-body">
              <h3>{openItem.title}</h3>
              <p className="cat">{openItem.category}</p>
              {openItem.description && (
                <p className="desc">{openItem.description}</p>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
