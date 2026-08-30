import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

const MAX_BYTES = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

/** Same contract as the gallery uploader, filed under products/ in Blob. */
export async function POST(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json(
      { error: "Blob storage is not connected to this project yet." },
      { status: 500 }
    );
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file = form.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json(
      { error: "Unsupported file type. Use JPG, PNG, WEBP, or GIF." },
      { status: 400 }
    );
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "That photo is over the 10MB limit." },
      { status: 400 }
    );
  }

  const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  try {
    const blob = await put(`products/${unique}.${ext}`, file, {
      access: "public",
      contentType: file.type,
    });
    return NextResponse.json({ url: blob.url, pathname: blob.pathname });
  } catch (err) {
    console.error("Blob upload failed", err);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
