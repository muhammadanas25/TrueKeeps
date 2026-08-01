# TrueKeep — Product Design Specification
**Version:** 2.0
**Tagline:** Beautiful quality, for beautiful moments.
**Status:** Draft for implementation

---

## 1. Brand System

### 1.1 Version Toggle
The app supports two UI themes toggled via `VITE_UI_VERSION` env variable (`v1` | `v2`).
- `v1` = current Replit-generated design (Outfit font, existing blue/pink palette)
- `v2` = new brand identity from design PDF

### 1.2 v2 Color Palette
| Token | Name | Hex | Usage |
|---|---|---|---|
| `--color-primary` | Cobalt Blue | `#1D4BA6` | CTA buttons, headers, active states |
| `--color-accent` | Razormarazz | `#D85365` | Secondary CTA, highlights, badges |
| `--color-cream` | Napolitano | `#EBEBD3` | Page backgrounds, card fills |
| `--color-dark` | Gunmetal | `#3C3C3B` | Body text, borders, icons |
| `--color-white` | White | `#FFFFFF` | Surface, modals |

### 1.3 v2 Typography
| Role | Font | Weight | Size |
|---|---|---|---|
| Display / H1 | Clash Display | SemiBold | 48–64px |
| H2 / Section | Clash Display | Medium | 32–40px |
| H3 / Card title | Clash Display | Regular | 20–24px |
| Body | Archivo | Regular | 16px |
| Caption | Archivo | Light | 12–14px |
| Button | Archivo | SemiBold | 14–16px |

### 1.4 v2 Motion Principles
- Page flip: CSS 3D perspective transform, 600ms ease-in-out
- Step transitions: Slide left/right (300ms), not fade
- Button feedback: Scale(0.97) on press + ripple effect
- Loading: Shimmer skeleton (never spinners alone)
- Mobile swipe: Touch-native gestures for page flip

---

## 2. User Flow Architecture

```
Landing Page
    │
    ├── [Auto Generate] ──────────────────────────────────────────────┐
    │                                                                   │
    └── [Choose Your Own] ─────────────────────────────────────────┐  │
                                                                     │  │
                                                         ┌───────────┘  │
                                                         ▼              ▼
                                                 TRUEKEEP STUDIO ENTRY
                                                         │
                                        ┌────────────────┼────────────────┐
                                        ▼ (Auto)         │         (Custom)▼
                               Step 1: Book Settings     │    Step 1: Book Settings
                               Step 2: Upload Photos     │    Step 2: Upload Photos
                               Step 3: Layout Select     │    Step 3: Canvas Editor
                               Step 4: Theme & BG        │         (full control)
                               Step 5: Cover Style       │    Step 4: Preview
                               Step 6: Page Review       │    Step 5: Order
                               Step 7: Order             │
```

---

## 3. Screen-by-Screen Specification

---

### SCREEN 0: Landing / Mode Selection

**Purpose:** Funnel users into either track without overwhelming them.

**Layout:**
```
┌────────────────────────────────────────────────────────────┐
│                    [TrueKeep Logo]                          │
│             Beautiful quality, for beautiful moments.       │
│                                                             │
│   ┌──────────────────────┐  ┌──────────────────────┐       │
│   │   ✨ Auto Generate   │  │   🎨 Design Your Own  │       │
│   │   We build it for you│  │   Full creative control│      │
│   │   Perfect for first  │  │   Place every photo   │       │
│   │   time users         │  │   exactly where you   │       │
│   │                      │  │   want                │       │
│   │   [Get Started →]    │  │   [Start Creating →]  │       │
│   └──────────────────────┘  └──────────────────────┘       │
│                                                             │
│   "Not sure? Start with Auto Generate — you can always     │
│    customize later."                                        │
└────────────────────────────────────────────────────────────┘
```

**UX Notes:**
- Auto Generate card is visually dominant (larger, higher contrast CTA)
- Subtle "not sure?" nudge text pushes undecided users to Auto
- Both cards animate in on load (stagger 150ms)

