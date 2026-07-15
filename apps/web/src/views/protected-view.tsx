import { useSuspenseQuery } from "@tanstack/react-query";
import { useNavigate, useRouter } from "@tanstack/react-router";
import { LoaderCircle, LockKeyhole, LogOut, ShieldCheck } from "lucide-react";
import { useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { authClient } from "@/lib/auth-client";
import { meQueryOptions } from "@/lib/api";
import { queryClient } from "@/lib/query-client";

export function ProtectedView() {
  const { data: me } = useSuspenseQuery(meQueryOptions);
  const navigate = useNavigate();
  const router = useRouter();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [error, setError] = useState<string>();

  async function handleSignOut() {
    setError(undefined);
    setIsSigningOut(true);
    const result = await authClient.signOut();

    if (result.error) {
      setError(result.error.message ?? "Could not sign out.");
      setIsSigningOut(false);
      return;
    }

    queryClient.clear();
    await router.invalidate();
    await navigate({ to: "/" });
  }

  return (
    <section className="protected-page">
      <div className="protected-intro">
        <div className="status-lock" aria-hidden="true">
          <LockKeyhole />
        </div>
        <p className="section-kicker">Protected route / pass</p>
        <h1>You made it through.</h1>
        <p>Authentication is valid and the required WakYak profile exists.</p>
      </div>

      <Card className="protected-card">
        <CardHeader>
          <ShieldCheck className="mb-2 size-6 text-primary" />
          <CardTitle>Route guard passed</CardTitle>
          <CardDescription>
            This information came from the authenticated <code>/v1/me</code>
            endpoint.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="profile-readout">
            <div>
              <dt>Display name</dt>
              <dd>{me.profile!.displayName}</dd>
            </div>
            <div>
              <dt>Handle</dt>
              <dd>@{me.profile!.handle}</dd>
            </div>
            <div>
              <dt>User ID</dt>
              <dd>{me.profile!.userId}</dd>
            </div>
            <div>
              <dt>Email</dt>
              <dd>{me.user.email}</dd>
            </div>
          </dl>

          {error ? (
            <Alert className="mt-4" variant="destructive">
              <AlertTitle>Sign out failed</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
        </CardContent>
        <CardFooter>
          <Button
            type="button"
            variant="outline"
            onClick={handleSignOut}
            disabled={isSigningOut}
          >
            {isSigningOut ? (
              <LoaderCircle className="animate-spin" />
            ) : (
              <LogOut />
            )}
            Sign out
          </Button>
        </CardFooter>
      </Card>
    </section>
  );
}
