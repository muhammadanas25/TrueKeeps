# ADR 025: Customer messages sent by hand (WhatsApp, copy, email)

- Status: accepted (owner approved canvas M1–M5 on 2026-11-28: "good lets add and deploy")
- Design: https://claude.ai/artifact/XXfF3WgpgtvsqKngGnxjnT
- Migration: `0012_order_messages` (one new table)

## Context

The WhatsApp Cloud API isn't connected yet (Meta verification and template
approval are pending), so customer WhatsApp messages go out by hand. The
owner sent the three messages the team uses (order confirmed, shipped with
TCS tracking, review request) and asked for them to be ready on every order,
with a button that opens WhatsApp to that customer, a copy button and an
email option. They also asked for a fourth: "order received, bank transfer
pending", to remind customers who closed the page and missed the
instructions.

## Decision

- **Words:** the owner's text, kept exactly (emoji included), is the default
  in `shared/messages.ts`. The bank reminder was written in the same style.
  The owner edits all four in Admin › Notifications › Customer messages
  (stored in `app_settings.customer_messages`, falling back per message).
- **Fill-ins:** [Name] (first name on the delivery address), [Order ID],
  [Amount], [Bank details], [Pay by] (the day an unpaid bank order is
  released), [Our WhatsApp], [Courier] (TCS when empty), [Tracking ID],
  [Tracking link] (TCS's page, or the customer's order page for another
  courier), [Review link]. A missing tracking number stays as [Tracking ID],
  so nobody sends a half-filled message by mistake.
- **Sending:** the server builds a `wa.me/92…?text=` link and a `mailto:` link
  per message, so the order page, the Overview and the alert email send the
  same words. Tapping WhatsApp or Email marks the message sent
  (`order_messages`, one row per order and message, first send kept, Undo
  deletes it). Copy doesn't mark it; "Mark sent" covers messages sent some
  other way. Each send is audited and shown on the admin timeline.
- **When due:** bank reminder while a bank-transfer order is unpaid (listed on
  the Overview after 24 hours); confirmed when paid; shipped when marked
  shipped; review 3 days after delivery. The Overview's "Messages to send"
  covers recent live orders only (paid in 7 days, shipped in 14, delivered
  3–14 days), so switching this on doesn't list every old order.
- **New-order alert:** the staff "New order" email carries "Send confirmation
  on WhatsApp", which opens WhatsApp to the customer with the confirmation
  typed in.

Also fixed while here: the customer's order page received every timeline
event with its note, so staff notes ("customers never see it"), affiliate
changes and payment-mismatch details reached the customer. The customer API
now returns only order placed, status changes and declined payments, with no
notes.

## Alternatives considered

- **Wait for the WhatsApp API:** blocked on Meta; messages are needed now. The
  same templates can feed the automatic sends later.
- **Detect whether WhatsApp was actually sent:** impossible from a `wa.me`
  link. Tapping counts as sent, with Undo, which matches how the team works.
- **Store sends in `order_events`:** the customer sees that table, so a
  separate table keeps it private.
