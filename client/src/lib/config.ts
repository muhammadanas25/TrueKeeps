export const UI_VERSION = (import.meta.env.VITE_UI_VERSION as string) || 'v2';
export const isV2 = UI_VERSION === 'v2';

// v2 TrueKeep brand colors (also defined in CSS, here for JS use)
export const brand = {
  cobalt:    '#1D4BA6',
  raspberry: '#D85365',
  cream:     '#EBEBD3',
  gunmetal:  '#3C3C3B',
  white:     '#FFFFFF',
} as const;

// Book size dimensions (inches)
export const BOOK_SIZES = {
  square_8x8:      { label: 'Square 8×8"',      ratio: 1,          price: 0 },
  landscape_11x8:  { label: 'Landscape 11×8.5"', ratio: 11 / 8.5,  price: 4 },
  portrait_8x10:   { label: 'Portrait 8×10"',    ratio: 8 / 10,    price: 2 },
  large_12x12:     { label: 'Large 12×12"',      ratio: 1,          price: 10 },
} as const;

export const PAGE_COUNTS = [20, 30, 40, 50] as const;

export const PAPER_FINISHES = {
  matte:   { label: 'Matte',   description: 'Elegant, no glare' },
  glossy:  { label: 'Glossy',  description: 'Vibrant colors' },
  linen:   { label: 'Linen',   description: 'Textured, premium' },
} as const;

export const BINDINGS = {
  softcover: { label: 'Softcover',        price: 0 },
  hardcover: { label: 'Hardcover +$8',    price: 8 },
  layflat:   { label: 'Layflat +$12',     price: 12 },
} as const;

export const BASE_PRICE = 19.99;
