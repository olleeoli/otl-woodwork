import { NextRequest, NextResponse } from "next/server";
import { getMux } from "@/lib/mux";
import { requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * Same contract shape as /api/products/upload, but for video.
 *
 * Photos are POSTed here as bytes and forwarded to Blob. Video can't work
 * that way — a 400MB body would blow past Vercel's serverless request limit.
 * Instead this hands back a one-time Mux URL and the browser PUTs the file
 * straight to Mux. Nothing large ever touches our server.
 */
export async function POST(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  const mux = getMux();
  if (!mux) {
    return NextResponse.json(
      {
        error:
          "Mux is not connected to this project yet. Add MUX_TOKEN_ID and MUX_TOKEN_SECRET in Vercel, then redeploy.",
      },
      { status: 503 }
    );
  }

  // slug is optional: on "Add a product" the slug doesn't exist yet, so the
  // webhook can't patch the product directly. On edit we pass the slug so
  // the webhook can write straight to the record.
  let slug: string | undefined;
  try {
    const body = await req.json();
    slug = typeof body?.slug === "string" && body.slug ? body.slug : undefined;
  } catch {
    // No body is fine — treat as the create case.
  }

  try {
    const upload = await mux.video.uploads.create({
      cors_origin: process.env.NEXT_PUBLIC_BASE_URL || "*",
      new_asset_settings: {
        playback_policy: ["public"],
        video_quality: "basic",
        // Carried back verbatim on the webhook — how we know which product
        // this asset belongs to without keeping our own lookup table.
        passthrough: slug ? JSON.stringify({ slug }) : undefined,
      },
    });

    return NextResponse.json({ uploadUrl: upload.url, uploadId: upload.id });
  } catch (err) {
    console.error("Mux upload creation failed", err);
    return NextResponse.json(
      { error: "Could not start the video upload" },
      { status: 500 }
    );
  }
}