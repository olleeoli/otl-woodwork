import { NextRequest, NextResponse } from "next/server";
import { getRedis } from "@/lib/redis";
import { requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/products/video-upload/status?uploadId=...
 *
 * Read-only companion to the video-upload route. The Mux webhook writes
 * every finished asset to `mux:upload:{uploadId}` whether or not it knew
 * which product it belonged to, so on the "Add a product" screen — where
 * no slug exists yet — the form polls here to find out when transcoding
 * finished and what the playbackId is.
 *
 * On edit the webhook patches the product directly and this is only a
 * fallback, but polling both ways keeps the form's logic uniform.
 */
export async function GET(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  const uploadId = req.nextUrl.searchParams.get("uploadId");
  if (!uploadId) {
    return NextResponse.json({ error: "uploadId is required" }, { status: 400 });
  }

  const redis = getRedis();
  if (!redis) {
    return NextResponse.json(
      { error: "Redis is not configured" },
      { status: 503 }
    );
  }

  const result = await redis.get<{
    status?: "ready" | "errored";
    playbackId?: string;
    assetId?: string;
    durationSec?: number;
  }>(`mux:upload:${uploadId}`);

  // No key yet just means Mux hasn't finished. Not an error.
  if (!result) return NextResponse.json({ status: "processing" });

  return NextResponse.json(result);
}