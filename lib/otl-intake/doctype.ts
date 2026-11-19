// VERBATIM COPY of otl-pipeline src/geometry/doctype.ts (D-50). Change both together;
// otl-pipeline test/geometry/doctype.test.ts holds the shared test vectors.
/**
 * D-50: which <!DOCTYPE> an upload may carry. Shared rule — otl-woodwork keeps a verbatim copy
 * (lib/otl-intake/doctype.ts) so the form and the Mac never disagree.
 *
 * Allowed: exactly `svg`, optionally followed by PUBLIC "<public id>" "<system id>" — the header
 * Tinkercad, Illustrator ("SVG 1.1") and older Inkscape write. No internal subset ([ … ]), so no
 * entity can be declared; undeclared entities stay a parse error; the DTD URL is never fetched.
 * Everything else is refused: any [ … ] section (incl. Illustrator's ns_* entity block), <!ENTITY,
 * SYSTEM ids, other root names, odd quoting, anything over 300 characters.
 *
 * `text` is what follows "<!DOCTYPE" up to the closing ">" (what saxes reports).
 */
const QUOTED = `(?:"[^"<>\\[\\]%&]*"|'[^'<>\\[\\]%&]*')`;
const PLAIN = new RegExp(`^\\s*svg(?:\\s+PUBLIC\\s+${QUOTED}\\s+${QUOTED})?\\s*$`);

export function isPlainSvgDoctype(text: string): boolean {
  return text.length <= 300 && PLAIN.test(text);
}

/** For a whole file (the form's quick check): the DOCTYPE text, if any, and whether it's allowed. */
export function doctypeOf(head: string): { present: false } | { present: true; allowed: boolean } {
  const i = head.search(/<!DOCTYPE/i);
  if (i < 0) return { present: false };
  const end = head.indexOf(">", i);
  // a ">" inside a [ … ] subset would end the match early — the leftover "[" makes it fail anyway
  if (end < 0) return { present: true, allowed: false };
  const body = head.slice(i + "<!DOCTYPE".length, end);
  if (head.slice(i, i + 9) !== "<!DOCTYPE") return { present: true, allowed: false }; // XML is case-sensitive
  return { present: true, allowed: isPlainSvgDoctype(body) };
}
