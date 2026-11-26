/**
 * The FAQ and the policy pages (owner's documents of 10 November 2026, in
 * Website Assets_v3, published 2026-11-23).
 *
 * The wording is the owner's, edited only where it disagreed with how the site
 * works, as the owner decided on 2026-11-22:
 *  - books start at 10 pages (5 sheets) and go up to 32 (16 sheets)
 *  - delivery is as checkout charges it (shared/pricing.ts). Since 2026-11-26:
 *    Karachi free, Rs 200 flat everywhere else (no remote-area charge)
 *  - a paid order can be cancelled by phone within 6 support hours of paying
 *    (restored 2026-11-26, website copy v1; from 2026-11-22 to then it went
 *    straight to print)
 *  - bank transfer is the one way to pay for now
 *  - damage and print faults follow the refund policy (the FAQ draft disagreed)
 * Left out until they are true, as the owner's own notes say: deleting photos
 * 30 days after printing, the privacy answers, and an email address (where
 * mail to hello@ arrives isn't settled; WhatsApp is the contact).
 *
 * Numbers come from the price list and the order rules, so the pages can never
 * disagree with checkout. The FAQ also feeds the FAQPage data in site.ts.
 */

import { BANK_TRANSFER_WINDOW_DAYS, SUPPORT_HOURS, SUPPORT_WHATSAPP } from "./payments";
import { DELIVERY_RULE, formatPKR, INCLUDED_PAGES, PRICE_LIST } from "./pricing";

/** The most sheets a book can have (the layout engine's MAX_SHEETS). */
const MAX_SHEETS = 16;
const SHIPPING = DELIVERY_RULE;
const SUPPORT = `WhatsApp ${SUPPORT_WHATSAPP.display}, Monday to Friday, 10am to 6pm`;

export interface FaqGroup {
  title: string;
  items: Array<{ q: string; a: string[] }>;
}