---

### SCREEN 1: Book Settings

**Purpose:** Capture essential metadata before any photo upload.

**Fields:**
| Field | Options | Default |
|---|---|---|
| Book Name | Text input | "My Photo Book" |
| Book Size | Square 8×8", Landscape 11×8.5", Portrait 8×10", Large 12×12" | Square 8×8" |
| Page Count | 20, 30, 40, 50, Custom (20–100) | 20 |
| Paper Finish | Matte, Glossy, Linen | Matte |
| Binding | Softcover, Hardcover (+$8), Layflat (+$12) | Softcover |

**Layout:**
```
┌─────────────────────────────────────────┐
│ Step 1 of 6 ●○○○○○                      │
│ Book Settings                           │
│                                         │
│  Book Name: [________________]          │
│                                         │
│  Book Size:                             │
│  ┌──────┐ ┌──────────┐ ┌──────┐        │
│  │8×8"  │ │11×8.5"   │ │8×10" │        │
│  │Square│ │Landscape │ │Port. │        │
│  └──────┘ └──────────┘ └──────┘        │
│                                         │
│  Pages: [20] [30] [40] [50] [Custom]   │
│                                         │
│  Paper: [Matte] [Glossy] [Linen]        │
│                                         │
│  Binding: [Softcover] [Hardcover +$8]  │
│                                         │
│ Estimated price: $24.99                 │
│                    [Continue →]         │
└─────────────────────────────────────────┘
```

**Edge Cases:**
- Price preview updates live as options change
- Custom page count: validate min 20, max 100, even numbers only
- If user picks "Large 12×12" + "Layflat" show premium upsell badge

---

### SCREEN 2: Upload Photos

**Purpose:** Fast, encouraging batch upload with smart feedback.

**Layout:**
```
┌─────────────────────────────────────────┐
│ Step 2 of 6 ●●○○○○                      │
│ Upload Your Photos                      │
│                                         │
│  ┌─────────────────────────────────┐    │
│  │  ☁ Drop photos here or         │    │
│  │    [Browse Files] [From Phone]  │    │
│  │                                 │    │
│  │  Accepts JPG, PNG, HEIC         │    │
│  └─────────────────────────────────┘    │
│                                         │
│  24 photos uploaded • 20 pages          │
│  ████████████████░░░░ 1.2 photos/page  │
│                                         │
│  [  photo  ][  photo  ][  photo  ] ...  │
│  [  photo  ][  photo  ][  photo  ] ...  │
│                                         │
│  ⚠ 2 photos may be too low-res         │
│    for print (under 1200×900px)         │
│                                         │
│              [Continue →]               │
└─────────────────────────────────────────┘
```

**Edge Cases:**
- **Too few photos (< page count / 2):** Warn "You have 6 photos for 20 pages. We recommend at least 20 photos. Continue anyway?"
- **Too many photos:** "You have 80 photos for 20 pages. Some won't fit — we'll pick the best ones, or increase your page count."
- **Wrong format** (PDF, video): Inline error per file "file.pdf is not supported"
- **Duplicate detection:** MD5 hash check, show "X duplicate(s) skipped"
- **Low resolution:** Flag images under 1200×900px with warning icon (can still use, but warn)
- **HEIC files:** Convert client-side before upload using `heic2any` lib
- **Upload interrupted:** Retry per-file with exponential backoff, don't restart full batch
- **Very large file (>15MB):** Compress client-side to ~3MB before upload
- **Offline mid-upload:** Queue uploads, resume on reconnect
- **Progress:** Per-file progress bar + overall "Uploading 12 of 24..."

---

### SCREEN 3: Layout & Theme Selection (Auto Generate only)

**Purpose:** Let user set the visual personality of the whole book.

**Sub-sections:**
1. **Layout Style** — How photos are arranged per page
2. **Theme & Background** — Color/pattern system applied throughout

