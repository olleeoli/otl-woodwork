import Mux from "@mux/mux-node";

/**
 * Mux client. Mirrors getRedis() in lib/redis.ts — returns null rather than
 * throwing at import time, so a missing env var degrades to a clear error
 * message in the route instead of a build failure.
 */
let client: Mux | null = null;

export function getMux(): Mux | null {
  if (client) return client;
  const tokenId = process.env.MUX_TOKEN_ID;
  const tokenSecret = process.env.MUX_TOKEN_SECRET;
  if (!tokenId || !tokenSecret) return null;
  client = new Mux({ tokenId, tokenSecret });
  return client;
}

/** Matches the 10MB photo cap's spirit — generous, but not unbounded. */
export const MAX_VIDEO_BYTES = 500 * 1024 * 1024; // 500MB
export const ALLOWED_VIDEO_TYPES = [
  "video/mp4",
  "video/quicktime", // .mov — what an iPhone produces
  "video/webm",
];