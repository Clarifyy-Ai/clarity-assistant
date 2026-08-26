import { Link, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { usePageMeta } from "@/hooks/usePageMeta";
import { MarketingLayout } from "@/components/layout/MarketingLayout";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { AppTopBar } from "@/components/layout/AppTopBar";
import { MobileNav } from "@/components/layout/MobileNav";
import { NetworkBanner } from "@/components/layout/NetworkBanner";
import { useAuthStore } from "@/store/authStore";
import { Button } from "@/components/ui/Button";
import { ArrowLeft, Home, LayoutDashboard, HelpCircle } from "lucide-react";

function NotFoundContent({ isAuthenticated }: { isAuthenticated: boolean }) {
  const location = useLocation();

  return (
    <div className="max-w-lg mx-auto text-center py-16">
      <p className="text-6xl font-black text-primary/20 mb-2">404</p>
      <h1 className="text-2xl font-bold mb-2">Page not found</h1>
      <p className="text-sm text-muted-foreground mb-8">
        We couldn&apos;t find{" "}
        <code className="text-xs bg-secondary px-1.5 py-0.5 rounded">{location.pathname}</code>.
        It may have moved or no longer exists.
      </p>

      <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
        <Link to="/">
          <Button variant="primary" size="md" leftIcon={<Home className="w-4 h-4" />}>
            Go Home
          </Button>
        </Link>

        {isAuthenticated && (
          <Link to="/app/dashboard">
            <Button
              variant="secondary"
              size="md"
              leftIcon={<LayoutDashboard className="w-4 h-4" />}
            >
              Go Dashboard
            </Button>
          </Link>
        )}

        <Link to="/help">
          <Button variant="outline" size="md" leftIcon={<HelpCircle className="w-4 h-4" />}>
            Help center
          </Button>
        </Link>

        {!isAuthenticated && (
          <Link to="/login">
            <Button variant="ghost" size="md" leftIcon={<ArrowLeft className="w-4 h-4" />}>
              Log in
            </Button>
          </Link>
        )}
      </div>
    </div>
  );
}

export default function NotFound() {
  const location = useLocation();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  usePageMeta({
    title: "Page not found — Clarify AI",
    description: "The page you're looking for doesn't exist.",
    noIndex: true,
  });

  useEffect(() => {
    console.debug("[404]", location.pathname);
  }, [location.pathname]);

  if (isAuthenticated) {
    return (
      <div className="flex h-[100vh] w-full overflow-hidden bg-background">
        <AppSidebar />
        <div className="flex flex-1 flex-col overflow-hidden min-w-0">
          <AppTopBar />
          <NetworkBanner />
          <main id="main-content" className="flex-1 overflow-y-auto pb-16 md:pb-0">
            <div className="max-w-7xl mx-auto px-3 sm:px-4 md:px-6 lg:px-8 py-4 md:py-6">
              <NotFoundContent isAuthenticated />
            </div>
          </main>
        </div>
        <MobileNav />
      </div>
    );
  }

  return (
    <MarketingLayout>
      <section className="pt-32 pb-24 px-6">
        <NotFoundContent isAuthenticated={false} />
      </section>
    </MarketingLayout>
  );
}
