import { NavigationHeader } from "@/components/navigation-header";
import { HeroSection } from "@/components/hero-section";
import { PromotionalBanner } from "@/components/promotional-banner";
import { ProductCategories } from "@/components/product-categories";
import { ThemeSelector } from "@/components/theme-selector";
import { ProductShowcase } from "@/components/product-showcase";
import { QualitySection } from "@/components/quality-section";
import { Footer } from "@/components/footer";
import { MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <div className="min-h-screen bg-background">
      {/* Promotional Top Bar */}
      <div className="bg-accent text-accent-foreground py-2 px-4 text-center text-sm font-medium">
        <span className="hidden md:inline" data-testid="promo-text">
          Up to 50% off + an extra 10% off on the orders above $50 | 
        </span>
        <span className="font-semibold" data-testid="promo-code">
          Code: KEEPMEMORIES
        </span>
        <Button 
          size="sm"
          className="ml-4 bg-secondary text-secondary-foreground px-3 py-1 text-xs font-medium hover:opacity-90"
          data-testid="button-promo-apply"
        >
          Apply Code
        </Button>
      </div>

      <NavigationHeader />
      <HeroSection />
      <PromotionalBanner />
      <ProductCategories />
      <ThemeSelector />
      <ProductShowcase />
      <QualitySection />
      <Footer />

      {/* Chat Widget */}
      <div className="fixed bottom-6 right-6 z-50">
        <Button 
          className="bg-primary text-primary-foreground rounded-full w-14 h-14 shadow-lg hover:opacity-90"
          data-testid="button-chat"
        >
          <MessageCircle className="h-6 w-6" />
        </Button>
      </div>
    </div>
  );
}
