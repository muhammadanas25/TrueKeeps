# ADR 012 — One book price, charged per extra sheet, free shipping

**Status:** accepted · 2026-11-11

## Context

ADR 005 launched with placeholder prices: a flat price per binding (Softcover
Rs 4,499, Hardcover Rs 6,499, Layflat Rs 9,499), whatever the page count, plus a
flat Rs 299 delivery fee, free from Rs 10,000. The builder makes as many pages
as the photos need, so a 60-page book cost the same as a 10-page one.

## Decision

The owner set the prices on 2026-11-11:

- **Rs 5,690 a book, in any binding.** The binding is now a choice of cover,
  like the finish, not a price input.
- **The price includes 5 sheets inside the book.** A sheet is 2 pages, so that
  is 10 pages. The cover (the "front page") doesn't count. Since ADR 013 new books
  have no separate title page; on older books that still have one, it isn't
  charged either.
- **Each sheet beyond that is Rs 550**, charged per sheet, never per page. A
  part-filled sheet is a whole sheet: 11 pages is 6 sheets.
- **Shipping is free**, except **Rs 500** for Gilgit-Baltistan, Azad Jammu and
  Kashmir, and Balochistan outside Quetta. It is charged once per order.

All of it is in `shared/pricing.ts`. `quote()` now takes the printed page count
(`printedPageCount(pages)`, every page inside the book; an older book's title page is not counted) and the address.
The server prices an order from the saved book's pages and the submitted
address, never from a total sent by the browser, as before. `PRICE_LIST.version`
is `pkr-2026-11-11`, and old orders keep the price they were placed at.

No schema change: `unitMinor` is now the price of one copy including its extra
sheets, `shippingMinor` holds the remote-area charge (0 elsewhere), and the
order already stores `pageCount`.

**Remote areas.** The address form has a province list and a free-text city.
Gilgit-Baltistan and AJK are matched by province. For Balochistan the city is
matched against the word "Quetta" (so "Quetta Cantt" counts). A Balochistan
address with any other city pays Rs 500.

**Saying it.** The trust band says "Free shipping". The Rs 500 exception is
stated on the prices page, in the FAQ and llms.txt (`SHIPPING_LINE`), and on
the order screen as soon as the address is in a remote area, before payment.

## Consequences

- Price now follows size. A book with 30 pages inside is 15
  sheets: Rs 5,690 + 10 extra sheets × Rs 550 = Rs 11,190. A small book costs
  more than the old softcover price (Rs 4,499) and less than the old hardcover
  and layflat prices (Rs 6,499 and Rs 9,499).
- The editor's price updates as pages are added or removed. It shows the
  price before any remote-area charge, because there is no address yet.
- The order screen's total can change while the customer types their city,
  which is intended: the charge shows before they pay.
- A customer who misspells Quetta (or writes only a neighbourhood) is charged
  Rs 500. If that happens often, add a city dropdown for Balochistan.
- The binding picker shows what each binding is instead of a price.

## Alternatives rejected

- **Per-page pricing:** the owner prices by sheet, the unit the printer uses.
- **A city list for "interior Balochistan":** more precise but needs a list to
  maintain; the Quetta word match covers the stated rule.
