/**
 * Site map + search metadata — the ONE place public pages are described.
 *
 * What: the brand name, every public URL with its title/description/preview
 * image, the book-type copy, the FAQ, and the generators for <head> tags,
 * structured data, sitemap.xml and llms.txt.
 *
 * Why shared: four consumers must never disagree about what a page says:
 *  - scripts/prerender.mjs writes the static HTML crawlers and link previews read
 *  - server/vite.ts decides 200 / noindex / 404 from these same paths
 *  - client/src/App.tsx keeps the tab title in sync during in-app navigation
 *  - the marketing pages render the copy and FAQ visibly
 * Google penalises structured data that doesn't match the visible page, so
 * prices come straight from shared/pricing.ts and FAQ answers are one array.
 *
 * Truth rule (PRODUCT.md, "Evidence on Hand"): nothing here may claim reviews,
 * ratings, customer counts or delivery times until they are real. That is why
 * the Product data has offers but no aggregateRating. The owner confirmed on
 * 2026-11-05: the 12×12 inch size on every binding, glossy or matte finish, the
 * Love-it guarantee (wording still to come) and help on WhatsApp (no hours promised).
 * Prices and the free-shipping rule (owner, 2026-11-11) come from shared/pricing.ts.
 * No page may claim a paper certification, such as FSC, without printer proof.
 */

import { formatPKR, INCLUDED_PAGES, PRICE_LIST, REMOTE_AREAS_TEXT } from "./pricing";

export const SITE = {
  url: "https://thetruekeeps.com",
  /** Display brand. Single switch: changing it updates every title and schema. */
  name: "TrueKeeps",
  /** Other spellings people search; tells Google they are the same business. */
  alternateNames: ["TrueKeep", "The True Keeps", "truekeeps"],
  tagline: "Beautiful quality, for beautiful moments.",
  logo: "/icon-512.png",
  defaultOgImage: "/og/home.jpg",
} as const;

/* ── Book types ─────────────────────────────────────────────── */

export interface BookType {
  /** URL segment: /photo-books/<slug> */
  slug: string;
  /** Short label for cards and links */
  label: string;
  /** Card subline on the homepage */
  blurb: string;
  /** Builder quiz answer this type starts from (see builder/data.ts OCCASIONS) */
  occasion: "wedding" | "baby" | "travel" | "birthday" | "mix";
  /** Product name in structured data */
  productName: string;
  title: string;
  description: string;
  h1: string;
  intro: string;
  /** "What people put in it" list: makes each page genuinely distinct */
  ideas: string[];
  imageAlt: string;
}

