import { useMutation, useSuspenseQuery } from "@tanstack/react-query";
import { Link, useNavigate, useRouter } from "@tanstack/react-router";
import { CircleCheck, LoaderCircle, UserRound } from "lucide-react";
import type { FormEvent } from "react";

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
import {
  ApiError,
  createProfile,
  meQueryOptions,
  type MeResponse,
} from "@/lib/api";
import { queryClient } from "@/lib/query-client";

export function ProfileView() {
  const { data: me } = useSuspenseQuery(meQueryOptions);
  const navigate = useNavigate();
  const router = useRouter();
  const profileMutation = useMutation({
    mutationFn: createProfile,
    onSuccess: async (profile) => {
      queryClient.setQueryData<MeResponse>(meQueryOptions.queryKey, {
        ...me,
        profile,
      });
      await router.invalidate();
      await navigate({ to: "/protected" });
    },
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    profileMutation.mutate({
      displayName: String(form.get("displayName") ?? ""),
      userId: String(form.get("userId") ?? ""),
      handle: String(form.get("handle") ?? ""),
    });
  }

  if (me.profile) {
    return (
      <section className="form-page">
        <Card className="auth-card">
          <CardHeader>
            <div className="mb-3 grid size-10 place-items-center rounded-full bg-primary text-primary-foreground">
              <CircleCheck className="size-5" />
            </div>
            <CardTitle className="text-2xl">Profile complete</CardTitle>
            <CardDescription>
              You&rsquo;re @{me.profile.handle}. The protected test is ready.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild className="h-10 w-full">
              <Link to="/protected">Open protected route</Link>
            </Button>
          </CardContent>
        </Card>
      </section>
    );
  }

  const mutationMessage =
    profileMutation.error instanceof ApiError
      ? profileMutation.error.message
      : profileMutation.error
        ? "The profile could not be saved."
        : undefined;

  return (
    <section className="form-page">
      <Card className="auth-card">
        <CardHeader>
          <div className="mb-3 grid size-10 place-items-center rounded-full bg-accent text-accent-foreground">
            <UserRound className="size-5" />
          </div>
          <p className="section-kicker">One quick thing</p>
          <CardTitle className="text-2xl">Finish your profile</CardTitle>
          <CardDescription className="leading-relaxed">
            You&rsquo;re signed in as {me.user.email}. Complete these required
            fields before entering protected areas.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="form-field">
              <Label htmlFor="displayName">Display name</Label>
              <Input
                id="displayName"
                name="displayName"
                autoComplete="name"
                minLength={1}
                maxLength={80}
                className="h-10"
                required
              />
              <p className="field-note">The name other people will see.</p>
            </div>

            <div className="form-field">
              <Label htmlFor="userId">User ID</Label>
              <Input
                id="userId"
                name="userId"
                autoComplete="off"
                minLength={3}
                maxLength={32}
                pattern="[A-Za-z](?:[A-Za-z0-9]|-(?!-))*[A-Za-z0-9]"
                placeholder="river-walker"
                className="h-10"
                required
              />
              <p className="field-note">
                3–32 letters, numbers, or single hyphens. This cannot be changed
                later.
              </p>
            </div>

            <div className="form-field">
              <Label htmlFor="handle">Handle</Label>
              <div className="relative">
                <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-muted-foreground">
                  @
                </span>
                <Input
                  id="handle"
                  name="handle"
                  autoComplete="off"
                  minLength={3}
                  maxLength={30}
                  pattern="[A-Za-z][A-Za-z0-9_]*"
                  placeholder="river_walker"
                  className="h-10 pl-7"
                  required
                />
              </div>
              <p className="field-note">
                3–30 letters, numbers, or underscores.
              </p>
            </div>

            {mutationMessage ? (
              <Alert variant="destructive">
                <AlertTitle>Could not save profile</AlertTitle>
                <AlertDescription>{mutationMessage}</AlertDescription>
              </Alert>
            ) : null}

            <Button
              type="submit"
              className="h-10 w-full"
              disabled={profileMutation.isPending}
            >
              {profileMutation.isPending ? (
                <LoaderCircle className="animate-spin" />
              ) : null}
              Save profile and continue
            </Button>
          </form>
        </CardContent>
      </Card>
    </section>
  );
}
