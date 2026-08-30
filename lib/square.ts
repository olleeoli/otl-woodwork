import { SquareClient, SquareEnvironment } from "square";

/**
 * Square client built from environment variables. Returns null when the
 * project has no credentials, so pages can degrade to "checkout unavailable"
 * instead of throwing at import time.
 */
export function getSquareClient(): SquareClient | null {
  const token = process.env.SQUARE_ACCESS_TOKEN;
  if (!token) return null;

  return new SquareClient({
    token,
    environment:
      process.env.SQUARE_ENVIRONMENT === "sandbox"
        ? SquareEnvironment.Sandbox
        : SquareEnvironment.Production,
  });
}

export function isCheckoutConfigured(): boolean {
  return Boolean(process.env.SQUARE_ACCESS_TOKEN && process.env.SQUARE_LOCATION_ID);
}

/** Public origin, used for Square redirect and webhook signature checks. */
export function baseUrl(): string {
  return process.env.NEXT_PUBLIC_BASE_URL ?? "https://otlwood.com";
}
