import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { baseUrl } from "@/lib/square";

export const dynamic = "force-dynamic";

/**
 * TEMPORARY DIAGNOSTIC — delete once checkout is confirmed working.
 *
 * Reports only whether each variable is visible to the running server, never
 * its value. Admin-gated so it can't be used to probe the deployment.
 */
export async function GET(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  const present = (name: string) => {
    const v = process.env[name];
    return { set: Boolean(v), length: v ? v.length : 0 };
  };

  return NextResponse.json({
    vercelEnv: process.env.VERCEL_ENV ?? "(not set)",
    resolvedBaseUrl: baseUrl(),
    variables: {
      SQUARE_ACCESS_TOKEN: present("SQUARE_ACCESS_TOKEN"),
      SQUARE_LOCATION_ID: present("SQUARE_LOCATION_ID"),
      SQUARE_ENVIRONMENT: present("SQUARE_ENVIRONMENT"),
      SQUARE_WEBHOOK_SIGNATURE_KEY: present("SQUARE_WEBHOOK_SIGNATURE_KEY"),
      NEXT_PUBLIC_BASE_URL: present("NEXT_PUBLIC_BASE_URL"),
      RESEND_API_KEY: present("RESEND_API_KEY"),
      ORDER_FROM_EMAIL: present("ORDER_FROM_EMAIL"),
      ADMIN_KEY: present("ADMIN_KEY"),
      KV_REST_API_URL: present("KV_REST_API_URL"),
    },
  });
}
