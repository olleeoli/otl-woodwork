import type { Metadata } from "next";
import Link from "next/link";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import { site } from "@/site.config";

export const metadata: Metadata = {
  title: "Start a Custom Project — OTL Woodwork",
  description:
    "Tell me about your custom woodworking project. Send dimensions, wood species, and finish preferences and I'll follow up with a quote.",
};

export default function CustomOrderPage() {
  const formUrl = site.custom.formEmbedUrl.trim();

  return (
    <>
      <SiteHeader />

      <main>
        {/* ---------- Header ---------- */}
        <section className="hero">
          <div className="container">
            <p className="eyebrow">{site.custom.eyebrow}</p>
            <h1>{site.custom.heading}</h1>
            <p>{site.custom.subheading}</p>
            <div className="hero-actions">
              <Link href="/#gallery" className="btn btn-ghost">
                Browse the Gallery
              </Link>
            </div>
          </div>
        </section>

        {/* ---------- How it works ---------- */}
        <section className="section">
          <div className="container">
            <div className="section-head">
              <h2>What happens next</h2>
              <p>Three steps, no surprises.</p>
            </div>
            <div className="process-grid">
              {site.custom.steps.map((step, i) => (
                <div key={step.title} className="process-step">
                  <div className="step-num">{i + 1}</div>
                  <h3>{step.title}</h3>
                  <p>{step.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ---------- The form ---------- */}
        <section className="section section-alt" aria-labelledby="form-heading">
          <div className="container">
            <div className="section-head">
              <h2 id="form-heading">Project details</h2>
              <p>
                The more you can tell me here, the tighter the quote comes back.
              </p>
            </div>

            {formUrl ? (
              <>
                {/*
                  A cross-origin iframe can't tell the parent how tall it is, so
                  the height is fixed in CSS (.form-frame). Google's own embed
                  snippet reported 2451px at 640px wide; the mobile value adds
                  headroom for extra text wrapping. Check it on a phone and tune
                  the numbers in globals.css if the form gains or loses fields.
                */}
                <div className="form-frame">
                  <iframe
                    src={formUrl}
                    title="OTL Woodwork custom order request form"
                    loading="lazy"
                  >
                    Loading form…
                  </iframe>
                </div>

                <p className="form-fallback">
                  Form not loading?{" "}
                  <a
                    href={`mailto:${site.email}?subject=Custom%20woodwork%20project`}
                  >
                    Email me directly at {site.email}
                  </a>
                  .
                </p>
              </>
            ) : (
              /* No form URL configured yet — better than an empty white box. */
              <p className="form-fallback">
                The request form isn&apos;t hooked up yet. In the meantime,{" "}
                <a
                  href={`mailto:${site.email}?subject=Custom%20woodwork%20project`}
                >
                  email me at {site.email}
                </a>{" "}
                with your project details and I&apos;ll take it from there.
              </p>
            )}
          </div>
        </section>
      </main>

      <SiteFooter />
    </>
  );
}
