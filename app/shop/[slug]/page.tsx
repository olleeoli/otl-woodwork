import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import ProductGallery from "@/components/ProductGallery";
import BuyButton from "@/components/BuyButton";
import { getProduct } from "@/lib/products";
import { formatUSD } from "@/lib/money";
import { isCheckoutConfigured } from "@/lib/square";
import { site } from "@/site.config";

export const revalidate = 60;

type Ctx = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Ctx): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProduct(slug);
  if (!product || !product.active) return { title: "Not found — OTL Woodwork" };

  return {
    title: `${product.title} — OTL Woodwork`,
    description:
      product.description ||
      `${product.title} — handmade ${product.category.toLowerCase()} from OTL Woodwork.`,
    openGraph: {
      title: `${product.title} — OTL Woodwork`,
      description: product.description || undefined,
      images: product.images.length ? [product.images[0]] : undefined,
      type: "website",
    },
  };
}

export default async function ProductPage({ params }: Ctx) {
  const { slug } = await params;
  const product = await getProduct(slug);

  // A hidden product is a draft. It must 404 like any other unknown URL
  // rather than hinting that something exists at this address.
  if (!product || !product.active) notFound();

  const soldOut = product.quantity <= 0;

  const specs = [
    ["Species", product.species],
    ["Dimensions", product.dimensions],
    ["Finish", product.finish],
    ["Ships", product.shipsIn],
  ].filter((row): row is [string, string] => Boolean(row[1]));

  // Checkout is the CTA when Square is configured. The mailto below is the
  // fallback for a deploy with no credentials — better than a dead button.
  const mailto =
    `mailto:${site.email}` +
    `?subject=${encodeURIComponent(`Order: ${product.title}`)}` +
    `&body=${encodeURIComponent(
      `I'd like to order "${product.title}" (${formatUSD(product.priceCents)}).\n\n` +
        `Shipping to:\n\n\n` +
        `Link: https://otlwood.com/shop/${product.slug}\n`
    )}`;

  return (
    <>
      <SiteHeader />

      <main>
        <section className="section">
          <div className="container">
            <p className="product-back">
              <Link href="/shop">&larr; Back to the shop</Link>
            </p>

            <div className="product-layout">
              <ProductGallery images={product.images} title={product.title} />

              <div className="product-info">
                <span className="cat">
                  {product.category}
                  {!soldOut && " · Ready to ship"}
                </span>
                <h1>{product.title}</h1>
                <span className={soldOut ? "product-price out" : "product-price"}>
                  {formatUSD(product.priceCents)}
                </span>

                <span className={soldOut ? "product-stock out" : "product-stock"}>
                  <i />
                  {soldOut
                    ? "Sold — this one has found a home"
                    : product.quantity === 1
                      ? "In stock — 1 available"
                      : `In stock — ${product.quantity} available`}
                </span>

                {product.description && (
                  <p className="product-desc">{product.description}</p>
                )}

                {specs.length > 0 && (
                  <dl className="product-specs">
                    {specs.map(([label, value]) => (
                      <div key={label}>
                        <dt>{label}</dt>
                        <dd>{value}</dd>
                      </div>
                    ))}
                  </dl>
                )}

                {soldOut ? (
                  <>
                    <Link href="/custom" className="btn btn-solid product-cta">
                      Commission something similar
                    </Link>
                    <p className="product-note">
                      This piece is gone, but most of what I make can be built
                      again to your dimensions.
                    </p>
                  </>
                ) : isCheckoutConfigured() ? (
                  <BuyButton
                    slug={product.slug}
                    taxRatePercent={site.commerce.gaTaxRatePercent}
                    shippingNote={site.commerce.shippingNote}
                  />
                ) : (
                  <>
                    <a href={mailto} className="btn btn-solid product-cta">
                      Ask about this piece
                    </a>
                    <p className="product-note">
                      Opens an email with the piece and price filled in. I&apos;ll
                      confirm shipping to your address and send a payment link.
                    </p>
                  </>
                )}
              </div>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </>
  );
}
