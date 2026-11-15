/**
 * Cheap first look at an uploaded file so customers get an immediate, friendly error for
 * obviously wrong files. This is NOT the security boundary: the Mac treats every SVG as
 * hostile and parses it in an isolated worker (Phase 2).
 */
export type SniffResult = { ok: true } | { ok: false; reason: "not_utf8" | "not_svg" | "has_doctype" };

export function sniffSvg(bytes: Uint8Array): SniffResult {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, 64 * 1024));
  } catch {
    return { ok: false, reason: "not_utf8" };
  }
  const head = text.replace(/^﻿/, "");
  // DOCTYPE / ENTITY declarations are how XXE and billion-laughs payloads get in.
  if (/<!DOCTYPE|<!ENTITY/i.test(head)) return { ok: false, reason: "has_doctype" };
  if (!/<svg[\s>]/i.test(head)) return { ok: false, reason: "not_svg" };
  return { ok: true };
}
