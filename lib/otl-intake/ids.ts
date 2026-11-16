import { randomBytes } from "node:crypto";

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** `sub_` + ULID (48-bit ms timestamp + 80 random bits, Crockford base32). */
export function newSubmissionId(now = Date.now()): string {
  let time = "";
  let t = now;
  for (let i = 0; i < 10; i++) {
    time = CROCKFORD[t % 32] + time;
    t = Math.floor(t / 32);
  }
  // 16 chars × 5 random bits = 80 bits; b & 31 is uniform because 256 is a multiple of 32
  let random = "";
  for (const b of randomBytes(16)) random += CROCKFORD[b & 31];
  return `sub_${time}${random}`;
}

/** Storage-safe file name: keeps [A-Za-z0-9._-], forces .svg, ≤ 128 chars (D-23 pattern). */
export function safeSvgName(original: string): string {
  const base = original
    .replace(/\.svg$/i, "")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 100);
  return `${base || "design"}.svg`;
}
