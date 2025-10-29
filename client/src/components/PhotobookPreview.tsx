import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import type { PagePhoto, ProjectPage, UploadedPhoto } from "@shared/schema";

interface PhotobookPreviewProps {
  pages: ProjectPage[];
  placedPhotos: Record<string, PagePhoto[]>;
  onClose: () => void;
  themeName?: string;
}

export function PhotobookPreview({
  pages,
  placedPhotos,
  onClose,
  themeName = "Your Photobook",
}: PhotobookPreviewProps) {
  const [currentSpread, setCurrentSpread] = useState(0);
  const [isFlipping, setIsFlipping] = useState(false);

  const totalSpreads = Math.ceil(pages.length / 2);

  const handleNextSpread = () => {
    if (currentSpread < totalSpreads - 1 && !isFlipping) {
      setIsFlipping(true);
      setTimeout(() => {
        setCurrentSpread(prev => prev + 1);
        setIsFlipping(false);
      }, 600);
    }
  };

  const handlePrevSpread = () => {
    if (currentSpread > 0 && !isFlipping) {
      setIsFlipping(true);
      setTimeout(() => {
        setCurrentSpread(prev => prev - 1);
        setIsFlipping(false);
      }, 600);
    }
  };

  const leftPage = pages[currentSpread * 2];
  const rightPage = pages[currentSpread * 2 + 1];

  return (
    <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center">
      {/* Close button */}
      <Button
        variant="ghost"
        size="icon"
        className="absolute top-4 right-4 text-white hover:bg-white/20"
        onClick={onClose}
        data-testid="button-close-preview"
      >
        <X className="h-6 w-6" />
      </Button>

      {/* Navigation */}
      <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 flex items-center gap-4">
        <Button
          variant="secondary"
          size="icon"
          onClick={handlePrevSpread}
          disabled={currentSpread === 0 || isFlipping}
          data-testid="button-prev-spread"
        >
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <div className="text-white text-sm">
          Pages {currentSpread * 2 + 1}-{Math.min(currentSpread * 2 + 2, pages.length)} of {pages.length}
        </div>
        <Button
          variant="secondary"
          size="icon"
          onClick={handleNextSpread}
          disabled={currentSpread === totalSpreads - 1 || isFlipping}
          data-testid="button-next-spread"
        >
          <ChevronRight className="h-5 w-5" />
        </Button>
      </div>

      {/* 3D Book Container */}
      <div className="perspective-container">
        <div 
          className={`photobook ${isFlipping ? 'flipping' : ''}`}
          style={{
            transform: 'rotateY(-15deg) rotateX(5deg)',
            transformStyle: 'preserve-3d',
          }}
        >
          {/* Book spine/binding */}
          <div 
            className="book-spine"
            style={{
              position: 'absolute',
              left: '50%',
              top: 0,
              bottom: 0,
              width: '40px',
              transform: 'translateX(-50%) translateZ(-20px)',
              background: 'linear-gradient(to right, #2a2a2a, #1a1a1a, #2a2a2a)',
              borderRadius: '4px 0 0 4px',
            }}
          />

          {/* Left Page */}
          {leftPage && (
            <div
              className="book-page left-page"
              style={{
                position: 'absolute',
                right: '50%',
                width: '400px',
                height: '550px',
                background: 'white',
                boxShadow: '-5px 5px 20px rgba(0,0,0,0.3)',
                transformOrigin: 'right center',
                transform: 'translateZ(0px)',
                padding: '20px',
              }}
              data-testid={`preview-page-${leftPage.pageNumber}`}
            >
              <div className="relative w-full h-full">
                {placedPhotos[leftPage.id]?.map((photo) => (
                  <div
                    key={photo.id}
                    className="absolute"
                    style={{
                      left: `${(photo.x / 800) * 100}%`,
                      top: `${(photo.y / 1100) * 100}%`,
                      width: `${(photo.width / 800) * 100}%`,
                      height: `${(photo.height / 1100) * 100}%`,
                      transform: `rotate(${photo.rotation}deg)`,
                      zIndex: photo.zIndex,
                    }}
                  >
                    <img
                      src={photo.photoUrl}
                      alt="Placed photo"
                      className="w-full h-full object-cover rounded shadow-md"
                    />
                  </div>
                ))}
                {(!placedPhotos[leftPage.id] || placedPhotos[leftPage.id].length === 0) && (
                  <div className="w-full h-full flex items-center justify-center text-muted-foreground text-sm">
                    Page {leftPage.pageNumber}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Right Page */}
          {rightPage && (
            <div
              className="book-page right-page"
              style={{
                position: 'absolute',
                left: '50%',
                width: '400px',
                height: '550px',
                background: 'white',
                boxShadow: '5px 5px 20px rgba(0,0,0,0.3)',
                transformOrigin: 'left center',
                transform: 'translateZ(0px)',
                padding: '20px',
              }}
              data-testid={`preview-page-${rightPage.pageNumber}`}
            >
              <div className="relative w-full h-full">
                {placedPhotos[rightPage.id]?.map((photo) => (
                  <div
                    key={photo.id}
                    className="absolute"
                    style={{
                      left: `${(photo.x / 800) * 100}%`,
                      top: `${(photo.y / 1100) * 100}%`,
                      width: `${(photo.width / 800) * 100}%`,
                      height: `${(photo.height / 1100) * 100}%`,
                      transform: `rotate(${photo.rotation}deg)`,
                      zIndex: photo.zIndex,
                    }}
                  >
                    <img
                      src={photo.photoUrl}
                      alt="Placed photo"
                      className="w-full h-full object-cover rounded shadow-md"
                    />
                  </div>
                ))}
                {(!placedPhotos[rightPage.id] || placedPhotos[rightPage.id].length === 0) && (
                  <div className="w-full h-full flex items-center justify-center text-muted-foreground text-sm">
                    Page {rightPage.pageNumber}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Book shadow */}
          <div
            className="book-shadow"
            style={{
              position: 'absolute',
              left: '-10%',
              right: '-10%',
              bottom: '-100px',
              height: '100px',
              background: 'radial-gradient(ellipse at center, rgba(0,0,0,0.4) 0%, transparent 70%)',
              transform: 'translateZ(-50px)',
              filter: 'blur(20px)',
            }}
          />
        </div>
      </div>

      <style>{`
        .perspective-container {
          perspective: 2000px;
          perspective-origin: center center;
        }

        .photobook {
          position: relative;
          width: 840px;
          height: 550px;
          transform-style: preserve-3d;
          transition: transform 0.6s ease-in-out;
        }

        .photobook.flipping {
          animation: flip 0.6s ease-in-out;
        }

        @keyframes flip {
          0% {
            transform: rotateY(-15deg) rotateX(5deg);
          }
          50% {
            transform: rotateY(-25deg) rotateX(8deg) scale(0.95);
          }
          100% {
            transform: rotateY(-15deg) rotateX(5deg);
          }
        }

        .book-page {
          border: 1px solid #e0e0e0;
          border-radius: 2px;
        }
      `}</style>
    </div>
  );
}
