import { Card, CardContent } from "@/components/ui/card";

const categories = [
  {
    name: "PhotoBooks",
    image: "https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=400&h=300",
    alt: "Photo Books Collection"
  },
  {
    name: "Wedding",
    image: "https://images.unsplash.com/photo-1583939003579-730e3918a45a?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=400&h=300",
    alt: "Wedding Albums"
  },
  {
    name: "PhotoBooks",
    image: "https://images.unsplash.com/photo-1586023492125-27b2c045efd7?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=400&h=300",
    alt: "Photo Frames"
  },
  {
    name: "Deals",
    image: "https://images.unsplash.com/photo-1549465220-1a8b9238cd48?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=400&h=300",
    alt: "Special Deals"
  }
];

export function ProductCategories() {
  return (
    <section className="py-16 bg-muted">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <h2 className="text-3xl font-bold text-center mb-12" data-testid="text-categories-title">
          More ways to Truekeep
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          {categories.map((category, index) => (
            <Card 
              key={index}
              className="product-card bg-card rounded-2xl shadow-sm hover:shadow-md transition-all cursor-pointer"
              data-testid={`card-category-${index}`}
            >
              <CardContent className="p-6 text-center">
                <img 
                  src={category.image}
                  alt={category.alt}
                  className="w-full h-32 object-cover rounded-xl mb-4"
                  data-testid={`img-category-${index}`}
                />
                <h3 className="text-lg font-semibold" data-testid={`text-category-name-${index}`}>
                  {category.name}
                </h3>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
