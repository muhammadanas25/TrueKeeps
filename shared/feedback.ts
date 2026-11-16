/**
 * Customer feedback — the topics, the optional "how was it" answer, and the
 * shape the API accepts. Shared so the /feedback form offers exactly the
 * choices the server validates, with the same words.
 *
 * What it is: a private channel from customers to the TrueKeeps team. Nothing
 * here is ever shown publicly; it is not a review system and must never be
 * presented as one (PRODUCT.md, "never fabricate proof").
 *
 * Design choices:
 *  - Topics are a short fixed list, so the team can sort messages; "other"
 *    always exists, so nobody is forced into a wrong box.
 *  - The rating is optional and uses words, not stars: four plain answers a
 *    customer can pick without thinking about what "3 stars" means.
 *  - Contact details are optional. A reply needs them, feedback doesn't.
 *  - `website` is a honeypot: a field hidden from people that bots fill in.
 *    The server accepts the request and silently drops it, so bots learn
 *    nothing (server/routes/feedback.ts).
 */

import { z } from "zod";

export const FEEDBACK_TOPICS = [
  { id: "making", label: "Making my book" },
  { id: "order", label: "My order or delivery" },
  { id: "print", label: "The printed book" },
  { id: "website", label: "The website" },
  { id: "other", label: "Something else" },
] as const;

export type FeedbackTopic = (typeof FEEDBACK_TOPICS)[number]["id"];
export const FEEDBACK_TOPIC_IDS = FEEDBACK_TOPICS.map((t) => t.id) as [FeedbackTopic, ...FeedbackTopic[]];

/** Best first. Stored as the id; the label is what the customer saw. */
export const FEEDBACK_RATINGS = [
  { id: "loved", label: "Loved it" },
  { id: "good", label: "Good" },
  { id: "okay", label: "Okay" },
  { id: "poor", label: "Not great" },
] as const;

export type FeedbackRating = (typeof FEEDBACK_RATINGS)[number]["id"];
export const FEEDBACK_RATING_IDS = FEEDBACK_RATINGS.map((r) => r.id) as [FeedbackRating, ...FeedbackRating[]];

export const FEEDBACK_MESSAGE_MIN = 5;
export const FEEDBACK_MESSAGE_MAX = 2000;

/** Inbox states the admin page moves a message through. */
export const FEEDBACK_STATUSES = ["new", "read"] as const;
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number];

/** Optional text: trimmed, empty becomes null so the database stores no blanks. */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : null));

/** POST /api/feedback body. */
export const createFeedbackSchema = z.object({
  topic: z.enum(FEEDBACK_TOPIC_IDS, { errorMap: () => ({ message: "Choose what it's about" }) }),
  rating: z.enum(FEEDBACK_RATING_IDS).nullable().optional().transform((v) => v ?? null),
  message: z
    .string()
    .trim()
    .min(FEEDBACK_MESSAGE_MIN, "Write a few words, so we know what happened")
    .max(FEEDBACK_MESSAGE_MAX, `Please keep it under ${FEEDBACK_MESSAGE_MAX} characters`),
  name: optionalText(80),
  /** email or WhatsApp number, only so the team can reply */
  contact: optionalText(120),
  orderNumber: optionalText(32),
  /** the page they came from, e.g. "/orders/…", for context */
  from: optionalText(200),
  /** honeypot: must stay empty */
  website: z.string().max(200).optional(),
});

export type CreateFeedbackBody = z.infer<typeof createFeedbackSchema>;

/** PATCH /api/admin/feedback/:id body. */
export const updateFeedbackSchema = z.object({ status: z.enum(FEEDBACK_STATUSES) });

export const topicLabel = (id: string): string => FEEDBACK_TOPICS.find((t) => t.id === id)?.label ?? id;
export const ratingLabel = (id: string | null | undefined): string | null =>
  id ? FEEDBACK_RATINGS.find((r) => r.id === id)?.label ?? id : null;
