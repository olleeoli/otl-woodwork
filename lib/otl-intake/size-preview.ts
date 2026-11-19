/**
 * D-51: live size preview on the quote form (browser only).
 *
 * The customer gives one side; the other follows the design's proportions (D-04, D-33). To show
 * them the result before they submit, the chosen SVG is loaded as an <img> — in that mode the
 * browser runs no scripts and loads nothing external — drawn on a hidden canvas, and the drawn
 * (non-transparent) area is measured: the same "design bounding box" the Mac quotes from, give or
 * take stroke width. Shown as "about"; the Mac's number on the quote is the real one.
 */

/** Machine bed, Shapeoko 5.1 Pro 4x2 (D-09). Either orientation. */
export const BED_IN = { long: 48.7, short: 24.53 } as const;
const SAMPLE_PX = 800;

export interface Measured {
  /** design width ÷ height */
  ratio: number;
  /** PNG data URL of the design, cropped to what's drawn, for the thumbnail */
  thumb: string;
}

export interface SizePreview {
  widthIn: number;
  heightIn: number;
  fitsBed: boolean;
}

/** Pure: the other side from one side and the design's proportions. */
export function previewSize(ratio: number, axis: "width" | "height", valueIn: number): SizePreview | null {
  if (!(ratio > 0) || !Number.isFinite(ratio) || !(valueIn > 0)) return null;
  const widthIn = axis === "width" ? valueIn : valueIn * ratio;
  const heightIn = axis === "height" ? valueIn : valueIn / ratio;
  const long = Math.max(widthIn, heightIn);
  const short = Math.min(widthIn, heightIn);
  return { widthIn, heightIn, fitsBed: long <= BED_IN.long && short <= BED_IN.short };
}

/** Browser: measure a chosen SVG file. null when it can't be drawn (the server says why on submit). */
export async function measureSvgFile(file: File): Promise<Measured | null> {
  const url = URL.createObjectURL(new Blob([await file.arrayBuffer()], { type: "image/svg+xml" }));
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    const nw = img.naturalWidth || 300;
    const nh = img.naturalHeight || 150;
    const scale = SAMPLE_PX / Math.max(nw, nh);
    const w = Math.max(1, Math.round(nw * scale));
    const h = Math.max(1, Math.round(nh * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, w, h);
    let data: Uint8ClampedArray;
    try {
      data = ctx.getImageData(0, 0, w, h).data;
    } catch {
      return null; // canvas tainted (some browsers, some files): no preview, nothing else breaks
    }
    let minX = w, minY = h, maxX = -1, maxY = -1;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++)
        if (data[(y * w + x) * 4 + 3]! > 8) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
    if (maxX < 0) return null; // nothing drawn
    const bw = maxX - minX + 1;
    const bh = maxY - minY + 1;
    const thumb = document.createElement("canvas");
    const t = 160 / Math.max(bw, bh);
    thumb.width = Math.max(1, Math.round(bw * t));
    thumb.height = Math.max(1, Math.round(bh * t));
    thumb.getContext("2d")?.drawImage(canvas, minX, minY, bw, bh, 0, 0, thumb.width, thumb.height);
    return { ratio: bw / bh, thumb: thumb.toDataURL("image/png") };
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}
