import { Button } from "@/components/ui/button";

export function PromotionalBanner() {
  return (
    <section className="bg-gradient-to-r from-accent to-secondary py-6">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row items-center justify-between">
          <div className="text-accent-foreground mb-4 md:mb-0">
            <h3 className="text-2xl font-bold" data-testid="text-sale-title">
              Mother's Day Sale
            </h3>
            <p className="text-lg" data-testid="text-sale-description">
              Up to 50% off on the orders above 3500
            </p>
            <span className="text-sm opacity-75" data-testid="text-sale-tagline">
              keeping memories alive
            </span>
          </div>
          <Button 
            className="bg-secondary text-secondary-foreground px-6 py-3 font-semibold hover:opacity-90"
            data-testid="button-apply-code"
          >
            Apply Code
          </Button>
        </div>
      </div>
    </section>
  );
}
