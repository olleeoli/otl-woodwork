/**
 * Step 2 of 3 — issues a Vercel Blob client token so the browser uploads the SVG straight to
 * the PRIVATE store `otl-intake-uploads` (D-08, D-28). Only a valid ticket gets a token, and
 * only for the exact pathname in that ticket: one .svg, ≤ 5 MiB, no overwrite.
 */
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { MAX_UPLOAD_BYTES } from "@/lib/otl-intake/contract";
import { intakeConfig } from "@/lib/otl-intake/config";
import { jsonError, logIntake, readJson } from "@/lib/otl-intake/http";
import { verifyTicket } from "@/lib/otl-intake/ticket";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const cfg = intakeConfig();
  if (!cfg) return jsonError(503, "Uploads are temporarily unavailable.");

  const body = (await readJson(req)) as HandleUploadBody | null;
  if (!body || body.type !== "blob.generate-client-token") return jsonError(400, "Invalid request.");

  try {
    const result = await handleUpload({
      // explicit token: the storefront's BLOB_* env vars belong to the public shop store
      token: cfg.blobToken,
      request: req,
      body,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const check = verifyTicket(clientPayload, cfg.hmacSecret);
        if (!check.ok) throw new Error(`ticket_${check.reason}`);
        if (pathname !== check.ticket.key) throw new Error("pathname_mismatch");
        return {
          allowedContentTypes: ["image/svg+xml"],
          maximumSizeInBytes: MAX_UPLOAD_BYTES,
          addRandomSuffix: false,
          allowOverwrite: false,
          validUntil: Math.min(check.ticket.exp, Date.now() + 10 * 60 * 1000),
        };
      },
    });
    return NextResponse.json(result, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    logIntake("warn", "upload token refused", { reason: (err as Error).message.slice(0, 80) });
    return jsonError(403, "Upload not allowed. Please refresh the page and try again.");
  }
}
