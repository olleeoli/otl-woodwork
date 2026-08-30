import { site } from "@/site.config";

export default function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="container">
        <span>
          &copy; {new Date().getFullYear()} {site.businessName}. All rights
          reserved.
        </span>
        <a href={`mailto:${site.email}`}>{site.email}</a>
      </div>
    </footer>
  );
}
