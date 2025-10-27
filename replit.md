# Overview

This is a photo book creation and e-commerce platform called "truekeeps" that transforms digital memories into physical keepsakes. The application allows users to browse themes, create custom photo books, and purchase various photo products like canvas prints, frames, and albums. It features a modern e-commerce interface with product catalogs, theme selection, promotional campaigns, and customer interaction capabilities.

## Recent Updates (October 27, 2025)

### Completed Features
1. **Photobook Project Creation**: Users can create named projects with theme selection
2. **Photo Upload System**: Drag-and-drop and file input upload with base64 storage and API persistence
3. **State Persistence**: Complete project metadata, theme, and photo persistence across page reloads via URL parameters and API queries
4. **Template Selection**: Theme browsing and selection interface with multiple categories (Wedding, Baby, Travel, etc.)
5. **Editor Interface**: Dual-mode editor (Quick Start and Advanced) with page navigation and photo library

### Pending Features
1. **Canvas Drag-and-Drop**: Photo placement onto pages with snap-to-grid and visual guides (future iteration)
2. **3D Preview**: Realistic photobook visualization component
3. **Auto-Layout AI**: Intelligent photo arrangement for Quick Start mode

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Frontend Architecture
- **React + TypeScript**: Modern React application using TypeScript for type safety
- **Vite**: Development server and build tool for fast hot module replacement and optimized production builds
- **ShadCN/UI + Radix UI**: Comprehensive component library built on Radix primitives for accessible, customizable UI components
- **TailwindCSS**: Utility-first CSS framework with custom design tokens and theming
- **Wouter**: Lightweight client-side routing solution
- **TanStack Query**: Data fetching, caching, and synchronization for API interactions

## Backend Architecture
- **Express.js**: Node.js web framework handling HTTP requests and middleware
- **TypeScript**: Type-safe server-side development
- **Storage Interface Pattern**: Abstracted storage layer with in-memory implementation for development and extensible interface for database integration
- **RESTful API Design**: API routes prefixed with `/api` for clear separation of concerns

## Data Layer
- **Drizzle ORM**: Type-safe SQL query builder and ORM for database operations
- **PostgreSQL**: Configured for production database with Neon serverless integration
- **Database Schema**: Extended schema including:
  - **Projects**: Photobook projects with name, theme relationships, and status
  - **Pages**: Individual pages within projects with layout configurations
  - **Photos**: Photo metadata with placement coordinates on pages
  - **Uploaded Photos**: Base64-encoded photo storage linked to projects
  - **Themes**: Pre-built theme templates for different occasions
  - **Products**: E-commerce product catalog (prints, frames, albums)
- **Zod Validation**: Runtime type validation for data integrity using Drizzle-Zod integration

## Development Setup
- **Monorepo Structure**: Client and server code organized in separate directories with shared schema
- **Path Mapping**: TypeScript path aliases for clean imports (`@/`, `@shared/`)
- **Hot Module Replacement**: Vite integration for rapid development cycles
- **Type Safety**: End-to-end TypeScript coverage from database to UI components

## UI Component System
- **Design System**: Consistent theming with CSS variables and dark mode support
- **Responsive Design**: Mobile-first approach with breakpoint-based layouts
- **Accessibility**: Built on Radix UI primitives ensuring WCAG compliance
- **Component Composition**: Modular component architecture with proper separation of concerns

# External Dependencies

## Frontend Libraries
- **@radix-ui/***: Comprehensive set of unstyled, accessible UI primitives (accordion, dialog, dropdown, etc.)
- **@tanstack/react-query**: Server state management and data fetching
- **wouter**: Lightweight routing library
- **tailwindcss**: Utility-first CSS framework
- **class-variance-authority**: Type-safe variant API for component styling
- **lucide-react**: Icon library with React components

## Backend Dependencies
- **express**: Web application framework
- **drizzle-orm**: TypeScript ORM and query builder
- **@neondatabase/serverless**: Serverless PostgreSQL driver for Neon database
- **drizzle-zod**: Integration between Drizzle ORM and Zod validation
- **connect-pg-simple**: PostgreSQL session store (for future session management)

## Development Tools
- **vite**: Frontend build tool and development server
- **tsx**: TypeScript execution environment for Node.js
- **esbuild**: JavaScript bundler for production builds
- **drizzle-kit**: Database migration and introspection tools
- **@replit/vite-plugin-***: Replit-specific development enhancements

## Database & Hosting
- **PostgreSQL**: Primary database system
- **Neon**: Serverless PostgreSQL hosting platform
- **Drizzle Kit**: Database migration management
- **In-Memory Storage**: Development storage implementation (MemStorage) for rapid prototyping

# API Routes

## Photobook Management
- `POST /api/projects` - Create a new photobook project
- `GET /api/projects/:id` - Fetch project metadata
- `GET /api/projects` - List all projects
- `GET /api/projects/:id/pages` - Fetch pages for a project
- `POST /api/pages` - Create a new page in a project

## Photo Management
- `POST /api/uploads` - Upload a photo (base64) to a project
- `GET /api/projects/:projectId/uploads` - Fetch all uploaded photos for a project
- `DELETE /api/uploads/:id` - Delete an uploaded photo
- `POST /api/photos` - Place a photo on a page with coordinates

## Theme & Product Management
- `GET /api/themes` - List all available themes
- `GET /api/themes/:id` - Fetch a specific theme
- `GET /api/products` - List all products
- `GET /api/products/:id` - Fetch product details

# User Flow

## Photobook Creation Flow
1. **Landing Page** (`/`) - Browse products and promotional content
2. **Theme Selection** (`/templates`) - Choose a pre-built theme or start with blank canvas
3. **Project Creation** (`/create?themeId=X`) - Name the project and initialize
4. **Photo Upload** - Drag-and-drop or select photos to upload
5. **Editor** (`/create?projectId=Y&themeId=X`) - Arrange photos, customize layouts, preview
6. **Persistence** - All state (project, theme, photos) persists across page reloads via URL params and API

## Key Technical Patterns
- **URL-based State Management**: Project and theme context stored in URL parameters
- **Query Hydration**: TanStack Query fetches and caches project metadata and photos on mount
- **Optimistic Updates**: Mutations invalidate relevant query keys for cache consistency
- **Base64 Storage**: Photos stored as data URLs for simplicity (production would use object storage)