export const BOOK_TYPES: BookType[] = [
  {
    slug: "wedding",
    label: "Weddings",
    blurb: "The day, start to last dance",
    occasion: "wedding",
    productName: "Wedding photo book",
    title: "Wedding Photo Books & Albums in Pakistan | TrueKeeps",
    description:
      "Turn your mehndi, baraat and walima photos into a printed wedding photo book. We lay it out, you preview every page, and we deliver across Pakistan.",
    h1: "Wedding photo books from your own photos",
    intro:
      "Your wedding photos are probably spread across a photographer's drive, a family WhatsApp group and three phones. Bring them together into one printed book you can actually pass around. Add your photos, and we lay out the whole album for you, ready to change or order as it is.",
    ideas: ["Mehndi, baraat and walima", "The nikah and family portraits", "Candid shots from relatives' phones", "A book for each set of parents"],
    imageAlt: "Wedding photo book for Mubeen & Farah, three copies stacked",
  },
  {
    slug: "baby",
    label: "New baby",
    blurb: "First smiles to first steps",
    occasion: "baby",
    productName: "Baby photo book",
    title: "Baby Photo Books in Pakistan: Your Baby's First Year | TrueKeeps",
    description:
      "Make a printed baby photo book from the photos on your phone. First smiles, aqiqah and first steps, laid out for you and delivered across Pakistan.",
    h1: "Baby photo books for the first year and beyond",
    intro:
      "Babies change every week, and most of those photos stay buried in a camera roll. Choose the ones you love and we turn them into a finished book, so the first year becomes something the whole family can hold and look through together.",
    ideas: ["The first days home", "Aqiqah and family visits", "First smile, first food, first steps", "A copy for the grandparents"],
    imageAlt: "Baby photo book titled Little Feet, First Journey, tied with a ribbon",
  },
  {
    slug: "birthday",
    label: "Birthdays",
    blurb: "Parties, cakes & big days",
    occasion: "birthday",
    productName: "Birthday photo book",
    title: "Birthday Photo Books & Gifts in Pakistan | TrueKeeps",
    description:
      "Turn birthday photos into a printed photo book, or make one as a personal gift. We design it for you, you preview every page, delivered across Pakistan.",
    h1: "Birthday photo books worth keeping",
    intro:
      "A birthday party lasts an afternoon, and the photos usually disappear the next day. Put them into a book instead: the cake, the decorations, everyone who came. It also makes a personal gift, built from years of photos of the person you are celebrating.",
    ideas: ["A first birthday, start to finish", "Every year so far, in one book", "A surprise gift for a parent or friend", "Milestone birthdays with the whole family"],
    imageAlt: "Birthday photo book open to a spread of a heart-shaped cake",
  },
  {
    slug: "school",
    label: "School days",
    blurb: "First days and proud milestones",
    occasion: "mix",
    productName: "School memories photo book",
    title: "School Memory Photo Books in Pakistan | TrueKeeps",
    description:
      "Keep first days, sports days and school milestones in a printed photo book. Made from your own photos, laid out for you, delivered across Pakistan.",
    h1: "School memory books for proud parents",
    intro:
      "From the nervous first day to the last class photo, school years go quickly. Gather those photos from your phone into a single book your child can look back on, and add to the story with a new one each year.",
    ideas: ["The first day of school", "Sports days and annual functions", "Artwork and class photos", "One book per school year"],
    imageAlt: "School photo book with a child holding a first day of school sign",
  },
  {
    slug: "umrah",
    label: "Umrah & Hajj",
    blurb: "A journey of a lifetime",
    occasion: "travel",
    productName: "Umrah and Hajj photo book",
    title: "Umrah & Hajj Photo Books in Pakistan | TrueKeeps",
    description:
      "Keep your Umrah or Hajj journey in a printed photo book. Add your photos from Makkah and Madinah, we lay it out, and we deliver across Pakistan.",
    h1: "Umrah and Hajj photo books for your journey",
    intro:
      "A journey to Makkah and Madinah is one your family will talk about for years. Keep it somewhere better than a phone: a printed book of the places, the people you travelled with and the moments you want your children to see.",
    ideas: ["Makkah and Madinah", "Travelling with parents and children", "Family and travel group photos", "A gift for the elders who went"],
    imageAlt: "Umrah photo book with a family at the Kaaba on the cover",
  },
  {
    slug: "travel",
    label: "Travel",
    blurb: "Every place you wandered",
    occasion: "travel",
    productName: "Travel photo book",
    title: "Travel Photo Books in Pakistan: Print Your Trips | TrueKeeps",
    description:
      "Turn trip photos into a printed travel photo book, from Hunza and Skardu to trips abroad. We lay it out for you and deliver across Pakistan.",
    h1: "Travel photo books from your trip photos",
    intro:
      "You took hundreds of photos on that trip and have looked at maybe ten since. Add the best of them, from the northern areas or further away, and get a finished book that tells the story of where you went and who you went with.",
    ideas: ["Hunza, Skardu and Kumrat", "Family holidays and honeymoons", "Road trips with friends", "One book for every trip"],
    imageAlt: "Travel photo book titled No Signal, Just Kumrat, held in two hands",
  },
  {
    slug: "anniversary",
    label: "Anniversaries",
    blurb: "Your story, year after year",
    occasion: "wedding",
    productName: "Anniversary photo book",
    title: "Anniversary Photo Books & Gifts in Pakistan | TrueKeeps",
    description:
      "Tell your story in a printed anniversary photo book. A personal gift made from your own photos, laid out for you and delivered across Pakistan.",
    h1: "Anniversary photo books that tell your story",
    intro:
      "An anniversary gift made of your own photos is hard to beat. Start with the early days, add the trips and the ordinary Sundays, and give your partner a book that shows how far you have come together.",
    ideas: ["From your first photo together to now", "Trips and everyday moments", "A surprise gift for your partner", "A gift from children to their parents"],
    imageAlt: "Pink anniversary book titled You & Me, our love story",
  },
];

export const bookTypeBySlug = (slug: string) => BOOK_TYPES.find((b) => b.slug === slug);

/* ── FAQ ────────────────────────────────────────────────────── */

const bindingNames = PRICE_LIST.bindings.map((b) => b.name.toLowerCase());

/** Shipping rule in one sentence, straight from the checkout price list. */
export const SHIPPING_LINE = `Shipping is free anywhere in Pakistan, except ${REMOTE_AREAS_TEXT}, where delivery is ${formatPKR(PRICE_LIST.remoteDeliveryMinor)}.`;
const shippingLine = SHIPPING_LINE;

