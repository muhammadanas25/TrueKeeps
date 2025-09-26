import { Card, CardContent } from "@/components/ui/card";

const products = [
  {
    name: "Canvas Prints",
    image: "https://images.unsplash.com/photo-1513475382585-d06e58bcb0e0?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=400&h=300",
    alt: "Canvas Prints"
  },
  {
    name: "Photo Frames",
    image: "https://images.unsplash.com/photo-1586023492125-27b2c045efd7?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=400&h=300",
    alt: "Photo Frames"
  },
  {
    name: "Metal Prints",
    image: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=400&h=300",
    alt: "Metal Prints"
  },
  {
    name: "Acrylic Prints",
    image: "https://images.unsplash.com/photo-1578662996442-48f60103fc96?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=400&h=300",
    alt: "Acrylic Prints"
  }
];

export function ProductShowcase() {
  return (
    <section className="py-16 bg-muted">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <h2 className="text-3xl font-bold text-center mb-4" data-testid="text-showcase-title">
          One photo. Endless joy.
        </h2>
        <p className="text-xl text-center text-muted-foreground mb-12" data-testid="text-showcase-subtitle">
          Turn any pic into the sweetest gift.
        </p>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {products.map((product, index) => (
            <Card 
              key={index}
              className="product-card bg-card rounded-2xl overflow-hidden shadow-sm hover:shadow-lg cursor-pointer"
              data-testid={`card-product-${index}`}
            >
              <img 
                src={product.image}
                alt={product.alt}
                className="w-full h-48 object-cover"
                data-testid={`img-product-${index}`}
              />
              <CardContent className="p-4">
                <h4 className="font-semibold text-lg" data-testid={`text-product-name-${index}`}>
                  {product.name}
                </h4>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
