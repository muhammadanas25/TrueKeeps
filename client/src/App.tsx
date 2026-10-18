import { Suspense, lazy, useEffect } from "react";
import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { isV2 } from "@/lib/config";

/*
 * Route-level code splitting: each page loads its own chunk so the
 * landing bundle doesn't carry the canvas editor or the book builder.
 * Home is the entry route and stays eager for instant first paint.
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

function Router() {
  return (
    <Suspense fallback={<RouteFallback />}>
      <Switch>
        <Route path="/" component={Home} />
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