/** One-line price summary shared by the homepage, hub page and llms.txt. */
export const PRICE_SUMMARY =
  `A book is ${formatPKR(PRICE_LIST.bookMinor)} in any binding (${bindingNames.slice(0, -1).join(", ")} or ${bindingNames.at(-1)}) ` +
  `and includes ${INCLUDED_PAGES} pages. Each extra sheet of 2 pages is ${formatPKR(PRICE_LIST.extraSheetMinor)}`;

/** Rendered visibly on the page AND as FAQPage data, so the two always match. */
export const FAQS: Array<{ q: string; a: string }> = [
  {
    q: "How much does a photo book cost in Pakistan?",
    a: `${PRICE_SUMMARY}. ${shippingLine}`,
  },
  {
    q: "How much is delivery?",
    a: shippingLine,
  },
  {
    q: "What size is the book?",
    a: "12×12 inches, with large square pages that give your photos plenty of room.",
  },
  {
    q: "Is the book glossy or matte?",
    a: "You choose. Matte is soft with no glare, glossy is bright with a shine. Both cost the same, and you pick when you order.",
  },
  {
    q: "Do I need design skills?",
    a: "No. Answer a question about the occasion, add your photos, and we lay out the whole book for you. You can change themes, layouts, captions and page order, or simply order it as it is.",
  },
  {
    q: "Can I see my book before I pay?",
    a: "Yes. It is free to start, and you can flip through every page of your book on screen. You only pay when you choose to order.",
  },
  {
    q: "How do I pay?",
    a: "Online by card or Google Pay through Safepay's secure checkout. Because every book is personalised and made to order, we don't offer cash on delivery.",
  },
  {
    q: "Can I make my book on my phone?",
    a: "Yes. The whole process works in your phone's browser, with no app to install. You can add your photos and finish the book right there.",
  },
];

/* ── Pages ──────────────────────────────────────────────────── */

export interface PageMeta {
  path: string;
  title: string;
  description: string;
  ogImage: string;
  jsonLd: object[];
}

const abs = (path: string) => SITE.url + path;

const ORGANIZATION = {
  "@context": "https://schema.org",
  "@type": "Organization",
  "@id": abs("/#organization"),
  name: SITE.name,
  alternateName: SITE.alternateNames,
  url: abs("/"),
  logo: abs(SITE.logo),
  slogan: SITE.tagline,
  areaServed: { "@type": "Country", name: "Pakistan" },
};

const WEBSITE = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: SITE.name,
  alternateName: SITE.alternateNames,
  url: abs("/"),
  publisher: { "@id": abs("/#organization") },
};

const FAQ_PAGE = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQS.map((f) => ({
    "@type": "Question",
    name: f.q,
    acceptedAnswer: { "@type": "Answer", text: f.a },
  })),
};

function breadcrumbs(items: Array<{ name: string; path: string }>) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, k) => ({ "@type": "ListItem", position: k + 1, name: it.name, item: abs(it.path) })),
  };
}

/**
 * Product data for a page. Offers are generated from the live price list so
 * they cannot drift from what checkout charges. PRICE_LIST is in paisa; schema
 * wants a rupee amount.
 */
function product(name: string, description: string, path: string, image: string) {
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name,
    description,
    image: abs(image),
    url: abs(path),
    brand: { "@type": "Brand", name: SITE.name },
    // every binding starts at the same price; more sheets cost more, so only
    // the lowest price is stated
    offers: {
      "@type": "AggregateOffer",
      priceCurrency: "PKR",
      lowPrice: (PRICE_LIST.bookMinor / 100).toFixed(0),
      offerCount: PRICE_LIST.bindings.length,
      availability: "https://schema.org/InStock",
      url: abs(path),
    },
  };
}

const HOME_META: PageMeta = {
  path: "/",
  title: "TrueKeeps | Photo Books in Pakistan, Designed for You",
  description:
    "Turn the photos on your phone into a printed photo book. Design it yourself in minutes or let us create it for you, with delivery across Pakistan.",
  ogImage: SITE.defaultOgImage,
  jsonLd: [ORGANIZATION, WEBSITE],
};

const HUB_META: PageMeta = {
  path: "/photo-books",
  title: "Photo Books in Pakistan: Prices & Types | TrueKeeps",
  description: `Printed photo books made from your own photos, from ${formatPKR(PRICE_LIST.bookMinor)}, delivered across Pakistan. Free to start, and you only pay when you love it.`,
  ogImage: SITE.defaultOgImage,
  jsonLd: [
    product("Custom photo book", "A printed 12×12 inch photo book made from your own photos and delivered across Pakistan.", "/photo-books", SITE.defaultOgImage),
    FAQ_PAGE,
    breadcrumbs([
      { name: "Home", path: "/" },
      { name: "Photo books", path: "/photo-books" },
    ]),
  ],
};

