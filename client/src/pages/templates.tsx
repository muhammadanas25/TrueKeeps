import { NavigationHeader } from "@/components/navigation-header";
import { Footer } from "@/components/footer";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "wouter";
import type { Theme } from "@shared/schema";
import { Loader2, Star, BookOpen } from "lucide-react";

const themeCategories = ["All", "Travel", "Simple", "Family", "Wedding", "Baby"];

export default function Templates() {
  const [activeCategory, setActiveCategory] = useState("All");

  const { data: themes, isLoading } = useQuery<Theme[]>({
    queryKey: activeCategory === "All" ? ["/api/themes"] : ["/api/themes", activeCategory],
    queryFn: async () => {
      const url = activeCategory === "All" 
        ? "/api/themes" 
        : `/api/themes?category=${activeCategory}`;
      const response = await fetch(url);
      if (!response.ok) throw new Error("Failed to fetch themes");
      return response.json();
    },
  });

  return (
    <div className="min-h-screen bg-background">
      <NavigationHeader />
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="text-center mb-12">
          <h1 className="text-4xl md:text-5xl font-bold mb-4" data-testid="text-page-title">
            Pick the perfect theme for your story
          </h1>
          <p className="text-xl text-muted-foreground mb-8" data-testid="text-page-subtitle">
            Choose from our curated collection of professionally designed templates
          </p>
        </div>

        {/* Theme Filter Tabs */}
        <div className="flex justify-center mb-12">
          <div className="inline-flex space-x-2 bg-muted p-2 rounded-lg">
            {themeCategories.map((category) => (
              <Button
                key={category}
                variant={activeCategory === category ? "default" : "ghost"}
                onClick={() => setActiveCategory(category)}
                className={`px-6 ${
                  activeCategory === category
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-background"
                }`}
                data-testid={`button-filter-${category.toLowerCase()}`}
              >
                {category}
              </Button>
            ))}
          </div>
        </div>

        {/* Loading State */}
        {isLoading && (
          <div className="flex justify-center items-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        )}

        {/* Theme Gallery Grid */}
        {!isLoading && themes && (
          <div>
            <div className="flex justify-between items-center mb-6">
              <p className="text-sm text-muted-foreground" data-testid="text-theme-count">
                {themes.length} themes
              </p>
              <Button 
                variant="outline"
                className="gap-2"
                data-testid="button-favorites"
              >
                <Star className="h-4 w-4" />
                Favorites
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {themes.map((theme) => (
                <Card 
                  key={theme.id}
                  className="group relative overflow-hidden rounded-2xl shadow-sm hover:shadow-lg transition-all cursor-pointer"
                  data-testid={`card-theme-${theme.id}`}
                >
                  {/* Theme Preview Image */}
                  <div className="relative aspect-[3/4] overflow-hidden bg-muted">
                    <img 
                      src={theme.imageUrl || ""}
                      alt={theme.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      data-testid={`img-theme-${theme.id}`}
                    />
                    
                    {/* Overlay on Hover */}
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                      <Link href={`/create?themeId=${theme.id}`}>
                        <Button 
                          className="bg-white text-foreground hover:bg-white/90"
                          data-testid={`button-start-designing-${theme.id}`}
                        >
                          <BookOpen className="h-4 w-4 mr-2" />
                          Start Designing
                        </Button>
                      </Link>
                      <Button 
                        variant="outline"
                        className="bg-white/20 backdrop-blur-sm text-white border-white hover:bg-white/30"
                        data-testid={`button-quick-preview-${theme.id}`}
                      >
                        Quick Preview
                      </Button>
                    </div>

                    {/* Category Badge */}
                    <Badge 
                      className="absolute top-3 right-3 bg-secondary text-secondary-foreground"
                      data-testid={`badge-category-${theme.id}`}
                    >
                      {theme.category}
                    </Badge>
                  </div>

                  {/* Theme Info */}
                  <CardContent className="p-4">
                    <h3 className="font-semibold mb-2 text-lg" data-testid={`text-theme-name-${theme.id}`}>
                      {theme.name}
                    </h3>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-muted-foreground" data-testid={`text-page-count-${theme.id}`}>
                        {theme.pageCount} pages included
                      </span>
                      <span className="font-semibold text-primary" data-testid={`text-price-${theme.id}`}>
                        Starting at ${theme.price}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {themes.length === 0 && (
              <div className="text-center py-20">
                <p className="text-muted-foreground" data-testid="text-no-themes">
                  No themes found in this category.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Bottom CTA */}
        <div className="mt-16 bg-gradient-to-r from-primary to-secondary rounded-3xl p-12 text-white text-center">
          <h2 className="text-3xl font-bold mb-4">Can't find the perfect theme?</h2>
          <p className="text-xl mb-6 opacity-90">
            Start with a blank canvas and create your own unique design
          </p>
          <Link href="/create">
            <Button 
              size="lg"
              className="bg-white text-foreground hover:bg-white/90 px-8 py-3 font-semibold"
              data-testid="button-start-blank"
            >
              Start with Blank Canvas
            </Button>
          </Link>
        </div>
      </div>

      <Footer />
    </div>
  );
}
