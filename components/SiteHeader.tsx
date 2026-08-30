import Link from "next/link";

/**
 * Nav anchors are written as "/#work" rather than "#work" so they still work
 * from pages other than the homepage — a bare "#work" on /shop just scrolls
 * to nothing.
 *
 * On narrow screens "nav-hide-sm" drops the links that exist elsewhere on the
 * page anyway (the hero links to the gallery, the footer carries the email),
 * leaving Gallery / Shop / Custom so the bar never wraps into the logo.
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
          <Link href="/shop">Shop</Link>
          <Link href="/#process" className="nav-hide-sm">
            Process
          </Link>
          <Link href="/custom">Custom</Link>
          <Link href="/#contact" className="nav-hide-sm">
            Contact
          </Link>
        </nav>
      </div>
    </header>
  );
}
