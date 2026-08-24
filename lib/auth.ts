import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Admin auth is a single shared password held in the ADMIN_KEY env var.
 * The admin page sends it as the x-admin-key header on every request.
 *
 * Returns null when the caller is allowed through, or the response to send
 * back when they are not.
 */
export function requireAdmin(req: NextRequest): NextResponse | null {
  const key = process.env.ADMIN_KEY;

  // Never fall open. Say so plainly rather than looking like a wrong password.
  if (!key) {
    return NextResponse.json(
      {
        error:
          "No admin password is set on the server. Add an ADMIN_KEY environment variable in Vercel, then redeploy.",
      },
      { status: 503 }
    );
  }

  if (req.headers.get("x-admin-key") !== key) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return null;
}
