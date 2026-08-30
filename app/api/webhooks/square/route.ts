import { NextRequest, NextResponse } from "next/server";
import { WebhooksHelper } from "square";
import { claimOnce, getOrder, patchOrder } from "@/lib/orders";
import { getProduct, updateProduct } from "@/lib/products";
import { getSquareClient, baseUrl } from "@/lib/square";
import { sendCustomerConfirmation, sendOwnerAlert } from "@/lib/email";

export const dynamic = "force-dynamic";

/**
 * Square payment notifications.
 *
 * Two rules govern everything here:
 *  1. Never trust an unsigned request — anyone can POST to this URL.
 *  2. Never act twice on one payment. Square sends payment.created and one or
 *     more payment.updated events for the same payment, and retries any
 *     delivery we are slow to answer. Every side effect is claimed first.
 */
export async function POST(req: NextRequest) {
  const signatureKey = process.env.SQUARE_WEBHOOK_SIGNATURE_KEY;
  const rawBody = await req.text();
  const signature = req.headers.get("x-square-hmacsha256-signature") ?? "";

  if (!signatureKey) {
    console.error("[square-webhook] SQUARE_WEBHOOK_SIGNATURE_KEY is not set");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 503 });
  }

  const isValid = WebhooksHelper.verifySignature({
    requestBody: rawBody,
    signatureHeader: signature,
    signatureKey,
    notificationUrl: `${baseUrl()}/api/webhooks/square`,
  });

  if (!isValid) {
    console.warn("[square-webhook] rejected: bad signature");
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const event = JSON.parse(rawBody);
  const payment = event?.data?.object?.payment;

  const isCompleted =
    (event.type === "payment.created" || event.type === "payment.updated") &&
    payment?.status === "COMPLETED";

  if (!isCompleted || !payment?.id) {
    return NextResponse.json({ received: true, ignored: true });
  }

  // Claim before doing anything with side effects.
  const first = await claimOnce(`webhook:payment:${payment.id}`);
  if (!first) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  try {
    const square = getSquareClient();
    if (!square || !payment.order_id) {
      console.error("[square-webhook] no Square client or order_id on payment");
      return NextResponse.json({ received: true });
    }

    const orderResp = await square.orders.get({ orderId: payment.order_id });
    const reference = orderResp.order?.referenceId;
    if (!reference) {
      console.error("[square-webhook] payment has no referenceId", payment.id);
      return NextResponse.json({ received: true });
    }

    const order = await getOrder(reference);
    if (!order) {
      console.error("[square-webhook] unknown order reference", reference);
      return NextResponse.json({ received: true });
    }

    const recipient = orderResp.order?.fulfillments?.[0]?.shipmentDetails?.recipient;

    const updated = await patchOrder(order.id, {
      status: "paid",
      paidAt: Date.now(),
      squareOrderId: payment.order_id,
      squarePaymentId: payment.id,
      receiptUrl: payment.receipt_url,
      // Square's SDK types these as string | null; the order record uses
      // optional properties, so null has to become undefined.
      customerEmail:
        recipient?.emailAddress ?? payment.buyer_email_address ?? undefined,
      customerName: recipient?.displayName ?? undefined,
    });

    // Decrement stock and release the hold. Guarded by the claim above, so a
    // retried delivery can't take the same piece out of inventory twice.
    const product = await getProduct(order.productSlug);
    if (product) {
      await updateProduct(product.slug, {
        quantity: Math.max(0, product.quantity - 1),
        reservedUntil: 0,
      });
    }

    if (updated) {
      await sendOwnerAlert(updated);
      await sendCustomerConfirmation(updated);
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    // The payment already succeeded. Answer 200 so Square stops retrying, and
    // leave a loud log — a retry would hit the duplicate guard anyway.
    console.error("[square-webhook] processing failed after payment", err);
    return NextResponse.json({ received: true, error: "processing-failed" });
  }
}
