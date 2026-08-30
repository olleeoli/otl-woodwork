import type { Metadata } from "next";
import Link from "next/link";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import ShopGrid from "@/components/ShopGrid";
import { listProducts } from "@/lib/products";
import { site } from "@/site.config";
import type { Product } from "@/types/product";

// Match the homepage: re-check storage at most once a minute so new listings
// appear quickly without hitting Redis on every view.
export const revalidate = 60;

export const metadata: Metadata = {
  title: "Shop — OTL Woodwork",
  description:
    "Finished pieces ready to ship — cutting boards, serving pieces, signs, and home decor, built one at a time in the shop.",
};

export default async function ShopPage() {
  let products: Product[] = [];
  try {
    products = await listProducts();
  } catch (err) {
    // A storage hiccup should show an empty shop, not an error page
    console.error("Could not load products", err);
  }

  return (
    <>
      <SiteHeader />

      <main>
        <section className="section">
          <div className="container">
            <div className="section-head">
              <h2>{site.shop.heading}</h2>
              <p>{site.shop.sub}</p>
            </div>

            <ShopGrid items={products} />

            <p className="shop-footnote">
              Looking for something built to your size and spec instead?{" "}
              <Link href="/custom">Start a custom project</Link>.
            </p>
          </div>
        </section>
      </main>

      <SiteFooter />
    </>
  );
}
