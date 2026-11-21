/**
 * The ops console (/admin/*) — docs/adr/018, design approved on the canvas
 * (Round 4/4b). Mounted by App.tsx as a nested route, so paths here are
 * relative to /admin. Each page is its own module; the shell decides whether
 * anything renders at all (staff + second step).
 */

import { Route, Switch } from "wouter";
import { MorePage, Shell } from "./Shell";
import { OverviewPage } from "./pages/Overview";
import { OrdersPage } from "./pages/Orders";
import { OrderDetailPage } from "./pages/OrderDetail";
import { PrintQueuePage } from "./pages/PrintQueue";
import { AnalyticsPage } from "./pages/Analytics";
import { NotificationsPage } from "./pages/Notifications";
import { TeamPage } from "./pages/Team";

function OwnerOnly() {
  return (
    <div className="oc-card">
      <h1>Owner only</h1>
      <p>This page is for the owner's account.</p>
    </div>
  );
}

export default function AdminConsole() {
  return (
    <Shell>
      {(me) => (
        <Switch>
          <Route path="/">{() => <OverviewPage me={me} />}</Route>
          <Route path="/orders">{() => <OrdersPage me={me} />}</Route>
          <Route path="/orders/:id">{(p) => <OrderDetailPage id={p.id} me={me} />}</Route>
          <Route path="/print">{() => <PrintQueuePage />}</Route>
          <Route path="/analytics">{() => (me.role === "admin" ? <AnalyticsPage /> : <OwnerOnly />)}</Route>
          <Route path="/notifications">{() => <NotificationsPage me={me} />}</Route>
          <Route path="/team">{() => (me.role === "admin" ? <TeamPage me={me} /> : <OwnerOnly />)}</Route>
          <Route path="/more">{() => <MorePage me={me} />}</Route>
          <Route>
            <div className="oc-card">
              <h1>Page not found</h1>
            </div>
          </Route>
        </Switch>
      )}
    </Shell>
  );
}
