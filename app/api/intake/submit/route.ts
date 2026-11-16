/**
 * Step 3 of 3 — finalizes a submission:
 *   1. ticket valid and the fields are exactly the ones checked at start (hash match)
 *   2. the uploaded blob exists in the private store, 1 B – 5 MiB, looks like an SVG; sha256
 *   3. payload built and validated against intake contract v1.0 (+ S-1)
 *   4. outbox write (RECEIVED + pending, one MULTI)  ← durable from here on (O-1)
 *   5. reply to the customer, then push the signed webhook to the Mac in the background;
 *      if the push fails the Mac's reconciler pulls it from the outbox (D-03).
 * Idempotent per submissionId: a repeated submit returns the same reference.
 */
import { get } from "@vercel/blob";
import { after, NextResponse } from "next/server";
import { z } from "zod";
import { IntakeWebhook, MAX_UPLOAD_BYTES, parseIntakeWebhook } from "@/lib/otl-intake/contract";
import { intakeConfig } from "@/lib/otl-intake/config";
import { forwardToMac } from "@/lib/otl-intake/forward";
import { FormFields, clientIp, hashIp, issuePaths, jsonError, logIntake, readJson, sha256Hex } from "@/lib/otl-intake/http";
import { outboxClient, writeOutbox } from "@/lib/otl-intake/outbox";
import { sniffSvg } from "@/lib/otl-intake/svg-sniff";
import { fieldsHash, verifyTicket } from "@/lib/otl-intake/ticket";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const SubmitBody = z.strictObject({
  ticket: z.string().min(1).max(2048),
  fields: FormFields,
  originalName: z.string().max(200).optional(),
});

const FILE_ERRORS: Record<string, string> = {
  missing: "We couldn't find your uploaded file. Please try again.",
  empty: "That file is empty.",
  too_large: "That file is over the 5 MB limit.",
  not_utf8: "That doesn't look like an SVG file. Please export your design as SVG.",
  not_svg: "That doesn't look like an SVG file. Please export your design as SVG.",
  has_doctype: "That SVG contains a DOCTYPE/ENTITY section we can't accept. Please re-export it (e.g. 'Plain SVG').",
};

/** Customer-facing reference: last 8 chars of the ULID, grouped. */
const reference = (id: string) => `OTL-${id.slice(-8, -4)}-${id.slice(-4)}`;

export async function POST(req: Request) {
  const cfg = intakeConfig();
  if (!cfg) return jsonError(503, "Quote requests are temporarily unavailable. Please email us instead.");

  const body = await readJson(req);
  if (body === null) return jsonError(400, "Invalid request.");
  const parsed = SubmitBody.safeParse(body);
  if (!parsed.success) return jsonError(422, "Please check the highlighted fields.", { fields: issuePaths(parsed.error) });
  const { ticket: rawTicket, fields, originalName } = parsed.data;

  const check = verifyTicket(rawTicket, cfg.hmacSecret);
  if (!check.ok) {
    return jsonError(check.reason === "expired" ? 410 : 403, check.reason === "expired"
      ? "This form session expired. Please refresh the page and submit again."
      : "Invalid session. Please refresh the page and try again.");
  }
  const { id: submissionId, key } = check.ticket;
  if (fieldsHash(fields) !== check.ticket.fh) {
    logIntake("warn", "fields changed after start", { submissionId });
    return jsonError(409, "The form changed after it was checked. Please submit again.");
  }

  // ---- the uploaded file ----
  let bytes: Uint8Array;
  try {
    const blob = await get(key, { access: "private", token: cfg.blobToken, useCache: false });
    if (!blob || blob.statusCode !== 200 || !blob.stream) return fileError(submissionId, "missing");
    bytes = await readCapped(blob.stream, MAX_UPLOAD_BYTES);
  } catch (err) {
    if ((err as Error).message === "too_large") return fileError(submissionId, "too_large");
    logIntake("error", "blob read failed", { submissionId, err: (err as Error).name });
    return jsonError(503, "Temporary problem saving your request. Please try again in a minute.");
  }
  if (bytes.byteLength === 0) return fileError(submissionId, "empty");
  const sniff = sniffSvg(bytes);
  if (!sniff.ok) return fileError(submissionId, sniff.reason);

  // ---- contract payload ----
  const ip = clientIp(req);
  const candidate: IntakeWebhook = {
    schemaVersion: "1.0",
    submissionId,
    submittedAt: new Date().toISOString(),
    customer: fields.customer,
    project: fields.project,
    file: {
      provider: "vercel_blob",
      key,
      ...(originalName ? { originalName } : {}),
      sizeBytes: bytes.byteLength,
      sha256: sha256Hex(bytes),
    },
    source: { page: "/quote-request", turnstile: true, ...(hashIp(ip, cfg.hmacSecret) ? { ipHash: hashIp(ip, cfg.hmacSecret) } : {}) },
  };
  const contract = parseIntakeWebhook(candidate);
  if (!contract.ok) {
    logIntake("error", "payload breaks intake contract", { submissionId, issues: contract.issues });
    return jsonError(422, "Please check the highlighted fields.", { fields: contract.issues.map((i) => i.path) });
  }
  const payload = contract.value;

  // ---- durable from here (O-1) ----
  try {
    const state = await writeOutbox(outboxClient(cfg), payload, new Date());
    logIntake("info", state === "written" ? "outbox written" : "outbox already had submission", { submissionId });
    if (state === "exists") {
      return NextResponse.json({ submissionId, reference: reference(submissionId) }, { headers: { "cache-control": "no-store" } });
    }
  } catch (err) {
    logIntake("error", "outbox write failed", { submissionId, err: (err as Error).name });
    return jsonError(503, "Temporary problem saving your request. Please try again in a minute.");
  }

  const raw = JSON.stringify(payload);
  after(async () => {
    const r = await forwardToMac(cfg, raw);
    if (r.ok) logIntake("info", "forwarded to mac", { submissionId, status: r.status });
    else logIntake("warn", "forward failed; reconciler will pick it up", { submissionId, status: r.status, reason: r.reason });
  });

  return NextResponse.json({ submissionId, reference: reference(submissionId) }, { headers: { "cache-control": "no-store" } });
}

function fileError(submissionId: string, reason: keyof typeof FILE_ERRORS) {
  logIntake("warn", "file rejected", { submissionId, reason });
  return jsonError(422, FILE_ERRORS[reason], { fields: ["file"] });
}

async function readCapped(stream: ReadableStream<Uint8Array>, max: number): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > max) throw new Error("too_large");
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const out = new Uint8Array(total);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.byteLength;
  }
  return out;
}
