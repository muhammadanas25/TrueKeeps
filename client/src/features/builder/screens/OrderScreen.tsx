/**
 * OrderScreen + ConfirmScreen — the checkout beat.
 *
 * Ported from `book_builder/screens3.jsx`. Pricing is intentionally in
 * one place (binding price × qty, free shipping ≥ $50) so the future
 * server-side order flow (roadmap Phase 2) replaces one function, not
 * scattered UI math. "Place my order" currently just advances to the
 * confirm screen — there is no payment yet, and the confirm copy makes
 * no shipping promises beyond what the flow actually does.
 */

import { ArrowRight, BookOpen, Check, Minus, Plus, Truck } from "lucide-react";
import { MiniBook } from "../book";
import { BINDINGS, occasionById, themeById, type CopyVoice } from "../data";
import type { BuilderState } from "../state";

export function OrderScreen({
  state,
  set,
  copy,
  onPlace,
  onBack,
}: {
  state: BuilderState;
  set: (patch: Partial<BuilderState>) => void;
  copy: CopyVoice;
  onPlace: () => void;
  onBack: () => void;
}) {
  const occ = occasionById(state.occasion);
  const theme = themeById(state.themeId);
  const binding = BINDINGS.find((b) => b.id === state.binding) ?? BINDINGS[1];
  const subtotal = binding.price * state.qty;
  const freeShip = subtotal >= 50;
  const shipping = freeShip ? 0 : 4.99;

  return (
    <div className="bb-screen bb-order">
      <div className="bb-order-inner">
        <div style={{ textAlign: "center" }}>
          <div className="bb-kicker">Last step</div>
          <h1>{copy.orderTitle}</h1>
          <p className="bb-sub">{copy.orderSub}</p>
        </div>

        <div className="bb-order-card">
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 18 }}>
            <MiniBook theme={theme} coverStyle={state.coverStyle} title={state.title} occasion={occ} photos={state.photos} size={200} />
            <button className="bb-btn bb-btn-ghost" onClick={onBack}>
              <BookOpen size={15} /> Flip through it again
            </button>
          </div>

          <div className="bb-order-specs">
            <div className="bb-spec-row">
              <b>Book</b>
              <span style={{ fontFamily: "var(--font-display)", fontWeight: 600 }}>{state.title}</span>
            </div>
            <div className="bb-spec-row">
              <b>Details</b>
              <span>8×8 in · {state.pages.length} pages · matte paper · {theme.name}</span>
            </div>
            <div>
              <div className="bb-panel-label" style={{ marginBottom: 8 }}>
                Binding
              </div>
              <div className="bb-bindings">
                {BINDINGS.map((b) => (
                  <button key={b.id} className={"bb-binding" + (state.binding === b.id ? " on" : "")} onClick={() => set({ binding: b.id })}>
                    <b>{b.name}</b>
                    <i>${b.price}</i>
                  </button>
                ))}
              </div>
            </div>
            <div className="bb-spec-row" style={{ alignItems: "center" }}>
              <b>Quantity</b>
              <div className="bb-qty">
                <button onClick={() => set({ qty: Math.max(1, state.qty - 1) })} aria-label="Fewer">
                  <Minus size={15} />
                </button>
                <span>{state.qty}</span>
                <button onClick={() => set({ qty: Math.min(20, state.qty + 1) })} aria-label="More">
                  <Plus size={15} />
                </button>
              </div>
            </div>
            <div className="bb-price-rows">
              <div className="bb-spec-row">
                <b>Subtotal</b>
                <span>${subtotal.toFixed(2)}</span>
              </div>
              <div className="bb-spec-row">
                <b>Shipping</b>
                <span>{freeShip ? "Free" : "$" + shipping.toFixed(2)}</span>
              </div>
              {!freeShip ? (
                <span className="bb-free-ship">
                  <Truck size={14} /> Free shipping on orders over $50
                </span>
              ) : null}
              <div className="bb-spec-row total">
                <span>Total</span>
                <span>${(subtotal + shipping).toFixed(2)}</span>
              </div>
            </div>
            <button className="bb-btn bb-btn-primary bb-btn-lg" onClick={onPlace}>
              {copy.placeOrder} <ArrowRight size={17} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ConfirmScreen({ copy, onRestart, onBack }: { copy: CopyVoice; onRestart: () => void; onBack: () => void }) {
  return (
    <div className="bb-screen bb-confirm">
      <div className="bb-confirm-badge">
        <Check size={40} strokeWidth={2.5} />
      </div>
      <h1>{copy.confirmTitle}</h1>
      <p>{copy.confirmSub}</p>
      <div style={{ display: "flex", gap: 12, marginTop: 22 }}>
        <button className="bb-btn bb-btn-secondary" onClick={onBack}>
          <BookOpen size={16} /> See my book
        </button>
        <button className="bb-btn bb-btn-primary" onClick={onRestart}>
          <Plus size={16} /> Start another book
        </button>
      </div>
    </div>
  );
}
