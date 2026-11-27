/**
 * Occasion story pages: the long-form copy for /photo-books/<slug>.
 *
 * What: the owner's page copy for an occasion, as data. Wedding is the first
 * ("The Truekeeps: Wedding Page Copy", 28 Nov 2026); other occasions keep the
 * shorter BookType page until their copy arrives.
 *
 * Why here and not in the component: the questions are also published as
 * FAQPage structured data (shared/site.ts bookMeta), and Google penalises
 * structured data that doesn't match the visible page. One array feeds both.
 *
 * Rules from the copy document:
 *  - the words are used exactly as written; `title` in a reason is the bold part
 *  - the price is never typed here: the page reads it from shared/pricing.ts
 *  - no price block (binding, extra sheets, delivery) on these pages; the price
 *    line links to /photo-books instead
 *  - truth rule (PRODUCT.md): an answer that describes something the site
 *    can't do yet stays out until it can (see the gift question below)
 */

export interface OccasionStory {
  /** Hero headline, split so the last phrase can sit on the Rose highlight. */
  heroLead: string;
  heroMark: string;
  heroText: string;
  reasonsTitle: string;
  /** Bold heading + short paragraph each. */
  reasons: Array<{ title: string; text: string }>;
  ideasTitle: string;
  ideas: string[];
  coversTitle: string;
  coversIntro: string;
  /** Title and line shown on the example covers. */
  coverExample: { title: string; line: string };
  otherTitle: string;
  faqs: Array<{ q: string; a: string }>;
  closing: string;
}

export const OCCASION_STORIES: Partial<Record<string, OccasionStory>> = {
  wedding: {
    heroLead: "Your wedding album, ",
    heroMark: "made by you.",
    heroText: "A wedding album you make yourself, from all the photos you love.",
    reasonsTitle: "Why print your wedding photos?",
    reasons: [
      {
        title: "Most wedding photos never get printed.",
        text: "Hundreds of photos are taken, shared once, and then forgotten in a gallery. An album gives the best of them a real home.",
      },
      {
        title: "The photos are everywhere.",
        text: "Some are on your phone, some on your cousin’s, some lost in a WhatsApp group. An album brings them all together in one place.",
      },
      {
        title: "The best gift for a newly married couple.",
        text: "Make it for your brother, sister or best friend. A gift they’ll keep long after the wedding is over.",
      },
      {
        title: "One day you’ll show your kids.",
        text: "Years from now, you’ll sit together and turn the pages. That’s something a phone screen can never quite do.",
      },
    ],
    ideasTitle: "What to put in your wedding album",
    ideas: [
      "Every event: mehndi, nikah, baraat and walima",
      "Family portraits with both sides",
      "The dance practices and the dholki nights",
      "The moments after: the first family dinner, the first trip together",
      "Make a second copy for each set of parents",
    ],
    coversTitle: "Pick a cover for your wedding album",
    coversIntro: "Simple, photo-led or just your names. Pick the one that feels like you.",
    coverExample: { title: "Mubeen & Farah", line: "December 2026" },
    otherTitle: "Not a wedding? Pick another moment",
    faqs: [
      {
        q: "Can I use photos from different phones?",
        a: "Yes. Add photos from your phone, laptop or anyone’s camera. For the best print, use the original photos, because ones sent on WhatsApp lose quality.",
      },
      { q: "How many photos should I add?", a: "At least 15. For a full wedding album, 30 to 50 works best." },
      {
        q: "Can I put our names and date on the cover?",
        a: "Yes. Add your names as the title, and a date or place on the line under it.",
      },
      // Held back until checkout has the gift tick box (Checkout Copy, Step 7:
      // "Gift tick box — NEW: missing in current build"). Put it back, exactly:
      //   q: "Can I send it as a gift to the couple?"
      //   a: "Yes. Tick “Sending this as a gift?” at checkout, and we won’t put any price in the parcel."
      { q: "How long does it take?", a: "We print it in 2 to 3 days, and the courier brings it in 2 to 4." },
    ],
    closing: "One day you’ll be glad you made it.",
  },
};

export const storyFor = (slug: string): OccasionStory | undefined => OCCASION_STORIES[slug];