export const FAQ_GROUPS: FaqGroup[] = [
  {
    title: "About the book",
    items: [
      { q: "What is a Truekeeps book?", a: ["A big photobook made from the photos on your phone. You pick a design, add your photos, and we print it and send it to your door. Your memories, out of your phone and into your hands."] },
      { q: "What size is the book?", a: ["Every Truekeeps book is 12 x 12 inches, square. Big pages give your photos the space they deserve. Every book is a hardcover."] },
      { q: "Glossy or matte: which one should I pick?", a: ["Glossy pages have a shine that makes colours look bright and bold. Matte pages have a soft, smooth feel with no shine, so they show less glare and fewer fingerprints. Both look lovely, and both cost the same. Pick the feel you like best."] },
      { q: "How many pages does a book have?", a: [`Every book starts with ${INCLUDED_PAGES} pages (${INCLUDED_PAGES / 2} sheets). You can add more, up to ${MAX_SHEETS * 2} pages (${MAX_SHEETS} sheets).`] },
      { q: "Can I add extra pages?", a: [`Yes. Each extra sheet (2 pages) costs ${formatPKR(PRICE_LIST.extraSheetMinor)}, up to ${MAX_SHEETS} sheets in total.`] },
      { q: "Do you have other sizes?", a: ["Not yet. We are starting with one size so we can make it just right."] },
    ],
  },
  {
    title: "Making your book",
    items: [
      { q: "Do I need an account to look around?", a: ["No. You can see our designs and start your book without signing up. We ask for your email when you save your book or order it, so your work is kept."] },
      {
        q: "How do I make my book?",
        a: [
          "Pick your occasion, like a wedding, a new baby or a birthday.",
          "Add your photos.",
          "Choose your cover and name your book.",
          "Pick how full the pages feel, and glossy or matte.",
          "Check the preview and approve your book.",
          "Pay, and we print it and send it to you.",
        ],
      },
      { q: "Do I have to design every page myself?", a: ["No. We place your photos for you, and you can change anything you like. Or, if you enjoy it, you can place every photo yourself."] },
      {
        q: "Can I use photos from my phone or computer?",
        a: [
          "Yes. You can make your book on your phone, laptop, desktop or Mac. It works everywhere.",
          "For the best print, use the original photos from your gallery or folders. Photos sent on WhatsApp and screenshots lose quality, and can look blurry on a big page. If a photo is too low in quality to print well, we warn you before you order.",
        ],
      },
      { q: "Can I add names, dates and titles?", a: ["Yes. Your book has a title and a line under it on the cover, and you can add captions under the photos on your pages."] },
      { q: "Can I save my book and finish it later?", a: ["Yes. Your book is saved in your account, so you can come back any time."] },
      { q: "Will my printed book look like the preview?", a: ["Yes. What you see is what you get. The book you approve is the book we print. Colours on paper can look a little softer than on a bright phone screen, which is normal for any printed photo."] },
    ],
  },
  {
    title: "Price and payment",
    items: [
      { q: "How much does a book cost?", a: [`A book is ${formatPKR(PRICE_LIST.bookMinor)} and includes ${INCLUDED_PAGES} pages. Each extra sheet of 2 pages is ${formatPKR(PRICE_LIST.extraSheetMinor)}.`, SHIPPING] },
      { q: "Why can't I pay cash on delivery?", a: ["Every Truekeeps book is made only for you, with your own photos. We start printing after you pay, and a personal book cannot be sold to anyone else. That is why we ask for payment before we print."] },
      {
        q: "How can I pay?",
        a: [`By bank transfer. When you place your order we show you our bank details. Send us a screenshot of your payment on WhatsApp, and we check it and start your book. We hold your order for ${BANK_TRANSFER_WINDOW_DAYS} days while you pay.`],
      },
      { q: "Do I pay for delivery?", a: [SHIPPING] },
    ],
  },
  {
    title: "Delivery and tracking",
    items: [
      { q: "How long will my book take?", a: ["Most books reach you in 4 to 7 working days after your payment is confirmed: 2 to 3 days to print, then 2 to 4 with the courier. Remote areas can take a few days more."] },
      { q: "Where do you deliver?", a: ["All over Pakistan. We do not ship outside Pakistan at the moment."] },
      { q: "How will I know where my order is?", a: ["We email you as your order moves along, and your order page on our site always shows where it is. When your book is dispatched, we send you its tracking number."] },
      { q: "Can I send the book as a gift to someone else?", a: ["Yes. Just add their name and address at checkout, and we will send it straight to them. Gift parcels don't include the price or an invoice."] },
    ],
  },
  {
    title: "Changes, cancellations and problems",
    items: [
      {
        q: "Can I cancel and get my money back?",
        a: [
          `Yes, within 6 support hours of paying (${SUPPORT_HOURS}). Please call us, because texts and emails can't be used to cancel. Refunds reach you in 3 to 7 working days.`,
          "After that your book is in production, and it can't be changed or cancelled, because it is made only for you.",
        ],
      },
      {
        q: "I made a mistake in my book. What now?",
        a: ["We print exactly the book you approve, so please check names, dates and photos carefully in the preview. A mistake in what you chose or approved isn't a print fault, but you can order a corrected copy at 10% off."],
      },
      {
        q: "What if my book arrives damaged, or has a print problem?",
        a: [
          "We are sorry if that happens. Send us photos on WhatsApp within 48 hours of delivery.",
          "A print fault, or a parcel lost by the courier: we reprint your book for free. Damaged by the courier: a free reprint if you send an unboxing video, or a reprint at 40% off without one. See our Refund and Reprint Policy for the details.",
        ],
      },
    ],
  },
  {
    title: "Help and support",
    items: [{ q: "How can I reach you?", a: [`Message us on ${SUPPORT}. A real person from our team will reply.`] }],
  },
];

/* ── Policies ──────────────────────────────────────────────────── */

export type PolicyBlock = { h: string } | { p: string } | { list: string[] } | { table: { head: [string, string]; rows: Array<[string, string]> } };

export interface PolicyPage {
  slug: string;
  title: string;
  /** one line for search results and the page's description */
  summary: string;
  updated: string;
  blocks: PolicyBlock[];
}

