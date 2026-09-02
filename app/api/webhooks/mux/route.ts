import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getMux } from "@/lib/mux";
import { getRedis } from "@/lib/redis";
import { getProduct, updateProduct } from "@/lib/products";
import type { ProductVideo } from "@/types/product";

export const dynamic = "force-dynamic";

/**
 * Mux calls this when an asset finishes transcoding (or fails).
 *
 * Not admin-guarded — Mux has no admin key. Trust comes from the signature
 * check instead, which is why an unverifiable body is rejected outright.
 *
 * Must be idempotent: Mux retries on any non-2xx, and a retry after a
 * partial success would otherwise double-write.
 */
export async function POST(req: NextRequest) {
  const mux = getMux();
  const secret = process.env.MUX_WEBHOOK_SECRET;
  if (!mux || !secret) {
    console.error("Mux webhook hit but Mux env vars are missing");
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }

  const rawBody = await req.text();

  let event: { id?: string; type?: string; data?: Record<string, unknown> };
  try {
    event = mux.webhooks.unwrap(rawBody, req.headers, secret) as typeof event;
  } catch (err) {
    console.error("Mux webhook signature rejected", err);
    return NextResponse.json({ error: "Bad signature" }, { status: 400 });
  }

  // Idempotency guard. Mux event ids are stable across retries.
  const redis = getRedis();
  if (redis && event.id) {
    const guardKey = `mux:event:${event.id}`;
    const fresh = await redis.set(guardKey, 1, { nx: true, ex: 60 * 60 * 24 });
    if (!fresh) return NextResponse.json({ ok: true, deduped: true });
  }

  const data = event.data ?? {};
  const uploadId = typeof data.upload_id === "string" ? data.upload_id : null;
  if (!uploadId) return NextResponse.json({ ok: true });

  // passthrough carries the slug we set when the upload was created.
  let slug: string | null = null;
  if (typeof data.passthrough === "string") {
    try {
      const parsed = JSON.parse(data.passthrough);
      if (typeof parsed?.slug === "string") slug = parsed.slug;
    } catch {
      /* malformed passthrough is not worth failing the webhook over */
    }
  }

  if (event.type === "video.asset.ready") {
    const playbackIds = data.playback_ids as { id?: string }[] | undefined;
    const playbackId = playbackIds?.[0]?.id;
    if (!playbackId) return NextResponse.json({ ok: true });

    const patch: Partial<ProductVideo> = {
      status: "ready",
      playbackId,
      assetId: typeof data.id === "string" ? data.id : undefined,
      durationSec:
        typeof data.duration === "number" ? Math.round(data.duration) : undefined,
    };

    await patchVideoOnProduct(slug, uploadId, patch);
    if (redis) {
      await redis.set(`mux:upload:${uploadId}`, patch, { ex: 60 * 60 * 24 });
    }
  }

  if (event.type === "video.asset.errored") {
    console.error("Mux asset errored", uploadId, data.errors);
    await patchVideoOnProduct(slug, uploadId, { status: "errored" });
    if (redis) {
      await redis.set(
        `mux:upload:${uploadId}`,
        { status: "errored" },
        { ex: 60 * 60 * 24 }
      );
    }
  }

  return NextResponse.json({ ok: true });
}

/**
 * Finds the placeholder video by uploadId and merges the patch into it.
 * Goes through updateProduct() rather than touching Redis directly so the
 * index and undefined-stripping behaviour stay consistent.
 */
async function patchVideoOnProduct(
  slug: string | null,
  uploadId: string,
  patch: Partial<ProductVideo>
) {
  if (!slug) return;

  const product = await getProduct(slug);
  if (!product?.videos?.length) return;

  const videos = product.videos.map((v) =>
    v.uploadId === uploadId ? { ...v, ...patch } : v
  );

  await updateProduct(slug, { videos });
  revalidatePath("/shop");
  revalidatePath(`/shop/${slug}`);
}
