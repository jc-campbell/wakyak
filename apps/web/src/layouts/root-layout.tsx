import { Link, Outlet } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";

export function RootLayout() {
  return (
    <div className="app-shell">
      <header className="site-header">
        <Link className="brand-mark" to="/" aria-label="WakYak home">
          <span className="brand-dot" aria-hidden="true" />
          WakYak
        </Link>
        <nav className="flex items-center gap-1" aria-label="Account">
          <Button asChild variant="ghost">
            <Link to="/sign-in">Sign in</Link>
          </Button>
          <Button asChild className="rounded-full px-4">
            <Link to="/sign-up">Sign up</Link>
          </Button>
        </nav>
      </header>
      <main className="page-main">
        <Outlet />
      </main>
    </div>
  );
}
