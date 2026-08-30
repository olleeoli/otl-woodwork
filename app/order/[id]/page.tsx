import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import { getOrder } from "@/lib/orders";
import { formatUSD } from "@/lib/money";
import { site } from "@/site.config";

// Never cache an order page — the webhook flips status seconds after the
// buyer lands here, and a cached "pending" would look like a failed payment.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Your order — OTL Woodwork",
  robots: { index: false, follow: false },
};

type Ctx = { params: Promise<{ id: string }> };

export default async function OrderPage({ params }: Ctx) {
  const { id } = await params;
  const order = await getOrder(id);
  if (!order) notFound();

  const paid = order.status === "paid";

  return (
    <>
      <SiteHeader />

      <main>
        <section className="section">
          <div className="container">
            <div className="order-card">
              <p className="eyebrow" style={{ color: "var(--accent)" }}>
                Order {order.id}
              </p>

              <h1>{paid ? "Thank you — you're all set." : "Finishing up…"}</h1>

              {paid ? (
                <p className="order-lede">
                  Your payment came through and the piece is yours. I&apos;ll pack
                  it up and follow up with tracking, usually within 2-3 business
                  days.
                </p>
              ) : (
                <p className="order-lede">
                  Square hasn&apos;t confirmed this payment to me yet. That
                  normally takes a few seconds — refresh this page in a moment. If
                  it still says this after a few minutes and you were charged,
                  email me and I&apos;ll sort it out.
                </p>
              )}

              <dl className="product-specs" style={{ marginTop: "1.5rem" }}>
                <div>
                  <dt>{order.productTitle}</dt>
                  <dd>{formatUSD(order.unitPriceCents)}</dd>
                </div>
                {order.taxCents > 0 && (
                  <div>
                    <dt>Sales tax</dt>
                    <dd>{formatUSD(order.taxCents)}</dd>
                  </div>
                )}
                <div>
                  <dt>Shipping</dt>
                  <dd>Free</dd>
                </div>
                <div>
                  <dt>Total</dt>
                  <dd>{formatUSD(order.totalCents)}</dd>
                </div>
              </dl>

              {order.receiptUrl && (
                <p className="order-links">
                  <a href={order.receiptUrl}>View your Square receipt</a>
                </p>
              )}

              <p className="order-links">
                <Link href="/shop">Back to the shop</Link>
                {" · "}
                <a href={`mailto:${site.email}?subject=Order%20${order.id}`}>
                  Email about this order
                </a>
              </p>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </>
  );
}
