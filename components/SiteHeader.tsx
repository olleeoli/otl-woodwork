import Link from "next/link";

/**
 * Nav anchors are written as "/#work" rather than "#work" so they still work
 * from pages other than the homepage — a bare "#work" on /custom just scrolls
 * to nothing.
 *
 * On narrow screens "nav-hide-sm" drops the two least essential links so the
 * bar doesn't wrap next to the brand.
 */
export default function SiteHeader() {
  return (
    <header className="site-header">
      <div className="container">
        <Link href="/" className="brand">
          <span className="brand-name">OTL Woodwork</span>
          <span className="brand-sub">Custom Builds</span>
        </Link>
        <nav className="site-nav">
          <Link href="/#work" className="nav-hide-sm">
            Work
          </Link>
          <Link href="/#gallery">Gallery</Link>
          <Link href="/#process" className="nav-hide-sm">
            Process
          </Link>
          <Link href="/custom">Custom</Link>
          <Link href="/#contact">Contact</Link>
        </nav>
      </div>
    </header>
  );
}
