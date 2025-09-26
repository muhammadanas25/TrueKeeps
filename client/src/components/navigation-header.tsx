import { Search, ShoppingCart, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState } from "react";

export function NavigationHeader() {
  const [searchQuery, setSearchQuery] = useState("");

  return (
    <header className="bg-card border-b border-border sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo */}
          <div className="flex items-center">
            <div className="gradient-text text-2xl font-bold" data-testid="logo">
              truekeeps.
            </div>
          </div>

          {/* Search Bar */}
          <div className="hidden md:flex flex-1 max-w-lg mx-8">
            <div className="relative w-full">
              <Input
                type="text"
                placeholder="Search for products"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-border rounded-lg focus:ring-2 focus:ring-ring focus:border-transparent"
                data-testid="input-search"
              />
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="hidden lg:flex items-center space-x-8">
            <a 
              href="#photobooks" 
              className="text-foreground hover:text-primary font-medium transition-colors"
              data-testid="link-photobooks"
            >
              PhotoBooks
            </a>
            <a 
              href="#wedding" 
              className="text-foreground hover:text-primary font-medium transition-colors"
              data-testid="link-wedding"
            >
              Wedding
            </a>
            <a 
              href="#deals" 
              className="text-foreground hover:text-primary font-medium transition-colors"
              data-testid="link-deals"
            >
              Deals
            </a>
          </nav>

          {/* User Actions */}
          <div className="flex items-center space-x-4">
            <Button 
              variant="ghost" 
              className="text-muted-foreground hover:text-primary"
              data-testid="button-login"
            >
              Login
            </Button>
            <Button 
              className="bg-primary text-primary-foreground hover:opacity-90"
              data-testid="button-signup"
            >
              Sign Up
            </Button>
            <Button 
              variant="ghost" 
              className="text-muted-foreground hover:text-primary relative p-2"
              data-testid="button-cart"
            >
              <ShoppingCart className="h-5 w-5" />
              <span className="absolute -top-1 -right-1 bg-secondary text-secondary-foreground text-xs rounded-full h-5 w-5 flex items-center justify-center">
                2
              </span>
            </Button>
            <Button 
              variant="ghost" 
              className="lg:hidden"
              data-testid="button-menu"
            >
              <Menu className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </div>
    </header>
  );
}
