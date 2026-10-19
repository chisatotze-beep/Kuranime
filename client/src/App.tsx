import { Switch, Route, Router } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppProvider } from "@/lib/store";
import { PublicShell, EmptyState } from "@/components/site";
import Home from "@/pages/home";
import Browse, { SeasonPage, GenresPage } from "@/pages/browse";
import AnimePage from "@/pages/anime";
import { lazy, Suspense } from "react";
import { Loader2 } from "lucide-react";
// dashboard dimuat terpisah: pengunjung biasa tidak perlu mengunduh kode admin
const A = {
  Overview: lazy(() => import("@/pages/admin").then((m) => ({ default: (p: any) => <m.AdminGate><m.AdminOverview {...p} /></m.AdminGate> }))),
  List: lazy(() => import("@/pages/admin").then((m) => ({ default: (p: any) => <m.AdminGate><m.AdminAnimeList {...p} /></m.AdminGate> }))),
  Settings: lazy(() => import("@/pages/admin").then((m) => ({ default: (p: any) => <m.AdminGate><m.AdminSettings {...p} /></m.AdminGate> }))),
  Users: lazy(() => import("@/pages/admin").then((m) => ({ default: (p: any) => <m.AdminGate><m.AdminUsers {...p} /></m.AdminGate> }))),
  Account: lazy(() => import("@/pages/admin").then((m) => ({ default: (p: any) => <m.AdminGate><m.AdminAccount {...p} /></m.AdminGate> }))),
  Security: lazy(() => Promise.all([import("@/pages/admin"), import("@/pages/admin-security")]).then(([m, n]) => ({ default: (p: any) => <m.AdminGate><n.AdminSecurity {...p} /></m.AdminGate> }))),
  Comments: lazy(() => import("@/pages/admin").then((m) => ({ default: (p: any) => <m.AdminGate><m.AdminComments {...p} /></m.AdminGate> }))),
  Add: lazy(() => Promise.all([import("@/pages/admin"), import("@/pages/admin-anime")]).then(([m, n]) => ({ default: (p: any) => <m.AdminGate><n.AdminAdd {...p} /></m.AdminGate> }))),
  Edit: lazy(() => Promise.all([import("@/pages/admin"), import("@/pages/admin-anime")]).then(([m, n]) => ({ default: (p: any) => <m.AdminGate><n.AdminEdit {...p} /></m.AdminGate> }))),
};
import { Link } from "wouter";
import { Button } from "@/components/ui/button";

function NotFound() {
  return (
    <PublicShell>
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <EmptyState title="Halaman tidak ditemukan" action={<Button asChild variant="outline"><Link href="/">Ke beranda</Link></Button>} />
      </div>
    </PublicShell>
  );
}

const admin = (C: any) => (p: any) => (
  <Suspense fallback={<div className="grid min-h-screen place-items-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>}>
    <C {...p} />
  </Suspense>
);

function AppRouter() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/browse" component={Browse} />
      <Route path="/season" component={SeasonPage} />
      <Route path="/genres" component={GenresPage} />
      <Route path="/anime/:malId" component={AnimePage} />
      <Route path="/admin" component={admin(A.Overview)} />
      <Route path="/admin/anime" component={admin(A.List)} />
      <Route path="/admin/anime/:malId" component={admin(A.Edit)} />
      <Route path="/admin/add" component={admin(A.Add)} />
      <Route path="/admin/comments" component={admin(A.Comments)} />
      <Route path="/admin/security" component={admin(A.Security)} />
      <Route path="/admin/settings" component={admin(A.Settings)} />
      <Route path="/admin/users" component={admin(A.Users)} />
      <Route path="/admin/account" component={admin(A.Account)} />
      <Route component={NotFound} />
    </Switch>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppProvider>
        <TooltipProvider>
          <Toaster />
          <Router hook={useHashLocation}>
            <AppRouter />
          </Router>
        </TooltipProvider>
      </AppProvider>
    </QueryClientProvider>
  );
}
