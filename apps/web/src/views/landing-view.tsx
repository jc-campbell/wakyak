import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";

export function LandingView() {
  return (
    <section className="landing-stage">
      <div className="hero-copy">
        <p className="section-kicker hero-enter hero-enter-1">
          Open testbed / 01
        </p>
        <h1 className="hero-title hero-enter hero-enter-2">WakYak</h1>
        <p className="hero-line hero-enter hero-enter-3">
          Say what&rsquo;s on your mind. See what comes back.
        </p>
        <p className="hero-support hero-enter hero-enter-3">
          A deliberately small social app for proving the important parts:
          identity, profiles, and protected spaces.
        </p>
        <div className="hero-actions hero-enter hero-enter-4">
          <Button asChild className="h-11 rounded-full px-5 text-sm">
            <Link to="/sign-up">
              Create an account
              <ArrowRight />
            </Link>
          </Button>
          <Button
            asChild
            variant="outline"
            className="h-11 rounded-full border-foreground/20 bg-transparent px-5 text-sm"
          >
            <Link to="/sign-in">Sign in</Link>
          </Button>
        </div>
      </div>

      <div className="signal-stage" aria-hidden="true">
        <div className="signal-ring signal-ring-one" />
        <div className="signal-ring signal-ring-two" />
        <div className="signal-ring signal-ring-three" />
        <div className="signal-core">
          <span>W</span>
        </div>
        <div className="signal-caption">YOUR VOICE / OUT THERE</div>
      </div>
    </section>
  );
}
