"use client";

import { upload } from "@vercel/blob/client";
import Script from "next/script";
import { useCallback, useEffect, useRef, useState } from "react";
import { type Measured, measureSvgFile, previewSize } from "@/lib/otl-intake/size-preview";
import styles from "./IntakeForm.module.css";

/** Option values must match the intake contract enums (lib/otl-intake/contract.ts). */
const SPECIES = [
  ["walnut", "Walnut"],
  ["maple", "Hard maple"],
  ["cherry", "Cherry"],
  ["white_oak", "White oak"],
  ["red_oak", "Red oak"],
  ["baltic_birch", "Baltic birch plywood"],
  ["mdf", "MDF (painted work)"],
] as const;
const THICKNESS = [
  [0.25, '1/4"'],
  [0.5, '1/2"'],
  [0.75, '3/4"'],
  [1, '1"'],
  [1.5, '1-1/2"'],
] as const;
const OPERATIONS = [
  ["cut_out", "Cut out the shape"],
  ["engrave", "Engrave the lines"],
  ["pocket", "Pocket (carve recessed areas)"],
  ["vcarve", "V-carve (sharp lettering / detail)"],
] as const;
const FINISHES = [
  ["none", "No finish"],
  ["oil", "Oil"],
  ["oil_wax", "Oil + wax"],
  ["poly_satin", "Satin polyurethane"],
  ["paint_fill", "Paint fill"],
] as const;
const MAX_BYTES = 5 * 1024 * 1024;

type Status =
  | { kind: "idle" }
  | { kind: "busy"; step: string }
  | { kind: "error"; message: string; fields?: string[] }
  | { kind: "done"; reference: string };

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: Record<string, unknown>) => string;
      reset: (id?: string) => void;
    };
  }
}

async function postJson(url: string, body: unknown) {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  let data: Record<string, unknown> = {};
  try {
    data = await res.json();
  } catch {
    /* non-JSON error page */
  }
  return { status: res.status, data };
}