**Layout Style Options:**
| Style | Description | Preview |
|---|---|---|
| Classic | 1-2 large photos per page, clean white | Clean, minimal |
| Editorial | Mixed sizes, bold captions | Magazine feel |
| Grid | Even grid of photos | Systematic |
| Collage | Overlapping, angled photos | Playful/scrapbook |
| Minimal | Single photo per page, lots of whitespace | Premium/art |

**Theme Categories (matching existing DB):**
- Wedding, Baby, Travel, Family, Birthday, Simple/Minimal, Custom

**UX Notes:**
- Live mini-preview updates when layout+theme selected (show 2-page spread)
- Category filter chips at top
- "Best for your photos" badge on recommended theme based on photo count

---

### SCREEN 4: Cover Style Selection

**(This matches your tk3.jpeg sketch exactly)**

**Layout:**
```
┌──────────────────────────────────────────────────────────────┐
│ Step 4 of 6 ●●●●○○                                           │
│ Choose Your Front & Back Cover Style                         │
│                                                              │
│  ┌──────────┐  ┌────────────────────────────────────────┐   │
│  │Cover     │  │          Book Preview                   │   │
│  │Thumbnail │  │  ┌──────────┐    ┌──────────┐          │   │
│  │selector  │  │  │ Front    │    │  Back    │          │   │
│  │(4 styles)│  │  │ Cover    │◄──►│  Cover   │          │   │
│  │          │  │  └──────────┘    └──────────┘          │   │
│  └──────────┘  └────────────────────────────────────────┘   │
│                                                              │
│  You can upload your own cover photo:                        │
│  [Front Cover: Upload Photo] [Back Cover: Upload Photo]      │
│                                                              │
│  ─────────────────────────────────────────────────          │
│  Select Your Theme                                           │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐  [Show More]         │
│  │Theme │ │Theme │ │Theme │ │Theme │                        │
│  │  1   │ │  2   │ │  3   │ │  4   │                        │
│  └──────┘ └──────┘ └──────┘ └──────┘                        │
│                                                              │
│                [← Back]  [Continue →]  [Print My Book]       │
└──────────────────────────────────────────────────────────────┘
```

**Cover Style Options:**
| Style | Description |
|---|---|
| Full Bleed | Your photo fills entire cover edge-to-edge |
| Framed | Photo with white/color border + title text |
| Minimal | Title only, colored background, no photo |
| Split | Half photo, half color with title |

**UX Notes:**
- Clicking "Front Cover" area in preview opens cover photo uploader
- Live preview shows selected theme + layout immediately
- Title text field overlaid on cover preview, editable inline
- "Print My Book" shortcut skips page customization with "Are you sure? You can still edit pages later."

**Edge Cases:**
- No photo uploaded for cover: Use first uploaded photo as default
- Low-res cover photo: Bigger warning since cover is most visible
- Very long book title: Truncation with "..." + character counter (max 40 chars)

---

### SCREEN 5: Per-Page Review & Customization

**Purpose:** Let user review auto-generated pages and make targeted adjustments.

**Layout (Desktop):**
```
┌──────────────────────────────────────────────────────────────┐
│ Step 5 of 6 ●●●●●○                                           │
│ Review Your Pages              [Auto-Rearrange] [Save Draft] │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  [Page 1-2 spread — book flip preview]                 │  │
│  │                                                        │  │
│  │  ◄ [prev]                              [next] ►        │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  Page 3-4  ▾                                                 │
│  ┌────┐ ┌────┐ ┌────┐ ┌────┐  (page thumbnails)           │
│  │    │ │    │ │    │ │    │                                │
│  └────┘ └────┘ └────┘ └────┘                                │
│                                                              │
│  Selected page actions:                                      │
│  [Swap Photo] [Add Caption] [Change Layout] [Delete Page]   │
│                                                              │
│                    [Continue to Order →]                     │
└──────────────────────────────────────────────────────────────┘
```

**Layout (Mobile):**
- Full screen page flip with swipe gesture (CSS 3D)
- Tap page to open edit drawer from bottom
- Bottom sheet: Swap, Caption, Layout options

