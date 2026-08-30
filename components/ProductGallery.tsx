"use client";

import { useState } from "react";
import Image from "next/image";

export default function ProductGallery({
  images,
  title,
}: {
  images: string[];
  title: string;
}) {
  const [index, setIndex] = useState(0);
  const current = images[index] ?? images[0];

  return (
    <div className="product-gallery">
      <div className="product-main">
        <Image
          src={current}
          alt={title}
          fill
          sizes="(max-width: 720px) 100vw, 50vw"
          style={{ objectFit: "cover" }}
          priority
        />
      </div>

      {images.length > 1 && (
        <div className="product-thumbs">
          {images.map((src, i) => (
            <button
              key={src}
              type="button"
              className={i === index ? "product-thumb selected" : "product-thumb"}
              onClick={() => setIndex(i)}
              aria-label={`View photo ${i + 1} of ${images.length}`}
              aria-pressed={i === index}
            >
              <Image
                src={src}
                alt=""
                fill
                sizes="120px"
                style={{ objectFit: "cover" }}
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
