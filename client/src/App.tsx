import { Suspense, lazy, useEffect } from "react";
import { Switch, Route, Redirect, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { isV2 } from "@/lib/config";
import { bookTypeBySlug, metaForPath, SITE } from "@shared/site";
import { BookTypePage, PhotoBooksPage } from "@/features/landing/pages";

/*
 * Route-level code splitting: each page loads its own chunk so the
 * landing bundle doesn't carry the canvas editor or the book builder.
 * Home and the /photo-books pages stay eager: they get instant first paint and
 * are prerendered at build time, which needs them resolved without Suspense.
 */
import Home from "@/pages/home";
const Templates = lazy(() => import("@/pages/templates"));
const Create = lazy(() => import("@/pages/create"));
const BookBuilder = lazy(() => import("@/features/builder"));
const Books = lazy(() => import("@/pages/books"));
const Account = lazy(() => import("@/pages/account"));
const Orders = lazy(() => import("@/pages/orders"));
const Order = lazy(() => import("@/pages/order"));
const AdminOrders = lazy(() => import("@/pages/admin-orders"));
const NotFound = lazy(() => import("@/pages/not-found"));

/** Minimal, brand-neutral fallback while a route chunk loads. */
function RouteFallback() {
  return <div style={{ minHeight: "100vh", background: "var(--tk-cream-warm)" }} aria-busy="true" />;
}

/** Set or create one <head> tag (prerendered pages start with them all). */
function setHeadTag(selector: string, attr: string, value: string, create: () => HTMLElement) {
  let el = document.head.querySelector(selector);
  if (!el) {
    el = create();
    document.head.appendChild(el);
  }
  el.setAttribute(attr, value);
}

/**
 * Keeps the tab title and share tags right during in-app navigation. Crawlers
 * load each URL fresh and get the prerendered <head>; this covers people moving
 * around, and crawlers that do run the JavaScript.
 */
function useRouteMeta() {
  const [path] = useLocation();
  useEffect(() => {
    const meta = metaForPath(path);
    const url = SITE.url + meta.path;
    const named = (name: string) => () => Object.assign(document.createElement("meta"), { name });
    const prop = (property: string) => () => {
      const el = document.createElement("meta");
      el.setAttribute("property", property);
      return el;
    };
    document.title = meta.title;
    setHeadTag('meta[name="description"]', "content", meta.description, named("description"));
    setHeadTag('link[rel="canonical"]', "href", url, () => Object.assign(document.createElement("link"), { rel: "canonical" }));
    setHeadTag('meta[property="og:title"]', "content", meta.title, prop("og:title"));
    setHeadTag('meta[property="og:description"]', "content", meta.description, prop("og:description"));
    setHeadTag('meta[property="og:url"]', "content", url, prop("og:url"));
    setHeadTag('meta[property="og:image"]', "content", SITE.url + meta.ogImage, prop("og:image"));
  }, [path]);
}

function Router() {
  useRouteMeta();
  return (
    <Suspense fallback={<RouteFallback />}>
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/photo-books" component={PhotoBooksPage} />
        <Route path="/photo-books/:slug">
          {(params) => {
            const book = bookTypeBySlug(params.slug);
            return book ? <BookTypePage book={book} /> : <NotFound />;
          }}
        </Route>
        <Route path="/templates" component={Templates} />
        <Route path="/create" component={Create} />
        {/* quiz-first builder — the primary "autopilot" path */}
        <Route path="/wizard" component={BookBuilder} />
        {/* The previous 6-step wizard had USD prices and a fake "Order placed"
            button; with real checkout live it would mislead customers, so the
            URL now goes to the real builder. Code kept in pages/wizard.tsx. */}
        <Route path="/wizard-classic">
          <Redirect to="/wizard" />
        </Route>
        {/* account area (Phase 2A) */}
        <Route path="/books" component={Books} />
        <Route path="/account" component={Account} />
        {/* commerce (Phase 2B) */}
        <Route path="/orders" component={Orders} />
        <Route path="/orders/:id" component={Order} />
        <Route path="/admin/orders" component={AdminOrders} />
        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

function ThemeProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if (isV2) document.body.classList.add("theme-v2");
    else document.body.classList.remove("theme-v2");
  }, []);
  return <>{children}</>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <ThemeProvider>
          <Toaster />
          <Router />
        </ThemeProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
