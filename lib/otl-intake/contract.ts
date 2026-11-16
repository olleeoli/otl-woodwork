/**
 * VERBATIM COPY of otl-pipeline src/contracts/intake.ts (intake webhook v1.0, 02 §A).
 * The Mac validates every payload with the original; keep this file identical.
 * Update it only together with the otl-pipeline version (same PR pair).
 */
/**
 * Intake webhook contract (Vercel → Mac), v1.0.
 *
 * Mirrors `contracts/intake-webhook-1.0.schema.json`, which is copied verbatim from
 * 02-data-contracts.md §A. The contract test (test/contracts/intake.contract.test.ts)
 * runs every fixture through BOTH this zod schema and the JSON Schema (ajv) and fails
 * if they disagree, so the two cannot drift apart silently.
 *
 * Rules: every object is strict (D-12). Money in integer cents, lengths in inches.
 */
import { z } from "zod";

export const INTAKE_SCHEMA_VERSION = "1.0" as const;

/** `sub_` + 26-char Crockford base32 ULID. Idempotency key end to end (D-11). */
export const SubmissionId = z
  .string()
  .regex(/^sub_[0-9A-HJKMNP-TV-Z]{26}$/, "submissionId must be sub_ + 26-char ULID");
export type SubmissionId = z.infer<typeof SubmissionId>;

export const Species = z.enum([
  "walnut",
  "maple",
  "cherry",
  "white_oak",
  "red_oak",
  "baltic_birch",
  "mdf",
]);
export type Species = z.infer<typeof Species>;

/** Finished thickness in inches. */
export const ThicknessIn = z.union([
  z.literal(0.25),
  z.literal(0.5),
  z.literal(0.75),
  z.literal(1.0),
  z.literal(1.5),
]);
export type ThicknessIn = z.infer<typeof ThicknessIn>;

export const OperationIntent = z.enum(["cut_out", "engrave", "pocket", "vcarve", "by_stroke_color"]);
export type OperationIntent = z.infer<typeof OperationIntent>;

export const Finish = z.enum(["none", "oil", "oil_wax", "poly_satin", "paint_fill"]);
export type Finish = z.infer<typeof Finish>;

export const MAX_UPLOAD_BYTES = 5_242_880; // 5 MiB

export const Customer = z.strictObject({
  name: z.string().min(1).max(120),
  email: z.email(),
  phone: z.string().max(32).optional(),
  company: z.string().max(120).optional(),
});
export type Customer = z.infer<typeof Customer>;

/** Customer-declared final size; the design is scaled uniformly to this (D-04). */
export const TargetSize = z.strictObject({
  axis: z.enum(["width", "height"]),
  valueIn: z.number().gt(0).max(48),
});
export type TargetSize = z.infer<typeof TargetSize>;

export const Project = z.strictObject({
  title: z.string().min(1).max(140),
  notes: z.string().max(2000).optional(),
  species: Species,
  thicknessIn: ThicknessIn,
  quantity: z.number().int().min(1).max(250),
  targetSize: TargetSize,
  operationIntent: OperationIntent,
  finish: Finish,
  neededBy: z.iso.date().optional(),
});
export type Project = z.infer<typeof Project>;

/** Blob pathname shape: intake/<submissionId>/<safe file name> (D-23). */
export const FILE_KEY_PATTERN = /^intake\/sub_[0-9A-HJKMNP-TV-Z]{26}\/[A-Za-z0-9._-]{1,128}$/;

/** Storage reference only. File bytes never travel in the webhook or job data. */
export const FileRef = z.strictObject({
  provider: z.literal("vercel_blob"), // D-08
  key: z.string().regex(FILE_KEY_PATTERN, "file.key must be intake/<submissionId>/<safe name>"),
  originalName: z.string().max(200).optional(),
  sizeBytes: z.number().int().min(1).max(MAX_UPLOAD_BYTES),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
});
export type FileRef = z.infer<typeof FileRef>;

export const Source = z.strictObject({
  page: z.string().optional(),
  ipHash: z.string().optional(),
  turnstile: z.literal(true).optional(),
});
export type Source = z.infer<typeof Source>;

/** Structural shape only: exactly what the JSON Schema in 02-data-contracts §A expresses. */
export const IntakeWebhookShape = z.strictObject({
  schemaVersion: z.literal(INTAKE_SCHEMA_VERSION),
  submissionId: SubmissionId,
  submittedAt: z.iso.datetime({ offset: true }),
  customer: Customer,
  project: Project,
  file: FileRef,
  source: Source.optional(),
});

/** Full contract = shape + semantic rules JSON Schema can't express (02 §A "Semantic rules"). */
export const IntakeWebhook = IntakeWebhookShape.superRefine((p, ctx) => {
  // S-1: the storage key must belong to this submission
  if (!p.file.key.startsWith(`intake/${p.submissionId}/`)) {
    ctx.addIssue({ code: "custom", path: ["file", "key"], message: "S-1" });
  }
});
export type IntakeWebhook = z.infer<typeof IntakeWebhook>;

export type ParseResult<T> =
  | { ok: true; value: T }
  | { ok: false; issues: Array<{ path: string; message: string }> };

/**
 * Validate an untrusted payload. Never throws. Issue messages contain field paths
 * and rule names only, never the offending values (they may hold customer PII).
 */
export function parseIntakeWebhook(input: unknown): ParseResult<IntakeWebhook> {
  const r = IntakeWebhook.safeParse(input);
  if (r.success) return { ok: true, value: r.data };
  return {
    ok: false,
    issues: r.error.issues.map((i) => ({
      path: i.path.map(String).join(".") || "(root)",
      // custom issues carry a rule id (e.g. "S-1"); built-in ones use their code
      message: i.code === "custom" ? i.message : i.code,
    })),
  };
}
