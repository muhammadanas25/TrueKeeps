# Overview

This is a photo book creation and e-commerce platform called "truekeeps" that transforms digital memories into physical keepsakes. The application allows users to browse themes, create custom photo books, and purchase various photo products like canvas prints, frames, and albums. It features a modern e-commerce interface with product catalogs, theme selection, promotional campaigns, and customer interaction capabilities.

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
- **Database Schema**: Well-defined schema for users, products, and themes with proper relationships and constraints
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