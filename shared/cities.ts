/**
 * Cities for the checkout's city list (owner, 2026-11-28; canvas E5/E6).
 *
 * What: Pakistan's main cities and towns, each with its province, so that
 * choosing a city fills in the province and the customer is asked one thing
 * instead of two. Anywhere not listed goes through "Other city or town",
 * where the customer types the town and picks the province.
 *
 * Order on screen (OrderScreen): the three cities most orders go to first,
 * then the whole list A to Z, with those three again in their place, so
 * someone scanning alphabetically still finds them.
 *
 * Delivery pricing reads the city by name (shared/pricing.ts isKarachi), so
 * names here are the plain, common spelling.
 */

import type { PK_PROVINCES } from "./orders";

type Province = (typeof PK_PROVINCES)[number];

/** The cities shown first. */
export const TOP_CITIES = ["Karachi", "Lahore", "Islamabad"] as const;

const BY_PROVINCE: Record<Province, string[]> = {
  Punjab: [
    "Arifwala", "Attock", "Bahawalnagar", "Bahawalpur", "Bhakkar", "Burewala", "Chakwal", "Chiniot", "Daska", "Dera Ghazi Khan", "Faisalabad", "Gojra",
    "Gujranwala", "Gujrat", "Hafizabad", "Jaranwala", "Jhang", "Jhelum", "Kamalia", "Kamoke", "Kasur", "Khanewal", "Khanpur", "Kharian", "Khushab", "Lahore",
    "Layyah", "Lodhran", "Mandi Bahauddin", "Mianwali", "Multan", "Murree", "Muzaffargarh", "Narowal", "Okara", "Pakpattan", "Rahim Yar Khan", "Rawalpindi",
    "Sadiqabad", "Sahiwal", "Sargodha", "Sheikhupura", "Sialkot", "Taxila", "Toba Tek Singh", "Vehari", "Wah Cantonment", "Wazirabad",
  ],
  Sindh: [
    "Badin", "Dadu", "Ghotki", "Hyderabad", "Jacobabad", "Karachi", "Khairpur", "Larkana", "Mirpur Khas", "Nawabshah", "Sanghar", "Shikarpur", "Sukkur",
    "Tando Adam", "Tando Allahyar", "Thatta", "Umerkot",
  ],
  "Khyber Pakhtunkhwa": [
    "Abbottabad", "Bannu", "Charsadda", "Chitral", "Dera Ismail Khan", "Haripur", "Kohat", "Mansehra", "Mardan", "Mingora", "Nowshera", "Peshawar", "Swabi",
  ],
  Balochistan: ["Chaman", "Gwadar", "Hub", "Khuzdar", "Quetta", "Sibi", "Turbat", "Zhob"],
  "Islamabad Capital Territory": ["Islamabad"],
  "Gilgit-Baltistan": ["Gilgit", "Hunza", "Skardu"],
  "Azad Jammu and Kashmir": ["Bhimber", "Kotli", "Mirpur", "Muzaffarabad", "Rawalakot"],
};

export interface City {
  name: string;
  province: Province;
}

/** Every listed city, A to Z. */
export const PK_CITIES: readonly City[] = Object.entries(BY_PROVINCE)
  .flatMap(([province, names]) => names.map((name) => ({ name, province: province as Province })))
  .sort((a, b) => a.name.localeCompare(b.name));

/** The province of a listed city, or null for anywhere else (case and spacing don't matter). */
export function provinceOf(city: string): Province | null {
  const want = city.trim().toLowerCase();
  return PK_CITIES.find((c) => c.name.toLowerCase() === want)?.province ?? null;
}
