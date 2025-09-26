import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useState } from "react";

const themeCategories = ["Travel", "Simple", "Family", "Wedding", "All"];

const themes = [
  {
    name: "Europe Travel",
    price: "$14.99",
    image: "https://images.unsplash.com/photo-1513581166391-887a96ddeafd?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=400&h=500",
    category: "Travel"
  },
  {
    name: "Minimalist Adventure",
    price: "$14.99",
    image: "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=400&h=500",
    category: "Travel"
  },
  {
    name: "Beach Getaway",
    price: "$14.99",
    image: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=400&h=500",
    category: "Travel"
  },
  {
    name: "Nature Explorer",
    price: "$14.99",
    image: "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=400&h=500",
    category: "Travel"
  },
  {
    name: "Urban Explorer",
    price: "$14.99",
    image: "https://images.unsplash.com/photo-1521017432531-fbd92d768814?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=400&h=500",
    category: "Travel"
  },
  {
    name: "Road Trip Adventures",
    price: "$14.99",
    image: "https://images.unsplash.com/photo-1449824913935-59a10b8d2000?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=400&h=500",
    category: "Travel"
  },
  {
    name: "Cultural Journey",
    price: "$14.99",
    image: "https://images.unsplash.com/photo-1566552881560-0be862a7c445?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=400&h=500",
    category: "Travel"
  },
  {
    name: "Seasonal Memories",
    price: "$14.99",
    image: "https://images.unsplash.com/photo-1518837695005-2083093ee35b?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=400&h=500",
    category: "Travel"
  }
];

export function ThemeSelector() {
  const [activeCategory, setActiveCategory] = useState("Travel");

  return (
    <section className="py-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <h2 className="text-3xl font-bold text-center mb-4" data-testid="text-theme-title">
          Pick the perfect theme for your keeps
        </h2>
        
        {/* Theme Filter Tabs */}
        <div className="flex justify-center mb-12">
          <div className="flex space-x-8 border-b border-border">
            {themeCategories.map((category) => (
              <button
                key={category}
                onClick={() => setActiveCategory(category)}
                className={`pb-2 font-medium transition-colors ${
                  activeCategory === category
                    ? "border-b-2 border-secondary text-secondary"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                data-testid={`button-theme-${category.toLowerCase()}`}
              >
                {category}
              </button>
            ))}
          </div>
        </div>

        {/* Theme Gallery Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {themes.map((theme, index) => (
            <Card 
              key={index}
              className="theme-card bg-card rounded-2xl overflow-hidden shadow-sm hover:shadow-lg cursor-pointer"
              data-testid={`card-theme-${index}`}
            >
              <img 
                src={theme.image}
                alt={theme.name}
                className="w-full h-64 object-cover"
                data-testid={`img-theme-${index}`}
              />
              <CardContent className="p-4">
                <h4 className="font-semibold mb-1" data-testid={`text-theme-name-${index}`}>
                  {theme.name}
                </h4>
                <p className="text-sm text-muted-foreground" data-testid={`text-theme-price-${index}`}>
                  Starting at {theme.price}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="text-center mt-12">
          <Button 
            size="lg"
            className="bg-primary text-primary-foreground px-8 py-3 font-semibold hover:opacity-90 mr-4"
            data-testid="button-explore-themes"
          >
            Explore travel themes
          </Button>
          <Button 
            variant="outline"
            size="lg"
            className="border border-border text-foreground px-8 py-3 font-semibold hover:bg-muted"
            data-testid="button-see-all-themes"
          >
            See all themes
          </Button>
        </div>
      </div>
    </section>
  );
}
