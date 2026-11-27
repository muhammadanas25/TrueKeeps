import { Suspense, lazy, useEffect, useState } from "react";
import { Switch, Route, Redirect, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { bookTypeBySlug, metaForPath, SITE } from "@shared/site";
import { BookTypePage, PhotoBooksPage, PolicyPageView, QuestionsPage } from "@/features/landing/pages";
import { policyBySlug } from "@shared/info-pages";
import { WhatsAppHelpFloating } from "@/features/support/WhatsAppHelp";
import { startTracking, trackPage } from "@/lib/track";
import { hasPending } from "@/features/builder/upload/pending";

/*
 * Route-level code splitting: each page loads its own chunk so the
 * landing bundle doesn't carry the canvas editor or the book builder.
 * Home and the /photo-books pages stay eager: they get instant first paint and
 * are prerendered at build time, which needs them resolved without Suspense.
 */
import Home from "@/pages/home";
const Create = lazy(() => import("@/pages/create"));
const BookBuilder = lazy(() => import("@/features/builder"));
const Books = lazy(() => import("@/pages/books"));
const Account = lazy(() => import("@/pages/account"));
const Orders = lazy(() => import("@/pages/orders"));
const Order = lazy(() => import("@/pages/order"));
const AdminOrders = lazy(() => import("@/pages/admin-orders"));
const AdminConsole = lazy(() => import("@/features/admin"));
const Partners = lazy(() => import("@/features/partners"));
const Feedback = lazy(() => import("@/features/feedback"));
const AdminFeedback = lazy(() => import("@/pages/admin-feedback"));
const NotFound = lazy(() => import("@/pages/not-found"));
const AuthDone = lazy(() => import("@/pages/auth-done"));
const UploadNotices = lazy(() => import("@/features/builder/upload/UploadNotices"));

/** Minimal, brand-neutral fallback while a route chunk loads. */
function RouteFallback() {
  return <div style={{ minHeight: "100vh", background: "var(--surface-page)" }} aria-busy="true" />;
}

/**
 * Redirect that keeps the query string, so an old /feedback?order=TK-… link
 * still arrives with its order number (wouter's <Redirect> drops it).
 */
function RedirectKeepingQuery({ to }: { to: string }) {
  const [, setLocation] = useLocation();
  useEffect(() => {
    setLocation(to + window.location.search, { replace: true });
  }, [to, setLocation]);
  return <RouteFallback />;
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

/** Page views and active time for Admin → Analytics (client/src/lib/track.ts). */
function useTracking() {
  const [path] = useLocation();
  useEffect(() => startTracking(), []);
  useEffect(() => trackPage(path), [path]);
}

function Router() {
  useRouteMeta();
  useTracking();
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
        <Route path="/questions" component={QuestionsPage} />
        <Route path="/policies/:slug">
          {(params) => {
            const policy = policyBySlug(params.slug);
            return policy ? <PolicyPageView policy={policy} /> : <NotFound />;
          }}
        </Route>
        {/* The old template gallery had dead controls and stock photos, and nothing
            links to it any more; the book types are the designs people can browse. */}
        <Route path="/templates">
          <Redirect to="/photo-books" />
        </Route>
        <Route path="/create" component={Create} />
        {/* quiz-first builder — the primary "autopilot" path */}
        <Route path="/wizard" component={BookBuilder} />
        {/* The previous 6-step wizard had USD prices and a fake "Order placed"
            button; with real checkout live it would mislead customers, so the
            URL now goes to the real builder. */}
        <Route path="/wizard-classic">
          <Redirect to="/wizard" />
        </Route>
        {/* account area (Phase 2A) */}
        <Route path="/auth/done" component={AuthDone} />
        <Route path="/books" component={Books} />
        <Route path="/account" component={Account} />
        {/* commerce (Phase 2B) */}
        <Route path="/orders" component={Orders} />
        <Route path="/orders/:id" component={Order} />
        {/* the previous single-page orders console, kept while its tools move into the new admin */}
        <Route path="/admin/legacy-orders" component={AdminOrders} />
        {/* private customer reviews (docs/adr/015); the first addresses redirect */}
        <Route path="/review" component={Feedback} />
        <Route path="/partners" component={Partners} />
        <Route path="/admin/reviews" component={AdminFeedback} />
        <Route path="/feedback">
          <RedirectKeepingQuery to="/review" />
        </Route>
        <Route path="/admin/feedback">
          <RedirectKeepingQuery to="/admin/reviews" />
        </Route>
        {/* the ops console (docs/adr/018): its own shell, staff only, second sign-in step */}
        <Route path="/admin" nest component={AdminConsole} />
        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

/**
 * Uploads carry on on every page (docs/adr/023), so their keep-alive and
 * messages live here. Loaded only for visitors with photos on their way:
 * from the first visit to the builder, or on a page load that finds photos
 * kept on the phone from an earlier visit. Decided after mount, so the
 * prerendered pages never touch localStorage.
 */
function UploadNoticesWhenNeeded() {
  const [path] = useLocation();
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (!on && (path.startsWith("/wizard") || hasPending())) setOn(true);
  }, [path, on]);
  return on ? (
    <Suspense fallback={null}>
      <UploadNotices />
    </Suspense>
  ) : null;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
        <UploadNoticesWhenNeeded />
        {/* help on WhatsApp with the customer's context (not on the builder or admin) */}
        <WhatsAppHelpFloating />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
