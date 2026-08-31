import Link from "next/link";
import type { Metadata } from "next";
import { listGalleryItems } from "@/lib/gallery";
import GalleryGrid from "@/components/GalleryGrid";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import { site } from "@/site.config";
import type { GalleryItem } from "@/types/gallery";

// Re-check the gallery at most once a minute so new uploads appear quickly
// without hitting the database on every single page view.
export const revalidate = 60;

const TITLE = "OTL Woodwork — Custom Woodworking";
const DESCRIPTION =
  "Hand-built cutting boards, furniture, signs, and home decor. Custom woodwork made to order.";

/**
 * The link-preview thumbnail is the brand mark, not a piece of work — a
 * shared link should look the same every time rather than changing with the
 * newest gallery upload.
 *
 * To change it, replace public/og-image.png. Keep it 1200x630; that is the
 * shape every social platform crops toward.
 */
const OG_IMAGE = "/og-image.png";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: "https://otlwood.com",
    siteName: "OTL Woodwork",
    type: "website",
    images: [{ url: OG_IMAGE, width: 1200, height: 630, alt: "OTL Woodwork" }],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    images: [OG_IMAGE],
  },
};

export default async function HomePage() {
  let items: GalleryItem[] = [];
  try {
    items = await listGalleryItems();
  } catch (err) {
    // A storage hiccup should never take the whole landing page down
    console.error("Could not load gallery items", err);
  }

  return (
    <>
      <SiteHeader />

      <main>
        {/* ---------- Hero ---------- */}
        <section className="hero">
          <div className="container">
            <p className="eyebrow">{site.hero.eyebrow}</p>
            <h1>{site.hero.heading}</h1>
            <p>{site.hero.subheading}</p>
            <div className="hero-actions">
              <a href="#gallery" className="btn btn-primary">
                {site.hero.primaryCta}
              </a>
              <Link href="/custom" className="btn btn-ghost">
                {site.hero.secondaryCta}
              </Link>
            </div>
          </div>
        </section>

        {/* ---------- What I build ---------- */}
        <section id="work" className="section">
          <div className="container">
            <div className="section-head">
              <h2>{site.work.heading}</h2>
              <p>{site.work.sub}</p>
            </div>
            <div className="make-grid">
              {site.work.items.map((item, i) => (
                <article key={item.title} className="make-card">
                  <span className="make-num">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <h3>{item.title}</h3>
                  <p>{item.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* ---------- Gallery ---------- */}
        <section id="gallery" className="section section-alt">
          <div className="container">
            <div className="section-head">
              <h2>{site.gallery.heading}</h2>
              <p>{site.gallery.sub}</p>
            </div>
            <GalleryGrid items={items} />
          </div>
        </section>

        {/* ---------- Process ---------- */}
        <section id="process" className="section">
          <div className="container">
            <div className="section-head">
              <h2>{site.process.heading}</h2>
              <p>{site.process.sub}</p>
            </div>
            <div className="process-grid">
              {site.process.steps.map((step, i) => (
                <div key={step.title} className="process-step">
                  <div className="step-num">{i + 1}</div>
                  <h3>{step.title}</h3>
                  <p>{step.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ---------- Contact ---------- */}
        <section id="contact" className="section section-alt">
          <div className="container">
            <div className="section-head">
              <h2>{site.contact.heading}</h2>
              <p>{site.contact.sub}</p>
            </div>
            <div className="contact-card">
              <a href={`mailto:${site.email}`} className="email">
                {site.email}
              </a>
              <p className="contact-meta">
                {site.phone && (
                  <>
                    <a href={`tel:${site.phone.replace(/[^0-9+]/g, "")}`}>
                      {site.phone}
                    </a>
                    <br />
                  </>
                )}
                {site.instagram && (
                  <>
                    {site.instagram}
                    <br />
                  </>
                )}
                {site.location}
              </p>
              <Link
                href="/custom"
                className="btn btn-solid"
                style={{ marginTop: "1.5rem" }}
              >
                Start a Project
              </Link>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </>
  );
}
