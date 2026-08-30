import { Resend } from "resend";
import { formatUSD } from "@/lib/money";
import { site } from "@/site.config";
import type { Order } from "@/types/order";

/**
 * Resend's shared onboarding sender can only deliver to the account owner's
 * own inbox. Until otlwood.com is verified in Resend and ORDER_FROM_EMAIL is
 * set to an address on it, customer mail is skipped rather than silently
 * failing — the owner alert still goes out.
 */
const FROM = process.env.ORDER_FROM_EMAIL || "onboarding@resend.dev";

function client(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  return key ? new Resend(key) : null;
}

export function canEmailCustomers(): boolean {
  return Boolean(process.env.RESEND_API_KEY) && !FROM.endsWith("resend.dev");
}

function lines(order: Order): string {
  const parts = [
    `Order ${order.id}`,
    `${order.productTitle} — ${formatUSD(order.unitPriceCents)}`,
  ];
  if (order.taxCents > 0) parts.push(`Sales tax — ${formatUSD(order.taxCents)}`);
  parts.push(`Total paid — ${formatUSD(order.totalCents)}`);
  return parts.join("\n");
}

/** Always attempted — this one reaches Oliver's own inbox even unverified. */
export async function sendOwnerAlert(order: Order): Promise<void> {
  const resend = client();
  if (!resend) return;

  try {
    await resend.emails.send({
      from: FROM,
      to: site.email,
      subject: `Sold: ${order.productTitle} (${formatUSD(order.totalCents)})`,
      text: [
        lines(order),
        "",
        order.customerName ? `Buyer: ${order.customerName}` : "",
        order.customerEmail ? `Email: ${order.customerEmail}` : "",
        order.receiptUrl ? `Square receipt: ${order.receiptUrl}` : "",
        "",
        "Shipping address is on the Square order.",
      ]
        .filter(Boolean)
        .join("\n"),
    });
  } catch (err) {
    // A failed alert must never fail the webhook — Square would retry the
    // whole delivery and the order is already paid.
    console.error("[email] owner alert failed", err);
  }
}

export async function sendCustomerConfirmation(order: Order): Promise<void> {
  const resend = client();
  if (!resend || !order.customerEmail) return;

  if (!canEmailCustomers()) {
    console.warn(
      "[email] skipping customer confirmation — verify otlwood.com in Resend and set ORDER_FROM_EMAIL"
    );
    return;
  }

  try {
    await resend.emails.send({
      from: FROM,
      to: order.customerEmail,
      subject: `Your OTL Woodwork order (${order.id})`,
      text: [
        `Thanks${order.customerName ? `, ${order.customerName}` : ""} — your order is confirmed.`,
        "",
        lines(order),
        "",
        "It ships free within the US, usually within 2-3 business days.",
        "I'll follow up with tracking as soon as it's on its way.",
        "",
        "Questions? Just reply to this email.",
        "",
        "— Oliver, OTL Woodwork",
      ].join("\n"),
    });
  } catch (err) {
    console.error("[email] customer confirmation failed", err);
  }
}
