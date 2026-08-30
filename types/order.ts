/**
 * A shop order. Written as "pending" when a Square payment link is created,
 * flipped to "paid" by the webhook. Money is always integer cents.
 */
export interface Order {
  /** Short public id — appears in the confirmation URL and as Square's referenceId. */
  id: string;
  productSlug: string;
  productTitle: string;
  unitPriceCents: number;
  taxCents: number;
  totalCents: number;
  /** Two-letter state the buyer selected, used only to decide sales tax. */
  shipToState?: string;
  status: "pending" | "paid";
  squareOrderId?: string;
  squarePaymentId?: string;
  receiptUrl?: string;
  customerEmail?: string;
  customerName?: string;
  createdAt: number;
  paidAt?: number;
}
