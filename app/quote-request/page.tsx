import type { Metadata } from "next";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import IntakeForm from "@/components/IntakeForm";
import { turnstileSiteKey } from "@/lib/otl-intake/config";
import { site } from "@/site.config";

/**
 * Hidden CNC quote request page (Phase 1 Step 6). Not linked from navigation and
 * kept out of search results until the pipeline launches (Phase 4).
 */
export const metadata: Metadata = {
  title: "Request a CNC Quote — OTL Woodwork",
  robots: { index: false, follow: false },
};

export default function QuoteRequestPage() {
  return (
    <>
      <SiteHeader />
      <main>
        <section className="section">
          <div className="container" style={{ maxWidth: 760 }}>
            <div className="section-head">
              <h1>Request a CNC quote</h1>
              <p>
                Upload your design as an SVG, tell us the size and wood, and we&apos;ll send a
                quote within 1 business day.
              </p>
            </div>
            <div className="card">
              <IntakeForm siteKey={turnstileSiteKey()} contactEmail={site.email} />
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
