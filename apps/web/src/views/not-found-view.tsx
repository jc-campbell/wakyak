import { Link } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";

export function NotFoundView() {
  return (
    <section className="form-page text-center">
      <div>
        <p className="section-kicker">404 / Quiet over here</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight">
          Nothing to hear yet.
        </h1>
        <Button asChild className="mt-6 rounded-full px-5">
          <Link to="/">Return home</Link>
        </Button>
      </div>
    </section>
  );
}
