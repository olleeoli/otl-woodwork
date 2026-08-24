/**
 * Everything you'd want to reword on the public site lives here.
 * Edit this file, push, and the site updates — no need to touch the layout.
 */

interface SiteConfig {
  businessName: string;
  tagline: string;
  email: string;
  phone: string;
  instagram: string;
  location: string;
  hero: {
    eyebrow: string;
    heading: string;
    subheading: string;
    primaryCta: string;
    secondaryCta: string;
  };
  work: { heading: string; sub: string; items: { title: string; body: string }[] };
  gallery: { heading: string; sub: string };
  process: {
    heading: string;
    sub: string;
    steps: { title: string; body: string }[];
  };
  contact: { heading: string; sub: string };
}

export const site: SiteConfig = {
  businessName: "OTL Woodwork",
  tagline: "Custom Builds",
  email: "olleeoli@gmail.com",

  // Optional — leave as empty strings to hide these lines
  phone: "",
  instagram: "", // e.g. "@otlwoodwork"
  location: "", // e.g. "Serving the Hudson Valley, NY"

  hero: {
    eyebrow: "Handcrafted in the shop",
    heading: "Custom woodwork, built to last.",
    subheading:
      "Cutting boards, furniture, signs, and home decor — designed with you and built one piece at a time. Browse the work below, then tell me what you have in mind.",
    primaryCta: "See the Gallery",
    secondaryCta: "Start a Project",
  },

  work: {
    heading: "What I build",
    sub: "Every piece is made to order. If you don't see it here, ask — most projects start as a conversation.",
    items: [
      {
        title: "Cutting & Charcuterie Boards",
        body: "End-grain and edge-grain boards in walnut, maple, and cherry. Food-safe finish, built to survive daily use.",
      },
      {
        title: "Furniture",
        body: "Tables, benches, shelving, and built-ins sized to your space and finished to match what you already own.",
      },
      {
        title: "Signs & Engraving",
        body: "CNC-carved signs and lettering for homes, businesses, weddings, and gifts.",
      },
      {
        title: "Home Decor & Gifts",
        body: "Smaller custom pieces — trays, coasters, keepsakes, and one-off commissions.",
      },
    ],
  },

  gallery: {
    heading: "Recent work",
    sub: "A look at finished pieces. Use them as inspiration — yours can be sized, stained, and detailed however you like.",
  },

  process: {
    heading: "How it works",
    sub: "Straightforward, no surprises.",
    steps: [
      {
        title: "Tell me about it",
        body: "Send over your idea, rough dimensions, and any photos for reference. We'll talk wood species, finish, and budget.",
      },
      {
        title: "Quote & deposit",
        body: "You get a written quote with a clear price. A 50% deposit reserves your spot in the build queue.",
      },
      {
        title: "Build & deliver",
        body: "I build it, send progress photos along the way, and arrange pickup or delivery when it's done.",
      },
    ],
  },

  contact: {
    heading: "Let's build something",
    sub: "Have a project in mind? Send a note with what you're thinking and I'll get back to you.",
  },
};