**Edge Cases:**
- Blank pages (no photo assigned): Highlight in red thumbnail strip "2 empty pages"
- Caption overflow: Warn if text will be cropped in print
- Deleting a page when at minimum: Disable delete for last 2 pages
- Undo stack: Track last 10 actions, Ctrl+Z / shake-to-undo on mobile

---

### SCREEN 6: Order Summary

**Purpose:** Clear, confidence-building checkout entry point.

**Sections:**
1. Book preview (3D cover mockup)
2. Order summary (size, pages, finish, binding, quantity)
3. Price breakdown (product + shipping estimate)
4. [Proceed to Checkout] CTA

**Edge Cases:**
- Out of stock on selected paper: Suggest alternative
- Promo code field
- Quantity selector (bulk orders for weddings etc.)

---

## 4. TrueKeep Studio — "Choose Your Own" Path

Designed for power users. Same entry point, different experience after book settings.

**Key differences from Auto Generate:**
- Uploads all go to a "Photo Library" panel (left sidebar)
- Center = canvas editor (existing implementation, but redesigned)
- Per-page layout picker in right panel
- No auto-arrangement — user drags photos to exact positions
- All the same page count, cover, theme options — but chosen per-page

**Additional features for this mode:**
- Text layers (add title, captions, dates)
- Decorative elements (stickers, borders, dividers)
- Photo filters (B&W, Vintage, Warm, Cool)
- Clone/duplicate page
- Reorder pages (drag handle in thumbnail strip)

---

## 5. Edge Cases & System Resilience

### 5.1 Session / Data Loss
| Scenario | Handling |
|---|---|
| Browser closed mid-session | Auto-save to localStorage every 30s |
| Server restart | In-memory data lost → show "Session expired, start over?" |
| Long idle (>30 min) | Prompt "Still working? Your book will be saved for 24 hours" |
| Back button during wizard | Confirm dialog: "Leave this step? Changes will be saved." |

### 5.2 Photo Quality
| Scenario | Handling |
|---|---|
| Photo under 1200×900px | Yellow warning badge, allow continue |
| Photo under 640×480px | Red warning "May appear pixelated in print" |
| Photo over 20MB | Client-side compression before upload |
| HEIC/HEIF format | Convert using heic2any before upload |
| No EXIF orientation | Detect and correct rotation |
| Portrait photo in landscape slot | Auto-crop center with "Edit crop" option |

### 5.3 Mobile-Specific
| Scenario | Handling |
|---|---|
| Upload from camera roll | Native file picker with `accept="image/*"` + `capture` |
| Pinch zoom on preview | CSS touch-action + transform scale |
| Swipe to flip page | Touch event delta > 50px triggers flip |
| Long press photo | Context menu: Swap, Move, Delete |
| Screen rotation | Canvas re-renders, layout preserved |

### 5.4 Cover & Content
| Scenario | Handling |
|---|---|
| Cover photo is portrait, book is landscape | Show crop preview with drag-to-reframe |
| No cover photo uploaded | Auto-select best photo (sharpest, most central subject) |
| 0 photos uploaded, tries to continue | Disabled CTA with tooltip "Upload at least 1 photo" |
| All photos same aspect ratio | Skip crop warnings, apply directly |

### 5.5 Order & Fulfillment
| Scenario | Handling |
|---|---|
| Payment fails | Error inline, don't lose book data |
| Printer API timeout | Queue order, notify by email when confirmed |
| Address validation fails | Inline USPS/address API suggestion |
| Rush order not available for size | Hide option, show next available date |

---

## 6. Feature Priority Matrix