const bookMeta = (b: BookType): PageMeta => {
  const path = `/photo-books/${b.slug}`;
  const ogImage = `/og/${b.slug}.jpg`;
  return {
    path,
    title: b.title,
    description: b.description,
    ogImage,
    jsonLd: [
      product(b.productName, b.description, path, ogImage),
      breadcrumbs([
        { name: "Home", path: "/" },
        { name: "Photo books", path: "/photo-books" },
        { name: b.label, path },
      ]),
    ],
  };
};

/** Every page that is prerendered, indexable and listed in the sitemap. */
export const PUBLIC_PAGES: PageMeta[] = [HOME_META, HUB_META, ...BOOK_TYPES.map(bookMeta)];

const PUBLIC_PATHS = new Set(PUBLIC_PAGES.map((p) => p.path));
export const isPublicPath = (path: string) => PUBLIC_PATHS.has(path);

/** Fallback for app routes (builder, account): they carry noindex anyway. */
export const DEFAULT_META: PageMeta = { ...HOME_META, jsonLd: [] };

export const metaForPath = (path: string): PageMeta => PUBLIC_PAGES.find((p) => p.path === path) ?? { ...DEFAULT_META, path };

/**
 * Client-only app routes. These answer 200 so the app can load, but with
 * noindex, because they are private or empty without a session. Anything
 * neither public nor listed here is a true 404. Keep in sync with App.tsx.
 */
const APP_ROUTE = /^\/(templates|create|wizard|wizard-classic|books|account|orders(\/[^/]+)?|admin\/orders)$/;
export const isAppRoute = (path: string) => APP_ROUTE.test(path);

/* ── Generators ─────────────────────────────────────────────── */

const escAttr = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
const escText = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

/**
 * The <head> tags for a prerendered page. `<` is escaped in JSON-LD so copy
 * can never close the script tag early.
 */
export function headHtml(meta: PageMeta): string {
  const url = abs(meta.path);
  const image = abs(meta.ogImage);
  const tags = [
    `<title>${escText(meta.title)}</title>`,
    `<meta name="description" content="${escAttr(meta.description)}" />`,
    `<link rel="canonical" href="${url}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="${escAttr(SITE.name)}" />`,
    `<meta property="og:locale" content="en_PK" />`,
    `<meta property="og:title" content="${escAttr(meta.title)}" />`,
    `<meta property="og:description" content="${escAttr(meta.description)}" />`,
    `<meta property="og:url" content="${url}" />`,
    `<meta property="og:image" content="${image}" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${escAttr(meta.title)}" />`,
    `<meta name="twitter:description" content="${escAttr(meta.description)}" />`,
    `<meta name="twitter:image" content="${image}" />`,
    ...meta.jsonLd.map((d) => `<script type="application/ld+json">${JSON.stringify(d).replace(/</g, "\\u003c")}</script>`),
  ];
  return tags.join("\n    ");
}

/** sitemap.xml. No lastmod/priority: Google ignores values it can't trust. */
export function sitemapXml(): string {
  const urls = PUBLIC_PAGES.map((p) => `  <url><loc>${abs(p.path)}</loc></url>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

/** llms.txt: a plain-language summary for AI assistants (emerging convention). */
export function llmsTxt(): string {
  return [
    `# ${SITE.name}`,
    "",
    `> ${SITE.name} turns the photos on your phone into printed 12×12 inch photo books, delivered across Pakistan. Design it yourself in minutes, or let us lay out the whole book for you.`,
    "",
    "## How it works",
    "",
    "1. Pick the moment: answer a question about the occasion.",
    "2. Add your photos from your phone or computer.",
    "3. We lay out the whole book. Change anything you like, preview every page, then order.",
    "",
    "## Prices",
    "",
    `- ${PRICE_SUMMARY}. Prices are in Pakistani rupees.`,
    `- ${shippingLine}`,
    "- Free to start. You only pay when you order.",
    "- Payment is online by card or Google Pay through Safepay. No cash on delivery.",
    "",
    "## Pages",
    "",
    `- [Photo books: prices and FAQ](${abs("/photo-books")})`,
    ...BOOK_TYPES.map((b) => `- [${b.productName}](${abs(`/photo-books/${b.slug}`)})`),
    `- [Start making a book](${abs("/wizard")})`,
    "",
  ].join("\n");
}
