"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { formatUSD } from "@/lib/money";
import type { Product } from "@/types/product";

export default function ShopGrid({ items }: { items: Product[] }) {
  const [active, setActive] = useState("All");

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

  if (items.length === 0) {
    return (
      <div className="gallery-empty">
        <p style={{ margin: 0 }}>
          Nothing listed right now — new pieces show up here as they come out of
          the shop.
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
              aria-pressed={cat === active}
            >
              {cat}
            </button>
          ))}
        </div>
      )}

      <div className="shop-grid">
        {filtered.map((item, i) => {
          const soldOut = item.quantity <= 0;
          return (
            <Link key={item.slug} href={`/shop/${item.slug}`} className="shop-card">
              <div className="shop-photo">
                <Image
                  src={item.images[0]}
                  alt={item.title}
                  fill
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                  style={{ objectFit: "cover" }}
                  priority={i < 3}
                />
                {soldOut ? (
                  <span className="shop-badge sold">Sold</span>
                ) : item.quantity === 1 ? (
                  <span className="shop-badge last">1 left</span>
                ) : null}
              </div>
              <div className="shop-card-body">
                <span className="c">{item.category}</span>
                <span className="t">{item.title}</span>
                <span className={soldOut ? "shop-price out" : "shop-price"}>
                  {formatUSD(item.priceCents)}
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </>
  );
}