export const POLICIES: PolicyPage[] = [
  {
    slug: "shipping",
    title: "Shipping Policy",
    summary: "We deliver Truekeeps photobooks all over Pakistan, usually in 4 to 7 working days after your payment is confirmed.",
    updated: "26 November 2026",
    blocks: [
      { p: "We deliver Truekeeps photobooks all over Pakistan. Most books reach you in 4 to 7 working days after your payment is confirmed." },
      { h: "Where we deliver" },
      { p: "We deliver anywhere in Pakistan. We do not ship outside Pakistan at the moment." },
      { h: "How long it takes" },
      { p: "Every book is made just for you, so it is printed after you order." },
      {
        table: {
          head: ["Step", "Time"],
          rows: [
            ["Printing your book", "2 to 3 working days after your payment is confirmed"],
            ["Delivery by courier", "2 to 4 working days after we hand it to the courier"],
            ["Total", "Usually 4 to 7 working days"],
          ],
        },
      },
      { p: "Working days are Monday to Friday. Weekends and public holidays are not counted. Remote areas can take a few extra days." },
      { h: "Delivery charges" },
      {
        table: {
          head: ["Delivery area", "Charge"],
          rows: [
            ["Karachi", "Free"],
            ["Rest of Pakistan", formatPKR(PRICE_LIST.standardDeliveryMinor)],
          ],
        },
      },
      { p: "The delivery charge for your address is shown at checkout before you pay." },
      { h: "Our couriers" },
      { p: "We work with TCS and Leopards. For each city, we choose the courier with the best delivery record there, so your book arrives safely." },
      { h: "Tracking your order" },
      { p: "When your book is dispatched, we send you its tracking number. Your order page on our site always shows where it is." },
      { h: "Changing your delivery address" },
      { p: "You can change your delivery address until your book is dispatched. Just message us on WhatsApp. There is no charge for this. Once the book is with the courier, the address cannot be changed." },
      { h: "Sending a book as a gift" },
      { p: "You can send your book to someone else's address. Gift parcels do not include the price or any invoice inside." },
      { h: "If delivery fails" },
      { p: "Sometimes a courier cannot deliver, for example if the phone is off, the address is wrong, or the parcel is refused. In that case:" },
      { list: ["We arrange one more delivery attempt for free.", "If the second attempt also fails, you pay the courier's charge for any further attempt."] },
      { p: "Please make sure your address and phone number are correct when you order." },
      { h: "Lost parcels" },
      { p: "If the courier loses your parcel, we print and send your book again for free. See our Refund and Reprint Policy for details." },
      { h: "Need help?" },
      { p: `Our team is on ${SUPPORT}.` },
    ],
  },
  {
    slug: "refund-and-reprint",
    title: "Refund and Reprint Policy",
    summary: "If your book has a print fault, or is lost or damaged on the way, we reprint it. Money refunds are given when an order is cancelled before printing.",
    updated: "26 November 2026",
    blocks: [
      { p: "If your book has a print fault, or is lost or damaged on the way, we reprint it. Money refunds are only given when an order is cancelled before printing." },
      { h: "Why we reprint instead of refund" },
      { p: "Your photobook holds your memories, so what matters most is getting the right book in your hands. And because every book is personal, we cannot resell it or take it back into stock." },
      { h: "What you get in each case" },
      {
        table: {
          head: ["What happened", "What you get"],
          rows: [
            ["Print fault (colour printing error, binding problem, missing or cut pages)", "Free reprint"],
            ["Damaged by the courier, with an unboxing video", "Free reprint"],
            ["Damaged by the courier, without an unboxing video", "Reprint at 40% off the book price"],
            ["Parcel lost by the courier", "Free reprint"],
            ["A mistake in what you chose or approved", "No free reprint or refund. You can order a corrected copy at 10% off"],
            ["You cancelled within 6 support hours of paying", "Full refund"],
            ["We cancelled your order", "Full refund"],
          ],
        },
      },
      { h: "What you choose is what we print" },
      { p: "Before you order, you see a full preview of your book and approve it. We print exactly what you approve. This is true even when our tools arranged the book for you, because you are the one who checked and approved it." },
      { p: "These are not print faults, and are not covered:" },
      {
        list: [
          "Spelling or text mistakes you typed",
          "Photos you used after our low-quality warning was shown",
          "Small colour differences between your phone screen and paper. Screens glow, paper does not, so prints always look slightly different",
          "Wrong photos, layout or design that you chose",
        ],
      },
      { p: "If you would like a corrected copy, you can place a new order at 10% off." },
      { h: "How to report a problem" },
      { p: "Please contact us on WhatsApp within 48 hours of delivery. Send us:" },
      { list: ["Your order number", "Clear photos of the problem", "A photo of the parcel or box", "An unboxing video, if the book was damaged in delivery"] },
      { p: "We check every report and reply as soon as we can during support hours." },
      { h: "Sending the book back" },
      { p: "For a reprint, please send the faulty or damaged book back to us using any courier. We pay you back the courier charge." },
      { h: "Reprint delivery" },
      { p: "Free reprints are delivered free. For a reprint at 40% off, or a corrected copy at 10% off, the normal delivery charge applies." },
      { h: "How refunds are paid" },
      { p: "Refunds are sent by bank transfer only, within 3 to 7 working days. We will ask you for your bank account details." },
      { h: "Contact us" },
      { p: `${SUPPORT}.` },
    ],
  },
  {
    slug: "cancellation",
    title: "Cancellation Policy",
    summary: "You can cancel or change your order within 6 support hours of paying and get your full payment back. After that, your book goes to print.",
    updated: "26 November 2026",
    blocks: [
      { p: "You can cancel or change your order within 6 support hours of paying, and get your full payment back. After that, your book goes to print and the order cannot be cancelled." },
      { h: "Why there is a time limit" },
      { p: "Every Truekeeps book is made only for you, with your own photos. Once it is printed, nobody else can use it. That is why we start printing quickly and keep the cancel window short." },
      { h: "Your 6-hour window" },
      { p: `The 6 hours only count during our support hours: ${SUPPORT_HOURS.replace("Mon to Fri", "Monday to Friday")}. This way, you always get a fair chance to reach us.` },
      {
        table: {
          head: ["You paid on", "You can cancel or change until"],
          rows: [
            ["Tuesday, 11am", "Tuesday, 5pm"],
            ["Tuesday, 3pm", "Wednesday, 1pm"],
            ["Friday, 9pm", "Monday, 4pm"],
          ],
        },
      },
      { h: "How to cancel or change your order" },
      { p: "Call us, by phone or WhatsApp call, and speak with our support team within your window. A cancellation is only confirmed once you have spoken to a real person on our team." },
      { p: "Text messages, voice notes and emails are not accepted as a cancellation, because we need to confirm it with you directly." },
      { p: `Phone and WhatsApp: ${SUPPORT_WHATSAPP.display}.` },
      { h: "Your refund" },
      { p: "If you cancel in time, you get your full payment back. Refunds are sent by bank transfer within 3 to 7 working days. We will ask you for your bank account details." },
      { h: "After your window ends" },
      { p: "Once your window has ended, your book is in production. You cannot cancel or change it after this point, and no refund is given." },
      { h: "When Truekeeps may cancel your order" },
      { p: "We may cancel an order in these cases:" },
      {
        list: [
          `Payment not confirmed. If you pay by bank transfer, please send a clear payment screenshot. If we cannot match your payment within ${BANK_TRANSFER_WINDOW_DAYS} days, the order is cancelled.`,
          "Photos too low in quality. If your photos would print badly, we will contact you first. If they cannot be replaced, we may cancel the order.",
          "Content we cannot print. We do not print illegal or offensive content.",
          "A problem on our side. If we are unable to print your book for any reason.",
        ],
      },
      { p: "If we cancel your order, you always get a full refund." },
    ],
  },
];

export const policyBySlug = (slug: string) => POLICIES.find((p) => p.slug === slug);
