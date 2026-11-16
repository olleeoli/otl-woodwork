/**
 * Step 1 of 3 — checks Turnstile and the form fields, then issues a submission id and a
 * signed ticket that allows exactly one SVG upload and one final submit (20 min).
 * Nothing is stored yet.
 */
import { z } from "zod";
import { NextResponse } from "next/server";
import { intakeConfig, missingIntakeEnv } from "@/lib/otl-intake/config";
import { FileMeta, FormFields, clientIp, issuePaths, jsonError, logIntake, readJson } from "@/lib/otl-intake/http";
import { newSubmissionId, safeSvgName } from "@/lib/otl-intake/ids";
import { TICKET_TTL_MS, fieldsHash, signTicket } from "@/lib/otl-intake/ticket";
import { verifyTurnstile } from "@/lib/otl-intake/turnstile";

export const dynamic = "force-dynamic";

const StartBody = z.strictObject({
  turnstileToken: z.string().min(1).max(2048),
  fields: FormFields,
  file: FileMeta,
});

export async function POST(req: Request) {
  const cfg = intakeConfig();
  if (!cfg) {
    logIntake("error", "intake not configured", { missing: missingIntakeEnv() });
    return jsonError(503, "Quote requests are temporarily unavailable. Please email us instead.");
  }

  const body = await readJson(req);
  if (body === null) return jsonError(400, "Invalid request.");
  const parsed = StartBody.safeParse(body);
  if (!parsed.success) {
    return jsonError(422, "Please check the highlighted fields.", { fields: issuePaths(parsed.error) });
  }
  const { turnstileToken, fields, file } = parsed.data;
  if (!/\.svg$/i.test(file.name)) return jsonError(422, "Please upload an .svg file.", { fields: ["file"] });

  if (!(await verifyTurnstile(turnstileToken, cfg.turnstileSecret, clientIp(req)))) {
    logIntake("warn", "turnstile failed");
    return jsonError(403, "Security check failed. Please refresh the page and try again.");
  }

  const submissionId = newSubmissionId();
  const key = `intake/${submissionId}/${safeSvgName(file.name)}`;
  const ticket = signTicket({ id: submissionId, key, fh: fieldsHash(fields), exp: Date.now() + TICKET_TTL_MS }, cfg.hmacSecret);
  logIntake("info", "intake started", { submissionId });
  return NextResponse.json({ submissionId, key, ticket }, { headers: { "cache-control": "no-store" } });
}
