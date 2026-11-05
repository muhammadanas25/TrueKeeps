/**
 * Book-type photos, keyed by BookType.slug (shared/site.ts). Separate from the
 * site data because these are Vite image imports, which the server can't load.
 */

import wedding from "./assets/book-wedding.webp";
import baby from "./assets/book-baby.webp";
import birthday from "./assets/book-birthday.webp";
import school from "./assets/book-school.webp";
import umrah from "./assets/book-umrah.webp";
import travel from "./assets/book-travel.webp";
import anniversary from "./assets/book-anniversary.webp";

export const BOOK_IMAGES: Record<string, string> = { wedding, baby, birthday, school, umrah, travel, anniversary };
