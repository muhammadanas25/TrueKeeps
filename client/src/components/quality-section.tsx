import { Star } from "lucide-react";

export function QualitySection() {
  return (
    <section className="py-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-gradient-to-r from-primary to-secondary rounded-3xl p-12 text-white text-center">
          <h2 className="text-4xl font-bold mb-6" data-testid="text-quality-title">
            We wrote the book on quality
          </h2>
          <p className="text-xl mb-8 opacity-90" data-testid="text-quality-quote">
            "The finish is so excellent, you feel like you've created a work of art."
          </p>
          <div className="flex justify-center items-center space-x-8">
            <div className="flex items-center space-x-2" data-testid="rating-stars">
              {[1, 2, 3, 4, 5].map((star) => (
                <Star 
                  key={star} 
                  className="h-5 w-5 fill-current text-yellow-300" 
                  data-testid={`star-${star}`}
                />
              ))}
              <span className="ml-2 font-medium" data-testid="text-reviews-count">
                43K+ rave reviews
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
