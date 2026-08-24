import Link from "next/link";

export default function SiteHeader() {
  return (
    <header className="site-header">
      <div className="container">
        <Link href="/" className="brand">
          <span className="brand-name">OTL Woodwork</span>
          <span className="brand-sub">Custom Builds</span>
        </Link>
        <nav className="site-nav">
          <a href="#work">Work</a>
          <a href="#gallery">Gallery</a>
          <a href="#process" className="nav-hide-sm">
            Process
          </a>
          <a href="#contact">Contact</a>
        </nav>
      </div>
    </header>
  );
}
