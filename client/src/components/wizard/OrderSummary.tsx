import { useState } from "react";
import { Minus, Plus, Package, Truck, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { WizardState } from "@/lib/wizard-types";
import { BASE_PRICE, BOOK_SIZES, BINDINGS } from "@/lib/config";
import { useToast } from "@/hooks/use-toast";

interface Props {
  state: WizardState;
}

export function OrderSummary({ state }: Props) {
  const [qty, setQty] = useState(1);
  const { toast }     = useToast();

  const s = state.bookSettings;
  const unitPrice =
    BASE_PRICE +
    BOOK_SIZES[s.size].price +
    BINDINGS[s.binding].price +
    Math.max(0, (s.pageCount - 20) / 10) * 2;

  const shipping  = qty >= 2 ? 0 : 4.99;
  const subtotal  = unitPrice * qty;
  const total     = subtotal + shipping;

  const frontPhoto = state.photos[state.frontCoverPhotoIndex]?.dataUrl;

  const handleCheckout = () => {
    toast({
      title: "Order placed",
      description: "We'll send you a confirmation email with your order details.",
    });
  };

  return (
    <div className="max-w-2xl mx-auto w-full space-y-6">
      <div className="text-center">
        <h2 className="text-3xl font-bold mb-2" style={{ fontFamily: "var(--font-display)", color: "#3C3C3B" }}>
          Your Book is Ready
        </h2>
        <p className="text-sm" style={{ color: "#6b6b69" }}>Review your order before checking out.</p>
      </div>

      {/* Book preview card */}
      <div
        className="rounded-3xl p-6 flex gap-6 items-start"
        style={{ background: "#EBEBD3", border: "1px solid #d8d5c5" }}
      >
        {/* Cover thumbnail */}
        <div
          className="shrink-0 rounded-xl overflow-hidden shadow-md"
          style={{ width: 96, aspectRatio: "3/4", background: "#1D4BA6" }}
        >
          {frontPhoto ? (
            <img src={frontPhoto} alt="Cover" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <p className="text-white/50 text-xs text-center px-2" style={{ fontFamily: "var(--font-display)" }}>
                {state.bookTitle || s.name}
              </p>
            </div>
          )}
        </div>

        <div className="flex-1">
          <h3 className="font-bold text-lg mb-1" style={{ fontFamily: "var(--font-display)", color: "#3C3C3B" }}>
            {state.bookTitle || s.name || "My Photo Book"}
          </h3>
          <div className="space-y-1 text-sm" style={{ color: "#6b6b69" }}>
            <p>{BOOK_SIZES[s.size].label}</p>
            <p>{s.pageCount} pages · {s.paperFinish.charAt(0).toUpperCase() + s.paperFinish.slice(1)} paper</p>
            <p>{BINDINGS[s.binding].label.replace(/ \+\$\d+/, "")}</p>
            {state.themeName && <p>Theme: {state.themeName}</p>}
          </div>
        </div>

        <p className="text-xl font-bold shrink-0" style={{ color: "#1D4BA6", fontFamily: "var(--font-display)" }}>
          ${unitPrice.toFixed(2)}
        </p>
      </div>

      {/* Quantity */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold" style={{ color: "#3C3C3B" }}>Quantity</span>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setQty(Math.max(1, qty - 1))}
            className="w-9 h-9 rounded-full border flex items-center justify-center transition-colors hover:border-blue-500"
            style={{ borderColor: "#d8d5c5" }}
          >
            <Minus className="w-4 h-4" style={{ color: "#3C3C3B" }} />
          </button>
          <span className="text-lg font-bold w-8 text-center" style={{ color: "#3C3C3B" }}>{qty}</span>
          <button
            type="button"
            onClick={() => setQty(qty + 1)}
            className="w-9 h-9 rounded-full border flex items-center justify-center transition-colors hover:border-blue-500"
            style={{ borderColor: "#d8d5c5" }}
          >
            <Plus className="w-4 h-4" style={{ color: "#3C3C3B" }} />
          </button>
        </div>
      </div>

      {/* Price breakdown */}
      <div
        className="rounded-2xl divide-y overflow-hidden"
        style={{ border: "1px solid #d8d5c5" }}
      >
        <div className="flex justify-between px-5 py-3 text-sm" style={{ color: "#6b6b69" }}>
          <span>Subtotal ({qty} × ${unitPrice.toFixed(2)})</span>
          <span>${subtotal.toFixed(2)}</span>
        </div>
        <div className="flex justify-between px-5 py-3 text-sm" style={{ color: "#6b6b69" }}>
          <span>Shipping</span>
          <span>{shipping === 0 ? <span style={{ color: "#1D4BA6", fontWeight: 600 }}>Free</span> : `$${shipping.toFixed(2)}`}</span>
        </div>
        <div
          className="flex justify-between px-5 py-4 font-bold"
          style={{ background: "rgba(29,75,166,0.04)", color: "#3C3C3B" }}
        >
          <span style={{ fontFamily: "var(--font-display)" }}>Total</span>
          <span className="text-xl" style={{ fontFamily: "var(--font-display)", color: "#1D4BA6" }}>
            ${total.toFixed(2)}
          </span>
        </div>
      </div>

      {qty === 1 && (
        <p className="text-xs text-center" style={{ color: "#9b9b97" }}>
          Order 2+ books for free shipping
        </p>
      )}

      {/* Trust signals */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { icon: Package,  text: "Print quality guaranteed" },
          { icon: Truck,    text: "Delivered in 5–7 days" },
          { icon: Shield,   text: "Secure checkout" },
        ].map(({ icon: Icon, text }) => (
          <div key={text} className="flex flex-col items-center gap-2 text-center p-3 rounded-xl" style={{ background: "#F4F2E8" }}>
            <Icon className="w-5 h-5" style={{ color: "#1D4BA6" }} />
            <p className="text-xs" style={{ color: "#6b6b69" }}>{text}</p>
          </div>
        ))}
      </div>

      {/* CTA */}
      <button
        type="button"
        onClick={handleCheckout}
        className="w-full py-4 rounded-2xl text-white font-bold text-base transition-all hover:opacity-90 active:scale-[0.98]"
        style={{ background: "#D85365", fontFamily: "var(--font-display)" }}
      >
        Proceed to Checkout →
      </button>
    </div>
  );
}