### Must Have (v2 launch)
- [ ] Multi-step wizard with progress stepper (6 steps)
- [ ] Book settings selection (size, pages, finish, binding)
- [ ] Batch photo upload with progress + quality warnings
- [ ] Layout + theme selection with live 2-page preview
- [ ] Cover style selection with photo upload + book preview panel
- [ ] Per-page review with page-flip animation
- [ ] Auto-save to localStorage
- [ ] Mobile-first responsive design with swipe gestures
- [ ] v2 brand implementation (Clash Display + Archivo + new colors)
- [ ] Version toggle (v1/v2 via env var)

### Should Have (v2.1)
- [ ] Inline text/caption editor on pages
- [ ] Undo/redo stack (10 levels)
- [ ] Photo reordering before auto-layout
- [ ] Duplicate photo detection
- [ ] HEIC file support
- [ ] Client-side image compression
- [ ] Promo code support

### Nice to Have (v3)
- [ ] Photo filters (B&W, Vintage, etc.)
- [ ] Stickers / decorative elements
- [ ] "Surprise me" random theme picker
- [ ] AI-suggested captions per photo
- [ ] Bulk order / wedding packages
- [ ] Share preview link (view only)
- [ ] Save multiple drafts

---

## 7. Technical Implementation Notes

### 7.1 Version Config
```ts
// client/src/lib/config.ts
export const UI_VERSION = import.meta.env.VITE_UI_VERSION || 'v1';
export const isV2 = UI_VERSION === 'v2';
```
Use `isV2` flag in Tailwind classes: `className={isV2 ? 'font-clash' : 'font-outfit'}`

### 7.2 Fonts (v2)
Load via @font-face in index.css. Clash Display requires a license — use CDN or self-host.
Fallback stack: `'Clash Display', 'Inter', sans-serif`

### 7.3 Page Flip
Use `react-pageflip` library or custom CSS 3D transform:
```css
.page-flip {
  transform-style: preserve-3d;
  transition: transform 600ms ease-in-out;
  transform-origin: left center;
}
.page-flip.flipped { transform: rotateY(-180deg); }
```

### 7.4 Auto-Save
```ts
// Debounce 30s, save wizard state to localStorage
const STORAGE_KEY = `truekeep_draft_${projectId}`;
localStorage.setItem(STORAGE_KEY, JSON.stringify(wizardState));
```

### 7.5 Wizard State Shape
```ts
interface WizardState {
  step: 1 | 2 | 3 | 4 | 5 | 6;
  mode: 'auto' | 'custom';
  bookSettings: {
    name: string;
    size: 'square_8x8' | 'landscape_11x8' | 'portrait_8x10' | 'large_12x12';
    pageCount: number;
    paperFinish: 'matte' | 'glossy' | 'linen';
    binding: 'softcover' | 'hardcover' | 'layflat';
  };
  photos: UploadedPhoto[];
  layout: LayoutStyle;
  themeId: string;
  coverStyle: 'full_bleed' | 'framed' | 'minimal' | 'split';
  frontCoverPhotoId?: string;
  backCoverPhotoId?: string;
  bookTitle: string;
  pages: PageState[];
}
```

---

## 8. Component Architecture

```
src/
  pages/
    home.tsx              ← Landing + mode selection
    create.tsx            ← Wizard shell (step router)
    studio.tsx            ← Choose Your Own canvas editor
  components/
    wizard/
      StepProgress.tsx    ← Step indicator "3 of 6"
      BookSettings.tsx    ← Step 1
      PhotoUpload.tsx     ← Step 2
      LayoutTheme.tsx     ← Step 3
      CoverStyle.tsx      ← Step 4 (from tk3 sketch)
      PageReview.tsx      ← Step 5
      OrderSummary.tsx    ← Step 6
    preview/
      BookFlip.tsx        ← Page flip component
      PageSpread.tsx      ← 2-page spread
      CoverPreview.tsx    ← Cover mockup
    upload/
      DropZone.tsx        ← Drag & drop + file picker
      UploadProgress.tsx  ← Per-file progress bars
      PhotoGrid.tsx       ← Uploaded photos grid
    ui/                   ← Existing shadcn components
```

---

*TrueKeep Product Spec — Last updated: 2026-02-27*
