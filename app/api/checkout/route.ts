import { NextRequest, NextResponse } from "next/server";
import { getProduct, updateProduct } from "@/lib/products";
import { newOrderId, saveOrder } from "@/lib/orders";
import { getSquareClient, baseUrl } from "@/lib/square";
import { site } from "@/site.config";
import type { Order } from "@/types/order";

export const dynamic = "force-dynamic";

/** How long a started checkout blocks OTHER buyers on a one-of-a-kind piece. */
const HOLD_MS = 10 * 60 * 1000;

/** Names the cookie that identifies the browser holding a piece. */
const HOLD_COOKIE = "otl_hold";

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const slug = typeof body.slug === "string" ? body.slug : "";
  const shipToState =
    typeof body.shipToState === "string" ? body.shipToState.toUpperCase() : "";

  if (!slug) return NextResponse.json({ error: "Missing product" }, { status: 400 });

  // Everything that decides the price is read here, from storage. The browser
  // sends a slug and a state, nothing else — never a price.
  const product = await getProduct(slug);
  if (!product || !product.active) {
    return NextResponse.json({ error: "That piece isn't available." }, { status: 404 });
  }

  if (product.quantity <= 0) {
    return NextResponse.json(
      { error: "This one has already sold." },
      { status: 409 }
    );
  }

  const now = Date.now();
  const heldByThisBrowser =
    product.reservedBy !== undefined &&
    product.reservedBy !== "" &&
    req.cookies.get(HOLD_COOKIE)?.value === product.reservedBy;

  // A live hold blocks other buyers, never the person who placed it —
  // otherwise anyone who backs out of Square is locked out of their own
  // purchase until the hold expires.
  if (product.reservedUntil && product.reservedUntil > now && !heldByThisBrowser) {
    return NextResponse.json(
      {
        error:
          "Someone else is checking out with this piece right now. Try again in a few minutes.",
      },
      { status: 409 }
    );
  }

  const taxRate = site.commerce.gaTaxRatePercent;
  if (taxRate > 0 && !shipToState) {
    return NextResponse.json(
      { error: "Choose where this is shipping so tax can be calculated." },
      { status: 400 }
    );
  }

  const taxable = taxRate > 0 && shipToState === "GA";
  const taxCents = taxable
    ? Math.round((product.priceCents * taxRate) / 100)
    : 0;

  const square = getSquareClient();
  const locationId = process.env.SQUARE_LOCATION_ID;
  if (!square || !locationId) {
    console.error("Checkout attempted with no Square credentials configured");
    return NextResponse.json(
      { error: "Checkout isn't set up yet. Email me and I'll take the order directly." },
      { status: 503 }
    );
  }

  const orderId = newOrderId();

  try {
    const response = await square.checkout.paymentLinks.create({
      idempotencyKey: `shop-${orderId}`,
      order: {
        locationId,
        referenceId: orderId,
        lineItems: [
          {
            name: product.title,
            note: `otlwood.com/shop/${product.slug}`,
            quantity: "1",
            basePriceMoney: {
              amount: BigInt(product.priceCents),
              currency: "USD",
            },
          },
        ],
        ...(taxable
          ? {
              taxes: [
                {
                  name: "GA Sales Tax",
                  percentage: String(taxRate),
                  scope: "ORDER" as const,
                },
              ],
            }
          : {}),
      },
      checkoutOptions: {
        redirectUrl: `${baseUrl()}/order/${orderId}`,
        askForShippingAddress: true,
      },
    });

    const url = response.paymentLink?.url;
    if (!url) throw new Error("Square returned no payment link");

    const order: Order = {
      id: orderId,
      productSlug: product.slug,
      productTitle: product.title,
      unitPriceCents: product.priceCents,
      taxCents,
      totalCents: product.priceCents + taxCents,
      shipToState: shipToState || undefined,
      status: "pending",
      createdAt: now,
    };

    await saveOrder(order);
    await updateProduct(product.slug, {
      reservedUntil: now + HOLD_MS,
      reservedBy: orderId,
    });

    const res = NextResponse.json({ url, orderId });
    res.cookies.set(HOLD_COOKIE, orderId, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: HOLD_MS / 1000,
    });
    return res;
  } catch (err) {
    console.error("Checkout failed", err);
    return NextResponse.json(
      { error: "Could not start checkout. Try again in a moment." },
      { status: 500 }
    );
  }
}
