import { Facebook, Instagram, Twitter } from "lucide-react";

const footerSections = [
  {
    title: "Products",
    links: [
      { name: "Photo Books", href: "#" },
      { name: "Wedding Albums", href: "#" },
      { name: "Canvas Prints", href: "#" },
      { name: "Photo Frames", href: "#" }
    ]
  },
  {
    title: "Support",
    links: [
      { name: "Help Center", href: "#" },
      { name: "Contact Us", href: "#" },
      { name: "Shipping Info", href: "#" },
      { name: "Returns", href: "#" }
    ]
  },
  {
    title: "Company",
    links: [
      { name: "About Us", href: "#" },
      { name: "Privacy Policy", href: "#" },
      { name: "Terms of Service", href: "#" },
      { name: "Careers", href: "#" }
    ]
  }
];

export function Footer() {
  return (
    <footer className="bg-card border-t border-border py-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Brand Section */}
          <div>
            <div className="gradient-text text-2xl font-bold mb-4" data-testid="footer-logo">
              truekeeps.
            </div>
            <p className="text-muted-foreground mb-4" data-testid="footer-description">
              Preserving your digital memories into timeless physical keepsakes.
            </p>
            <div className="flex space-x-4">
              <Facebook 
                className="h-5 w-5 text-muted-foreground hover:text-primary cursor-pointer transition-colors" 
                data-testid="social-facebook"
              />
              <Instagram 
                className="h-5 w-5 text-muted-foreground hover:text-primary cursor-pointer transition-colors" 
                data-testid="social-instagram"
              />
              <Twitter 
                className="h-5 w-5 text-muted-foreground hover:text-primary cursor-pointer transition-colors" 
                data-testid="social-twitter"
              />
            </div>
          </div>
          
          {/* Footer Sections */}
          {footerSections.map((section, sectionIndex) => (
            <div key={sectionIndex}>
              <h4 className="font-semibold mb-4" data-testid={`footer-title-${sectionIndex}`}>
                {section.title}
              </h4>
              <ul className="space-y-2 text-muted-foreground">
                {section.links.map((link, linkIndex) => (
                  <li key={linkIndex}>
                    <a 
                      href={link.href} 
                      className="hover:text-primary transition-colors"
                      data-testid={`footer-link-${sectionIndex}-${linkIndex}`}
                    >
                      {link.name}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        
        <div className="border-t border-border mt-12 pt-8 text-center text-muted-foreground">
          <p data-testid="footer-copyright">
            &copy; 2024 TrueKeeps. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
