import { Button } from "@/components/ui/button";

export function HeroSection() {
  return (
    <section className="relative overflow-hidden">
      {/* Background Image */}
      <div 
        className="absolute inset-0 bg-cover bg-center"
        style={{
          backgroundImage: `url('https://images.unsplash.com/photo-1513475382585-d06e58bcb0e0?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=1920&h=1080')`
        }}
      />
      {/* Gradient Overlay */}
      <div className="hero-bg absolute inset-0"></div>
      
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 lg:py-32">
        <div className="text-center text-white">
          <h1 className="text-4xl md:text-6xl font-bold mb-6" data-testid="text-hero-title">
            pick the perfect theme
          </h1>
          <p className="text-xl md:text-2xl mb-8 opacity-90" data-testid="text-hero-subtitle">
            Transform your digital memories into timeless keepsakes
          </p>
          <Button 
            size="lg"
            className="bg-secondary text-secondary-foreground px-8 py-4 text-lg font-semibold hover:opacity-90 transform hover:scale-105 transition-all"
            data-testid="button-create-photobook"
          >
            Create your photo book
          </Button>
        </div>
      </div>
    </section>
  );
}