export default function IntakeForm({ siteKey, contactEmail }: { siteKey: string; contactEmail: string }) {
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [file, setFile] = useState<File | null>(null);
  // D-51: live size preview
  const [measuredFor, setMeasuredFor] = useState<{ file: File; m: Measured | null } | null>(null);
  const [axis, setAxis] = useState<"width" | "height">("width");
  const [valueIn, setValueIn] = useState("");
  useEffect(() => {
    if (!file || file.size > MAX_BYTES) return;
    let live = true;
    void measureSvgFile(file).then((m) => {
      if (live) setMeasuredFor({ file, m });
    });
    return () => {
      live = false;
    };
  }, [file]);
  // only the measurement of the file chosen right now (never a stale one from a previous file)
  const measured = measuredFor && measuredFor.file === file ? measuredFor.m : null;
  const preview = measured ? previewSize(measured.ratio, axis, Number(valueIn)) : null;
  const [advanced, setAdvanced] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState("");
  const widgetRef = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);

  const renderWidget = useCallback(() => {
    if (!window.turnstile || !widgetRef.current || widgetId.current) return;
    widgetId.current = window.turnstile.render(widgetRef.current, {
      sitekey: siteKey,
      callback: (t: string) => setTurnstileToken(t),
      "expired-callback": () => setTurnstileToken(""),
      "error-callback": () => setTurnstileToken(""),
    });
  }, [siteKey]);
  useEffect(renderWidget, [renderWidget]);

  const resetWidget = () => {
    setTurnstileToken("");
    if (window.turnstile && widgetId.current) window.turnstile.reset(widgetId.current);
  };

  const bad = (name: string) =>
    status.kind === "error" && status.fields?.some((f) => f === name || f.startsWith(`${name}.`)) ? styles.invalid : undefined;

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const s = (k: string) => String(f.get(k) ?? "").trim();
    const opt = (k: string) => s(k) || undefined;

    if (!file) return setStatus({ kind: "error", message: "Please choose your SVG file.", fields: ["file"] });
    if (!/\.svg$/i.test(file.name)) return setStatus({ kind: "error", message: "Please upload an .svg file.", fields: ["file"] });
    if (file.size > MAX_BYTES) return setStatus({ kind: "error", message: "That file is over the 5 MB limit.", fields: ["file"] });
    if (!turnstileToken) return setStatus({ kind: "error", message: "Please complete the security check." });

    const fields = {
      customer: { name: s("name"), email: s("email"), phone: opt("phone"), company: opt("company") },
      project: {
        title: s("title"),
        notes: opt("notes"),
        species: s("species"),
        thicknessIn: Number(s("thicknessIn")),
        quantity: Number(s("quantity")),
        targetSize: { axis: s("axis"), valueIn: Number(s("valueIn")) },
        operationIntent: advanced ? "by_stroke_color" : s("operationIntent"),
        finish: s("finish"),
        neededBy: opt("neededBy"),
      },
    };

    try {
      setStatus({ kind: "busy", step: "Checking your details…" });
      const start = await postJson("/api/intake/start", {
        turnstileToken,
        fields,
        file: { name: file.name, size: file.size },
      });
      resetWidget(); // Turnstile tokens are single-use
      if (start.status !== 200) {
        return setStatus({ kind: "error", message: String(start.data.error ?? "Something went wrong."), fields: start.data.fields as string[] });
      }
      const { key, ticket } = start.data as { key: string; ticket: string };

      setStatus({ kind: "busy", step: "Uploading your design…" });
      await upload(key, file, {
        access: "private",
        handleUploadUrl: "/api/intake/upload",
        clientPayload: ticket,
        contentType: "image/svg+xml",
      });

      setStatus({ kind: "busy", step: "Sending your request…" });
      let done = await postJson("/api/intake/submit", { ticket, fields, originalName: file.name.slice(0, 200) });
      for (let i = 0; i < 2 && done.status === 503; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        done = await postJson("/api/intake/submit", { ticket, fields, originalName: file.name.slice(0, 200) });
      }
      if (done.status !== 200) {
        return setStatus({ kind: "error", message: String(done.data.error ?? "Something went wrong."), fields: done.data.fields as string[] });
      }
      setStatus({ kind: "done", reference: String(done.data.reference) });
    } catch {
      resetWidget();
      setStatus({ kind: "error", message: "Upload failed. Please check your connection and try again." });
    }
  }

  if (status.kind === "done") {
    return (
      <div className="alert alert-success" role="status">
        <p>
          <strong>Thanks — we&apos;ve got it.</strong> Your reference is <strong>{status.reference}</strong>.
        </p>
        <p>We&apos;ll email your quote within 1 business day.</p>
      </div>
    );
  }

  const busy = status.kind === "busy";

  return (
    <form className={`form ${styles.form}`} onSubmit={onSubmit} noValidate={false}>
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        strategy="afterInteractive"
        onReady={renderWidget}
      />

      <fieldset disabled={busy} className={styles.fieldset}>
        <legend>Your design</legend>
        <div className="field">
          <label htmlFor="file">SVG file (max 5 MB)</label>
          <input
            id="file"
            type="file"
            accept=".svg,image/svg+xml"
            required
            className={bad("file")}
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          <p className="field-hint">Export from Illustrator, Inkscape, Canva or similar as SVG.</p>
        </div>

        <div className="field-row">
          <div className="field">
            <label htmlFor="axis">Size is the finished…</label>
            <select
              id="axis"
              name="axis"
              defaultValue="width"
              className={bad("project.targetSize")}
              onChange={(e) => setAxis(e.target.value === "height" ? "height" : "width")}
            >
              <option value="width">Width</option>
              <option value="height">Height</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="valueIn">…in inches</label>
            <input
              id="valueIn"
              name="valueIn"
              type="number"
              min="0.25"
              max="48"
              step="0.01"
              required
              className={bad("project.targetSize")}
              onChange={(e) => setValueIn(e.target.value)}
            />
            <p className="field-hint">The other side follows your design&apos;s proportions.</p>
          </div>
        </div>

        {measured && (
          <div className={styles.preview} aria-live="polite">
            {/* eslint-disable-next-line @next/next/no-img-element -- local data URL, not an optimizable asset */}
            <img src={measured.thumb} alt="Preview of your design" className={styles.thumb} />
            <div>
              {preview ? (
                <p>
                  Your design will be about{" "}
                  <strong>
                    {preview.widthIn.toFixed(2)} × {preview.heightIn.toFixed(2)} in
                  </strong>{" "}
                  (width × height).
                </p>
              ) : (
                <p>Enter the {axis} above to see the finished size.</p>
              )}
              {preview && !preview.fitsBed && (
                <p className={styles.warn}>
                  That&apos;s larger than our 48 × 24 in machine bed. We can still look at it, but it may need to be made in sections or smaller.
                </p>
              )}
            </div>
          </div>
        )}
      </fieldset>

      <fieldset disabled={busy} className={styles.fieldset}>
        <legend>Project</legend>
        <div className="field">
          <label htmlFor="title">Project name</label>
          <input id="title" name="title" type="text" maxLength={140} required className={bad("project.title")} placeholder="e.g. Family name sign" />
        </div>
        <div className="field-row">
          <div className="field">
            <label htmlFor="species">Wood</label>
            <select id="species" name="species" defaultValue="walnut" className={bad("project.species")}>
              {SPECIES.map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="thicknessIn">Thickness</label>
            <select id="thicknessIn" name="thicknessIn" defaultValue="0.75" className={bad("project.thicknessIn")}>
              {THICKNESS.map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="field-row">
          <div className="field">
            <label htmlFor="quantity">Quantity</label>
            <input id="quantity" name="quantity" type="number" min="1" max="250" step="1" defaultValue="1" required className={bad("project.quantity")} />
          </div>
          <div className="field">
            <label htmlFor="finish">Finish</label>
            <select id="finish" name="finish" defaultValue="oil" className={bad("project.finish")}>
              {FINISHES.map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="field">
          <label htmlFor="operationIntent">What should the machine do?</label>
          <select id="operationIntent" name="operationIntent" defaultValue="cut_out" disabled={advanced} className={bad("project.operationIntent")}>
            {OPERATIONS.map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
          <label className={styles.check}>
            <input type="checkbox" checked={advanced} onChange={(e) => setAdvanced(e.target.checked)} /> Advanced: my file uses stroke
            colors (red = cut through, blue = pocket, black = engrave)
          </label>
        </div>
        <div className="field-row">
          <div className="field">
            <label htmlFor="neededBy">Needed by (optional)</label>
            <input id="neededBy" name="neededBy" type="date" className={bad("project.neededBy")} />
          </div>
          <div className="field" />
        </div>
        <div className="field">
          <label htmlFor="notes">Notes (optional)</label>
          <textarea id="notes" name="notes" rows={4} maxLength={2000} className={bad("project.notes")} />
        </div>
      </fieldset>

      <fieldset disabled={busy} className={styles.fieldset}>
        <legend>Contact</legend>
        <div className="field-row">
          <div className="field">
            <label htmlFor="name">Name</label>
            <input id="name" name="name" type="text" maxLength={120} required autoComplete="name" className={bad("customer.name")} />
          </div>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input id="email" name="email" type="email" required autoComplete="email" className={bad("customer.email")} />
          </div>
        </div>
        <div className="field-row">
          <div className="field">
            <label htmlFor="phone">Phone (optional)</label>
            <input id="phone" name="phone" type="tel" maxLength={32} autoComplete="tel" className={bad("customer.phone")} />
          </div>
          <div className="field">
            <label htmlFor="company">Company (optional)</label>
            <input id="company" name="company" type="text" maxLength={120} autoComplete="organization" className={bad("customer.company")} />
          </div>
        </div>
      </fieldset>

      <div ref={widgetRef} />

      {status.kind === "error" && (
        <p className="alert alert-error" role="alert">
          {status.message}
        </p>
      )}

      <div className="form-actions">
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? status.step : "Request quote"}
        </button>
      </div>
      <p className="field-hint">
        Trouble with the form? Email <a href={`mailto:${contactEmail}`}>{contactEmail}</a>.
      </p>
    </form>
  );
}
