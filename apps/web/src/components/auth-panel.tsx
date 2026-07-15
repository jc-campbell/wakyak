import { useState, type FormEvent } from "react";
import { Link, useNavigate, useRouter } from "@tanstack/react-router";
import { CircleCheck, LoaderCircle } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { authClient } from "@/lib/auth-client";
import { meQueryOptions } from "@/lib/api";
import { queryClient } from "@/lib/query-client";

interface AuthPanelProps {
  mode: "sign-in" | "sign-up";
}

function GoogleMark() {
  return (
    <span
      aria-hidden="true"
      className="grid size-5 place-items-center rounded-full border border-current/20 bg-white font-semibold text-[#356ae6]"
    >
      G
    </span>
  );
}

export function AuthPanel({ mode }: AuthPanelProps) {
  const isSignUp = mode === "sign-up";
  const navigate = useNavigate();
  const router = useRouter();
  const [error, setError] = useState<string>();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGooglePending, setIsGooglePending] = useState(false);
  const [signupEmail, setSignupEmail] = useState<string>();

  async function handlePasswordSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(undefined);
    setIsSubmitting(true);

    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "");
    const password = String(form.get("password") ?? "");

    try {
      if (isSignUp) {
        const result = await authClient.signUp.email({
          name: String(form.get("name") ?? ""),
          email,
          password,
          callbackURL: `${window.location.origin}/sign-in`,
        });

        if (result.error) {
          setError(result.error.message ?? "Could not create the account.");
          return;
        }

        setSignupEmail(email);
        return;
      }

      const result = await authClient.signIn.email({
        email,
        password,
        callbackURL: `${window.location.origin}/protected`,
      });

      if (result.error) {
        setError(
          result.error.status === 403
            ? "Verify your email before signing in. We sent you a fresh verification link."
            : (result.error.message ?? "Could not sign in."),
        );
        return;
      }

      await queryClient.invalidateQueries({
        queryKey: meQueryOptions.queryKey,
      });
      await router.invalidate();
      await navigate({ to: "/protected" });
    } catch {
      setError("The authentication service could not be reached.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleGoogle() {
    setError(undefined);
    setIsGooglePending(true);

    try {
      const result = await authClient.signIn.social({
        provider: "google",
        callbackURL: `${window.location.origin}/protected`,
      });
      if (result.error) {
        setError(result.error.message ?? "Could not continue with Google.");
        setIsGooglePending(false);
      }
    } catch {
      setError("Google sign-in could not be started.");
      setIsGooglePending(false);
    }
  }

  if (signupEmail) {
    return (
      <Card className="auth-card">
        <CardHeader>
          <div className="mb-3 grid size-10 place-items-center rounded-full bg-primary text-primary-foreground">
            <CircleCheck className="size-5" />
          </div>
          <CardTitle className="text-2xl">Check your inbox</CardTitle>
          <CardDescription className="leading-relaxed">
            We sent a verification link to <strong>{signupEmail}</strong>.
            Verify your email, then come back to sign in.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild className="h-10 w-full">
            <Link to="/sign-in">Go to sign in</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="auth-card">
      <CardHeader>
        <p className="section-kicker">
          {isSignUp ? "New here" : "Welcome back"}
        </p>
        <CardTitle className="text-2xl">
          {isSignUp ? "Create your account" : "Sign in to WakYak"}
        </CardTitle>
        <CardDescription>
          {isSignUp
            ? "Start with Google or create a password account."
            : "Use Google or your email and password."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button
          type="button"
          variant="outline"
          className="h-10 w-full"
          disabled={isGooglePending || isSubmitting}
          onClick={handleGoogle}
        >
          {isGooglePending ? (
            <LoaderCircle className="animate-spin" />
          ) : (
            <GoogleMark />
          )}
          Continue with Google
        </Button>

        <div className="my-5 flex items-center gap-3 text-xs font-medium tracking-[0.18em] text-muted-foreground uppercase">
          <Separator className="flex-1" />
          or
          <Separator className="flex-1" />
        </div>

        <form className="space-y-4" onSubmit={handlePasswordSubmit}>
          {isSignUp ? (
            <div className="form-field">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                name="name"
                autoComplete="name"
                className="h-10"
                required
              />
            </div>
          ) : null}

          <div className="form-field">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              className="h-10"
              required
            />
          </div>

          <div className="form-field">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete={isSignUp ? "new-password" : "current-password"}
              minLength={8}
              maxLength={128}
              className="h-10"
              required
            />
            {isSignUp ? (
              <p className="field-note">Use at least 8 characters.</p>
            ) : null}
          </div>

          {error ? (
            <Alert variant="destructive">
              <AlertTitle>Authentication failed</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          <Button
            type="submit"
            className="h-10 w-full"
            disabled={isSubmitting || isGooglePending}
          >
            {isSubmitting ? <LoaderCircle className="animate-spin" /> : null}
            {isSignUp ? "Create password account" : "Sign in with password"}
          </Button>
        </form>

        <p className="mt-5 text-center text-sm text-muted-foreground">
          {isSignUp ? "Already have an account?" : "Need an account?"}{" "}
          <Link
            className="font-medium text-foreground underline underline-offset-4"
            to={isSignUp ? "/sign-in" : "/sign-up"}
          >
            {isSignUp ? "Sign in" : "Sign up"}
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
