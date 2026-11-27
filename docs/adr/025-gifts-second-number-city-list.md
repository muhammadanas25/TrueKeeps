# ADR 025: Gifts, a second number and a city list at checkout

- Status: accepted (owner chose canvas E3–E4 and E5–E6 on 2026-11-28)
- Design: canvas row E, https://claude.ai/artifact/Xg1UYLq7RQCXkoVJgpyWbA
- Migration: `0011_gift_orders` (additive: `orders.contact_name`, `orders.is_gift`)

## Context

Books are often bought for someone else: a couple, parents, grandparents.
The owner's Website Copy doc (section 4.8) already has the words:

- "Sending this as a gift?"
- "The parcel won't show any price. Just add their details."

The Policies page promises that gift parcels carry no price or invoice. The
wedding page held back its gift question until checkout could do this
(ADR 024).

The owner also asked for an optional second phone number and a city list,
with Karachi, Lahore and Islamabad at the top and an "other" choice for
smaller towns.

## Decisions

1. **One address, and a gift box first (E3–E4).** The owner compared two
   ways on the canvas:
   - every buyer gives their own address, then ticks "send it here"
   - one address, plus a gift tick box

   They chose the gift box, and placed it first in the delivery card, before
   anyone types. Unticked, the form is the same as before. Ticked, the buyer
   gives only their name and mobile ("Your details: for your order updates"),
   and the address fields become "Their details". Ticking moves whatever the
   buyer already typed into their own details, so nothing is typed twice.
   A gift recipient's address is not remembered as the buyer's address for
   next time.

2. **Where it's stored.** The order's `shipping_address` stays the delivery
   address (the recipient's, on a gift). The buyer goes into
   `contact_phone`, which already existed and is used for order updates,
   and the new `contact_name`. `is_gift` tells the people packing to leave
   out any price or invoice.
   - The admin console shows a red "GIFT" pill on the order and on the list.
   - Its "SHIP TO" box says it too.
   - The customer's order page says "Delivery, as a gift".

   Notification messages greet the buyer by `contact_name`, not the name on
   the address.

3. **A second number, optional.** `altPhone` sits in the delivery address
   ("Another number (optional)", "In case the courier can't reach the
   first"). Any phone is accepted, landlines included, 7 to 15 digits. It
   shows wherever the address does, for staff and customer.

4. **A city list, with "Other".** `shared/cities.ts` lists 95 main
   cities and towns, each with its province.
   - The list shows Karachi, Lahore and Islamabad first, then every city A
     to Z (the three again in their place).
   - "Other city or town" comes last. It opens a typed city and a province
     list.
   - Choosing a listed city fills in its province, so most customers answer
     one question instead of two.
   - The server still accepts any city name, so the list can grow without a
     deploy mismatch.
   - Delivery pricing is unchanged: Karachi by name is free, everywhere else
     Rs 200.

## Consequences

- Older orders have `contact_name` null; everything falls back to the
  address's name.
- Packing staff must honour the GIFT pill. Nothing prints an invoice into the
  parcel automatically today, so the instruction is the safeguard.
- Tests: `shared/checkout-gift.test.ts`.
