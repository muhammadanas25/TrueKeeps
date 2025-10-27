# TrueKeeps Photo Book Platform - Design Guidelines

## Design Approach

**Reference-Based Design** drawing from Mixbook, Shutterfly, and Artifact Uprising. The platform balances emotional storytelling with functional precision, creating an inviting yet professional creative workspace.

## Typography System

**Font Family**: Outfit (Google Fonts)

**Hierarchy**:
- Hero Headlines: 700 weight, 48-64px (text-5xl/text-6xl)
- Section Headers: 600 weight, 32-40px (text-3xl/text-4xl)
- Subsection Titles: 600 weight, 20-24px (text-xl/text-2xl)
- Body Text: 400 weight, 16-18px (text-base/text-lg)
- UI Labels: 500 weight, 14px (text-sm)
- Captions: 400 weight, 12-14px (text-xs/text-sm)

## Layout System

**Spacing Primitives**: Consistently use Tailwind units of 3, 4, 6, 8, 12, 16, 20, 24 for rhythm and harmony.

**Container Strategy**:
- Full-width sections: w-full with inner max-w-7xl mx-auto px-6
- Editor workspace: max-w-screen-2xl for expanded canvas
- Content sections: max-w-6xl
- Reading content: max-w-4xl

**Vertical Rhythm**:
- Section padding: py-16 (mobile) to py-24 (desktop)
- Component spacing: gap-8 to gap-12
- Card internal padding: p-6 to p-8

## Color Application

Use provided brand colors strategically:
- **Primary Actions**: Deep blue (#06097e) for CTAs, primary buttons
- **Accent/Highlights**: Pink (#d04c8a) for featured elements, progress indicators, hover states
- **Secondary Actions**: Light blue (#5ac7e6) for secondary buttons, informational elements
- **Text/Structure**: Dark gray (#3a3a3a) for body text, borders

**Application Guidelines**:
- Buttons: Deep blue background, white text
- Links: Light blue, pink on hover
- Success states: Light blue
- Feature highlights: Pink accents
- Text: Dark gray primary, lighter grays for secondary

## Component Library

### Navigation
**Main Header**: Fixed top navigation with logo left, centered nav links (Templates, Pricing, Inspiration, Help), right-aligned "Sign In" + "Create Project" CTA button. Height: h-20. Background: white with subtle shadow on scroll.

### Hero Section
**Layout**: Full-width, min-h-screen (80vh), two-column split on desktop, stacked on mobile. Left column: headline, subheadline, dual CTAs ("Start Creating" primary + "Browse Templates" secondary with arrow icon). Right column: large hero image showcasing finished photo books. Buttons on image use backdrop-blur-md with white/20 background.

**Content Structure**:
- Headline emphasizes transformation: "Turn Your Digital Memories Into Beautiful Photo Books"
- Supporting text: benefit-focused, 2-3 lines maximum
- Social proof: "Join 50,000+ families preserving their stories"

### Template Gallery
**Grid Layout**: grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4, gap-6

**Template Card**:
- Aspect ratio: 3:4 portrait orientation
- Cover image preview with subtle shadow
- Hover: gentle scale (scale-105), increased shadow
- Label overlay at bottom: template name, page count badge
- Corner badge for "Popular" or "New" tags using pink accent

### Editor Interface
**Three-Panel Layout**:
1. **Left Sidebar** (w-80): Photo library, uploaded images in masonry grid, search/filter controls, collapsible folders
2. **Center Canvas** (flex-1): Main editing workspace, page spread view with zoom controls, ruler guides when dragging
3. **Right Panel** (w-96): Contextual properties - text editing, layout options, background selection, page navigation thumbnails

**Toolbar**: Fixed top bar within editor with undo/redo, zoom controls, add text/photo/shape, page management, 3D preview toggle, save/export

### 3D Preview Visualization
**Modal/Fullscreen View**: Dark background (#1a1a1a) for contrast. Center-stage 3D book model with realistic lighting, page-turning animation, rotation controls. Control bar: page navigation, rotate/flip, zoom, download preview. Exit button top-right with backdrop-blur.

### Photo Upload Zone
**Drag-Drop Area**: Dashed border (border-2 border-dashed), light blue tint on hover, centered upload icon (cloud-arrow-up), "Drag photos here or click to browse" text, supported formats below, progress bars for uploading with percentage.

### Feature Cards (Homepage)
**Three-Column Grid**: Each card has icon at top (60px size, pink color), title, description, "Learn More" link with arrow. Cards have subtle border, hover lifts with shadow-lg. Icons: drag-drop, layout-template, cube for 3D.

### Pricing Tiers
**Horizontal Cards**: Three tiers side-by-side, recommended tier elevated with pink border-2, larger scale. Each includes: tier name, price (large, bold), feature list with checkmarks, CTA button. Background: white cards on light gray section.

### Footer
**Rich Multi-Column**: Four columns - Product links, Resources, Company info, Newsletter signup. Newsletter: heading, input with inline button, social icons below. Bottom bar: copyright, legal links, payment badges.

## Images Section

**Hero Image**: Right side of hero - high-quality photograph showing 3-4 finished photo books at angles, natural lighting, lifestyle setting (coffee table, soft background). Dimensions: 1200x1400px.

**Template Previews**: 12-16 template cover images showing variety (wedding, baby, travel, family themes). Each 600x800px, professional photography style.

**Feature Visuals**: Three supporting images - drag-drop UI screenshot, template customization in action, 3D book preview render. Each 800x600px.

**Process Steps**: Four instructional images showing upload → select → customize → preview workflow. Square format, 500x500px each.

**Testimonial Photos**: Customer submitted book photos, authentic lifestyle shots. 6-8 images, 400x500px portrait orientation.

**Background Textures**: Subtle paper/texture patterns for sections, very low opacity, tile seamlessly.

## Interaction Patterns

**Guided vs. Power User**:
- **Quick Start**: Wizard-style flow with template selection → auto-layout → customize
- **Advanced Mode**: Full editor access from start, all tools visible
- Toggle between modes available throughout

**Drag Behaviors**: 
- Magnetic snap to grid when near alignment
- Visual guides appear when dragging
- Ghost preview shows placement before drop
- Smooth spring animation on release

**Progressive Disclosure**: 
- Template filters collapse/expand
- Advanced editing tools in expandable panels
- Contextual tooltips on first use

**Feedback**:
- Saving indicator (pink pulse animation)
- Toast notifications for actions (slide in from top-right)
- Loading states: skeleton screens for template gallery, shimmer effect

## Animations

**Minimal, Purposeful**:
- Page transitions: 200ms fade
- Card hovers: 150ms ease-out
- Button interactions: built-in states (no custom needed)
- 3D preview: smooth 60fps rotation when dragged
- Photo upload: progress fill animation

**No scroll-triggered animations** - maintain focus on content.

## Accessibility

- Minimum contrast ratio 4.5:1 for all text
- Focus indicators: 2px pink outline with offset
- All interactive elements keyboard navigable
- Alt text required for all template images
- ARIA labels for icon-only buttons
- Skip navigation link for editor interface