import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "OTL Woodwork — Custom Woodworking",
  description:
    "Hand-built cutting boards, furniture, signs, and home decor. Custom woodwork made to order.",
  openGraph: {
    title: "OTL Woodwork — Custom Woodworking",
    description:
      "Hand-built cutting boards, furniture, signs, and home decor. Custom woodwork made to order.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <head>
        {/*
          Fonts are loaded via <link> rather than next/font so that a Google
          Fonts outage can never fail a production build. If the stylesheet
          doesn't load, the fallback stack in globals.css takes over cleanly.
        */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,700&family=Inter:wght@400;500;600&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
