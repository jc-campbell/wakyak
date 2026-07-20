import type {
  AnonymousIdentity,
  BlockDto,
  CommentDto,
  FeedFilter,
  FeedMode,
  NotificationActor,
  NotificationDto,
  PostDto,
  ProfileDetails,
  PublicAuthor,
  SettingsDto,
  TopWindow,
} from "@wakyak/contracts";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useSuspenseQuery,
  type InfiniteData,
} from "@tanstack/react-query";
import {
  Link,
  Outlet,
  useNavigate,
  useRouter,
  useRouterState,
} from "@tanstack/react-router";
import {
  ArrowLeft,
  Bell,
  BellOff,
  Check,
  ChevronDown,
  ChevronUp,
  Feather,
  Home,
  Image as ImageIcon,
  KeyRound,
  LoaderCircle,
  MessageCircle,
  Moon,
  MoreHorizontal,
  Settings,
  Sun,
  UserRound,
  Users,
  X,
} from "lucide-react";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type ReactNode,
} from "react";

import { api, resolveApiUrl } from "@/lib/api";
import { authClient } from "@/lib/auth-client";
import { queryClient } from "@/lib/query-client";
import { errorMessage } from "@/lib/presentation";
import {
  authConfigQuery,
  adminAccessQuery,
  commentsQuery,
  feedQuery,
  keys,
  meQuery,
  notificationsQuery,
  repliesQuery,
} from "@/lib/queries";
import { queuePostSeen } from "@/lib/seen";

type ComposeTarget =
  | { type: "post" }
  | { type: "reply"; postId: string; parentCommentId?: string };
type BlockIntent = {
  sourceType: "post" | "comment" | "notification" | "profile";
  sourceId: string;
  label: string;
  identity?: AnonymousIdentity;
};

interface AppActions {
  compose: (target: ComposeTarget) => void;
  block: (intent: BlockIntent) => void;
  hidden: (sourceType: BlockIntent["sourceType"], sourceId: string) => boolean;
  viewer: PublicAuthor;
}

const AppActionsContext = createContext<AppActions | null>(null);
const useAppActions = () => {
  const value = useContext(AppActionsContext);
  if (!value) throw new Error("App actions are unavailable.");
  return value;
};

function initialDarkMode(): boolean {
  try {
    const stored = localStorage.getItem("wakyak-color-mode");
    if (stored) return stored === "dark";
  } catch {
    // Use the OS preference when storage is unavailable.
  }
  return matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
}

export function RootLayout() {
  const navigate = useNavigate();
  const [dark, setDark] = useState(initialDarkMode);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    try {
      localStorage.setItem("wakyak-color-mode", dark ? "dark" : "light");
    } catch {
      // Theme remains active for the current session.
    }
  }, [dark]);
  useEffect(() => {
    const handleExpiredSession = () => {
      const redirect = `${location.pathname}${location.search}${location.hash}`;
      queryClient.clear();
      void navigate({
        to: "/sign-in",
        search: {
          redirect: redirect.startsWith("/sign-in") ? undefined : redirect,
        },
        replace: true,
      });
    };
    addEventListener("wakyak:unauthenticated", handleExpiredSession);
    return () =>
      removeEventListener("wakyak:unauthenticated", handleExpiredSession);
  }, [navigate]);
  return (
    <ThemeContext.Provider
      value={{ dark, toggle: () => setDark((value) => !value) }}
    >
      <Outlet />
    </ThemeContext.Provider>
  );
}

const ThemeContext = createContext<{ dark: boolean; toggle: () => void }>({
  dark: false,
  toggle: () => undefined,
});

export function MemberLayout() {
  const { data: me } = useSuspenseQuery(meQuery);
  const adminAccess = useQuery(adminAccessQuery);
  const navigate = useNavigate();
  const path = useRouterState({ select: (state) => state.location.pathname });
  const [composeTarget, setComposeTarget] = useState<ComposeTarget>();
  const [blockIntent, setBlockIntent] = useState<BlockIntent>();
  const [toast, setToast] = useState<{ message: string; block?: BlockDto }>();
  const [hiddenSources, setHiddenSources] = useState(() => new Set<string>());
  const { dark } = useContext(ThemeContext);
  const viewer = me.profile!;

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(undefined), 4_500);
    return () => clearTimeout(timeout);
  }, [toast]);

  const confirmBlock = async () => {
    if (!blockIntent) return;
    const intent = blockIntent;
    setBlockIntent(undefined);
    setHiddenSources((current) =>
      new Set(current).add(`${intent.sourceType}:${intent.sourceId}`),
    );
    try {
      const block = await api.block(intent);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: keys.feeds }),
        queryClient.invalidateQueries({ queryKey: ["notifications"] }),
        queryClient.invalidateQueries({ queryKey: keys.profiles }),
        queryClient.invalidateQueries({ queryKey: keys.blocks }),
      ]);
      setToast({ message: `${block.displaySnapshot.label} blocked`, block });
    } catch (error) {
      setHiddenSources((current) => {
        const next = new Set(current);
        next.delete(`${intent.sourceType}:${intent.sourceId}`);
        return next;
      });
      setToast({ message: errorMessage(error) });
    }
  };

  const undo = async (block: BlockDto) => {
    try {
      await api.unblock(block.blockId);
      setHiddenSources(new Set());
      await queryClient.invalidateQueries();
      setToast({ message: "Block undone" });
    } catch (error) {
      setToast({ message: errorMessage(error) });
    }
  };

  return (
    <AppActionsContext.Provider
      value={{
        compose: setComposeTarget,
        block: setBlockIntent,
        hidden: (sourceType, sourceId) =>
          hiddenSources.has(`${sourceType}:${sourceId}`),
        viewer,
      }}
    >
      <div className="relative isolate min-h-dvh overflow-x-clip bg-stone-100 text-stone-950">
        <div className="pointer-events-none fixed -right-40 -top-64 -z-10 aspect-square w-[38rem] rounded-full bg-teal-300/20 blur-3xl max-md:hidden" />
        <div className="mx-auto grid min-h-dvh max-w-5xl grid-cols-[15rem_minmax(0,42rem)] justify-center max-md:block">
          <DesktopNav
            path={path}
            viewer={viewer}
            canAccessAdmin={adminAccess.isSuccess}
            onPost={() => setComposeTarget({ type: "post" })}
          />
          <main className="min-w-0 border-x border-stone-200 bg-white/95 shadow-sm max-md:border-x-0 max-md:pb-20">
            <div className="motion-safe:animate-[screen-enter_220ms_ease-out_both]">
              <Outlet />
            </div>
          </main>
        </div>
        <MobileNav
          path={path}
          onPost={() => setComposeTarget({ type: "post" })}
        />
        {composeTarget ? (
          <Composer
            target={composeTarget}
            onClose={() => setComposeTarget(undefined)}
          />
        ) : null}
        {blockIntent ? (
          <Modal
            title={`Block ${blockIntent.label}?`}
            onClose={() => setBlockIntent(undefined)}
          >
            <div className="p-5">
              <p className="text-sm leading-relaxed text-stone-600">
                You will stop seeing each other’s content and notifications.
                Existing follows are removed.
              </p>
              <div className="mt-5 flex justify-end gap-2">
                <button
                  className="rounded-xl px-4 py-2 text-xs font-bold text-stone-600"
                  onClick={() => setBlockIntent(undefined)}
                >
                  Cancel
                </button>
                <button
                  className="rounded-xl bg-red-600 px-4 py-2 text-xs font-bold text-white"
                  onClick={() => void confirmBlock()}
                >
                  Block
                </button>
              </div>
            </div>
          </Modal>
        ) : null}
        {toast ? (
          <div
            className="fixed left-1/2 top-5 z-[250] flex -translate-x-1/2 items-center gap-3 rounded-full bg-stone-950 px-4 py-2.5 text-xs font-semibold text-white shadow-xl"
            role="status"
          >
            <span className="flex items-center gap-2">
              <Check className="size-4" />
              {toast.message}
            </span>
            {toast.block ? (
              <button
                className="font-bold text-teal-300"
                onClick={() => void undo(toast.block!)}
              >
                Undo
              </button>
            ) : null}
          </div>
        ) : null}
        <span className="hidden">{hiddenSources.size}</span>
      </div>
      <button
        className="sr-only"
        onClick={() =>
          void navigate({
            to: "/feed/$mode",
            params: { mode: "hot" },
            search: { filter: "all", window: "week" },
          })
        }
      >
        Home
      </button>
      <span className="sr-only">Theme is {dark ? "dark" : "light"}</span>
    </AppActionsContext.Provider>
  );
}

function DesktopNav({
  path,
  viewer,
  canAccessAdmin,
  onPost,
}: {
  path: string;
  viewer: PublicAuthor;
  canAccessAdmin: boolean;
  onPost: () => void;
}) {
  return (
    <aside className="max-md:hidden">
      <nav
        className="sticky top-0 flex h-dvh flex-col px-3 py-5"
        aria-label="Primary navigation"
      >
        <Link
          to="/feed/$mode"
          params={{ mode: "hot" }}
          search={{ filter: "all", window: "week" }}
          className="rounded-xl p-2 hover:bg-white/60"
        >
          <Brand />
        </Link>
        <div className="mt-14 space-y-1.5">
          <NavLink
            to="/feed/$mode"
            params={{ mode: "hot" }}
            active={path.startsWith("/feed") || path.startsWith("/posts")}
            icon={<Home />}
            label="Home"
          />
          <NavLink
            to="/notifications"
            active={path.startsWith("/notifications")}
            icon={<Bell />}
            label="Notifications"
          />
          <NavLink
            to="/profiles/$profileId"
            params={{ profileId: viewer.userId }}
            active={
              path.startsWith("/profiles") ||
              path.startsWith("/me/") ||
              path.startsWith("/settings")
            }
            icon={<UserRound />}
            label="Profile"
          />
          {canAccessAdmin ? (
            <NavLink
              to="/admin/invitations"
              active={path.startsWith("/admin")}
              icon={<KeyRound />}
              label="Invitations"
            />
          ) : null}
        </div>
        <button
          className="mt-8 flex items-center justify-center gap-2 rounded-xl bg-teal-600 px-4 py-3 text-sm font-bold text-white shadow-sm"
          onClick={onPost}
        >
          <Feather className="size-4" />
          Post
        </button>
        <Link
          to="/profiles/$profileId"
          params={{ profileId: viewer.userId }}
          search={{ tab: "posts" }}
          className="mt-auto flex items-center gap-3 rounded-xl p-2 hover:bg-white/60"
        >
          <Avatar author={viewer} />
          <span className="min-w-0">
            <strong className="block truncate text-xs">
              {viewer.displayName}
            </strong>
            <small className="block truncate text-[.65rem] text-stone-500">
              @{viewer.handle}
            </small>
          </span>
        </Link>
      </nav>
    </aside>
  );
}

function NavLink({
  to,
  params,
  active,
  icon,
  label,
}: {
  to: string;
  params?: Record<string, string>;
  active: boolean;
  icon: ReactNode;
  label: string;
}) {
  return (
    <Link
      to={to as never}
      params={params as never}
      data-active={active}
      className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold text-stone-500 transition data-[active=true]:bg-white data-[active=true]:text-stone-950 data-[active=true]:shadow-sm [&>svg]:size-5"
    >
      {icon}
      {label}
    </Link>
  );
}

function MobileNav({ path, onPost }: { path: string; onPost: () => void }) {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t border-stone-200 bg-white/95 px-3 py-2 backdrop-blur md:hidden"
      aria-label="Mobile navigation"
    >
      <Link
        to="/feed/$mode"
        params={{ mode: "hot" }}
        search={{ filter: "all", window: "week" }}
        aria-label="Home"
        className={mobileNavClass(
          path.startsWith("/feed") || path.startsWith("/posts"),
        )}
      >
        <Home />
      </Link>
      <Link
        to="/notifications"
        search={{ state: "all" }}
        aria-label="Notifications"
        className={mobileNavClass(path.startsWith("/notifications"))}
      >
        <Bell />
      </Link>
      <Link
        to="/profiles/$profileId"
        params={{ profileId: useAppActions().viewer.userId }}
        search={{ tab: "posts" }}
        aria-label="Profile"
        className={mobileNavClass(path.startsWith("/profiles"))}
      >
        <UserRound />
      </Link>
      <button
        aria-label="Create post"
        className="mx-auto grid size-11 place-items-center rounded-xl bg-teal-600 text-white shadow-lg"
        onClick={onPost}
      >
        <Feather className="size-5" />
      </button>
    </nav>
  );
}

const mobileNavClass = (active: boolean) =>
  `mx-auto grid size-11 place-items-center rounded-xl ${active ? "text-stone-950" : "text-stone-400"} [&>svg]:size-5`;

function Brand() {
  return (
    <span className="flex items-center gap-2.5" aria-label="WakYak">
      <span className="grid size-8 -rotate-3 place-items-center rounded-[.65rem_.65rem_.65rem_.2rem] bg-teal-600 text-xs font-black text-white shadow-sm">
        W
      </span>
      <strong className="text-lg tracking-tight">WakYak</strong>
    </span>
  );
}

export function ScreenHeader({
  title,
  subtitle,
  back,
  action,
}: {
  title: string;
  subtitle?: string;
  back?: () => void;
  action?: ReactNode;
}) {
  const { dark, toggle } = useContext(ThemeContext);
  return (
    <header className="sticky top-0 z-30 flex min-h-16 items-center gap-3 border-b border-stone-200 bg-white/90 px-4 backdrop-blur">
      {back ? (
        <button
          aria-label="Go back"
          className="grid size-9 place-items-center rounded-xl hover:bg-stone-100"
          onClick={back}
        >
          <ArrowLeft className="size-4" />
        </button>
      ) : null}
      <div className="min-w-0 flex-1">
        <h1 className="text-lg font-bold tracking-tight">{title}</h1>
        {subtitle ? (
          <p className="text-[.65rem] text-stone-500">{subtitle}</p>
        ) : null}
      </div>
      {action}
      <button
        aria-label={dark ? "Use light mode" : "Use dark mode"}
        className="grid size-9 place-items-center rounded-xl text-stone-500 hover:bg-stone-100"
        onClick={toggle}
      >
        {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
      </button>
      <Link
        to="/settings"
        aria-label="Settings"
        className="grid size-9 place-items-center rounded-xl text-stone-500 hover:bg-stone-100"
      >
        <Settings className="size-4" />
      </Link>
    </header>
  );
}

export function LoadingRows() {
  return (
    <div className="divide-y divide-stone-200" aria-label="Loading">
      <div className="h-36 animate-pulse bg-stone-50" />
      <div className="h-44 animate-pulse bg-stone-50/60" />
      <div className="h-36 animate-pulse bg-stone-50" />
    </div>
  );
}

export function ErrorState({
  error,
  retry,
}: {
  error: unknown;
  retry?: () => void;
}) {
  return (
    <div className="px-5 py-14 text-center">
      <strong className="block text-sm">Something went wrong</strong>
      <p className="mx-auto mt-2 max-w-sm text-xs leading-relaxed text-stone-500">
        {errorMessage(error)}
      </p>
      {retry ? (
        <button
          className="mt-4 rounded-xl border border-stone-200 px-4 py-2 text-xs font-bold"
          onClick={retry}
        >
          Try again
        </button>
      ) : null}
    </div>
  );
}

export function EmptyState({
  title,
  detail,
}: {
  title: string;
  detail: string;
}) {
  return (
    <div className="px-5 py-14 text-center">
      <strong className="block text-sm">{title}</strong>
      <p className="mx-auto mt-2 max-w-sm text-xs leading-relaxed text-stone-500">
        {detail}
      </p>
    </div>
  );
}

function formatRelativeTime(value: string): string {
  const seconds = Math.max(
    0,
    Math.round((Date.now() - Date.parse(value)) / 1_000),
  );
  if (seconds < 60) return "now";
  if (seconds < 3_600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3_600)}h`;
  if (seconds < 604_800) return `${Math.floor(seconds / 86_400)}d`;
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

function initials(value: string): string {
  return value
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function Avatar({
  author,
  anonymous,
  large = false,
}: {
  author?: PublicAuthor;
  anonymous?: AnonymousIdentity;
  large?: boolean;
}) {
  const label = anonymous?.emoji ?? initials(author?.displayName ?? "Account");
  const style = anonymous?.color
    ? ({ backgroundColor: anonymous.color } as CSSProperties)
    : undefined;
  if (author?.avatarUrl)
    return (
      <img
        src={resolveApiUrl(author.avatarUrl)}
        alt=""
        className={`${large ? "size-20 rounded-2xl" : "size-10 rounded-xl"} shrink-0 object-cover`}
      />
    );
  return (
    <span
      style={style}
      className={`${large ? "size-20 rounded-2xl text-xl" : "size-10 rounded-xl text-xs"} grid shrink-0 place-items-center bg-teal-700 font-bold text-white shadow-sm`}
    >
      {label}
    </span>
  );
}

function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  useEffect(() => {
    const close = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    addEventListener("keydown", close);
    return () => removeEventListener("keydown", close);
  }, [onClose]);
  return (
    <div
      className="fixed inset-0 z-[200] grid place-items-center bg-stone-950/40 p-4"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-2xl border border-stone-200 bg-white shadow-2xl"
      >
        <header className="flex items-center border-b border-stone-200 px-5 py-4">
          <h2 className="font-bold">{title}</h2>
          <button
            aria-label="Close"
            className="ml-auto grid size-8 place-items-center rounded-lg hover:bg-stone-100"
            onClick={onClose}
          >
            <X className="size-4" />
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}

export function AuthScreen({
  mode,
  redirect,
}: {
  mode: "sign-in" | "sign-up";
  redirect?: string;
}) {
  const navigate = useNavigate();
  const router = useRouter();
  const { data: config } = useQuery(authConfigQuery);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const [sentTo, setSentTo] = useState<string>();
  const [resendState, setResendState] = useState<
    "idle" | "sending" | "sent" | "failed"
  >("idle");
  const isSignup = mode === "sign-up";
  const justVerified =
    !isSignup && new URLSearchParams(location.search).get("verified") === "1";

  const finishSignIn = async () => {
    await queryClient.invalidateQueries({ queryKey: keys.me });
    await router.invalidate();
    const me = await api.me();
    if (me.profile && redirect) {
      await navigate({ to: redirect as never });
      return;
    }
    await navigate({
      to: me.profile ? "/feed/$mode" : "/onboarding",
      ...(me.profile ? { params: { mode: "hot" } } : {}),
    } as never);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");
    setPending(true);
    setError(undefined);
    try {
      if (isSignup) {
        const invite = String(form.get("invitation") ?? "").trim();
        if (invite) await api.redeemInvitation(invite);
        const result = await authClient.signUp.email({
          name: String(form.get("name") ?? "").trim(),
          email,
          password,
          callbackURL: `${location.origin}/sign-in?verified=1`,
        });
        if (result.error)
          throw new Error(
            result.error.message ?? "Could not create the account.",
          );
        setSentTo(email);
      } else {
        const result = await authClient.signIn.email({ email, password });
        if (result.error?.status === 403) {
          setSentTo(email);
          return;
        }
        if (result.error)
          throw new Error(result.error.message ?? "Could not sign in.");
        await finishSignIn();
      }
    } catch (value) {
      setError(errorMessage(value));
    } finally {
      setPending(false);
    }
  };

  const google = async () => {
    setError(undefined);
    setPending(true);
    try {
      if (isSignup) {
        const input = document.querySelector<HTMLInputElement>("#invitation");
        if (input?.value.trim()) await api.redeemInvitation(input.value.trim());
      }
      const result = await authClient.signIn.social({
        provider: "google",
        callbackURL: `${location.origin}/`,
      });
      if (result.error)
        throw new Error(
          result.error.message ?? "Google sign-in could not be started.",
        );
    } catch (value) {
      setError(errorMessage(value));
      setPending(false);
    }
  };

  const resendVerification = async () => {
    if (!sentTo) return;
    setResendState("sending");
    const result = await authClient.sendVerificationEmail({
      email: sentTo,
      callbackURL: `${location.origin}/sign-in?verified=1`,
    });
    setResendState(result.error ? "failed" : "sent");
  };

  if (sentTo)
    return (
      <AuthFrame>
        <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
          <span className="mb-4 grid size-10 place-items-center rounded-full bg-teal-600 text-white">
            <Check className="size-5" />
          </span>
          <h1 className="text-2xl font-bold">Check your inbox</h1>
          <p className="mt-2 text-sm leading-relaxed text-stone-600">
            We sent a verification link to <strong>{sentTo}</strong>. Verify
            your email, then return to sign in.
          </p>
          <button
            disabled={resendState === "sending"}
            className="mt-4 text-xs font-bold text-teal-700 disabled:opacity-50"
            onClick={() => void resendVerification()}
          >
            {resendState === "sending"
              ? "Sending…"
              : resendState === "sent"
                ? "Verification email sent"
                : resendState === "failed"
                  ? "Try sending again"
                  : "Resend verification email"}
          </button>
          <Link
            to="/sign-in"
            search={{ redirect: undefined }}
            className="mt-6 block rounded-xl bg-teal-600 px-4 py-3 text-center text-sm font-bold text-white"
          >
            Go to sign in
          </Link>
        </div>
      </AuthFrame>
    );

  return (
    <AuthFrame>
      <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
        <p className="text-[.65rem] font-bold uppercase tracking-[.16em] text-teal-700">
          {isSignup ? "Invitation required" : "Welcome back"}
        </p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">
          {isSignup ? "Join WakYak" : "Sign in to WakYak"}
        </h1>
        <p className="mt-2 text-sm text-stone-500">
          {isSignup
            ? "Redeem your invitation and create an account."
            : "Return to your invitation-only feed."}
        </p>
        {justVerified ? (
          <p className="mt-4 rounded-xl bg-teal-50 px-3 py-2.5 text-xs font-semibold text-teal-800">
            Email verified. You can sign in now.
          </p>
        ) : null}
        {config?.googleEnabled ? (
          <button
            disabled={pending}
            className="mt-6 w-full rounded-xl border border-stone-200 px-4 py-3 text-sm font-bold hover:bg-stone-50"
            onClick={() => void google()}
          >
            Continue with Google
          </button>
        ) : null}
        <form className="mt-5 space-y-4" onSubmit={submit}>
          {isSignup ? (
            <Field
              id="invitation"
              label="Invitation code"
              autoComplete="off"
              required={false}
            />
          ) : null}
          {isSignup ? (
            <Field id="name" label="Name" autoComplete="name" />
          ) : null}
          <Field id="email" label="Email" type="email" autoComplete="email" />
          <Field
            id="password"
            label="Password"
            type="password"
            autoComplete={isSignup ? "new-password" : "current-password"}
            minLength={8}
          />
          {error ? (
            <p
              role="alert"
              className="rounded-xl bg-red-50 px-3 py-2.5 text-xs text-red-700"
            >
              {error}
            </p>
          ) : null}
          <button
            disabled={pending}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-teal-600 px-4 py-3 text-sm font-bold text-white disabled:opacity-50"
          >
            {pending ? <LoaderCircle className="size-4 animate-spin" /> : null}
            {isSignup ? "Create account" : "Sign in"}
          </button>
        </form>
        <p className="mt-5 text-center text-xs text-stone-500">
          {isSignup ? "Already a member?" : "Have an invitation?"}{" "}
          <Link
            to={isSignup ? "/sign-in" : "/sign-up"}
            className="font-bold text-stone-800 underline underline-offset-4"
          >
            {isSignup ? "Sign in" : "Create an account"}
          </Link>
        </p>
      </div>
    </AuthFrame>
  );
}

function AuthFrame({ children }: { children: ReactNode }) {
  const { dark, toggle } = useContext(ThemeContext);
  return (
    <main className="relative grid min-h-dvh place-items-center bg-stone-100 px-4 py-10 text-stone-950">
      <div className="absolute right-5 top-5">
        <button
          aria-label={dark ? "Use light mode" : "Use dark mode"}
          className="grid size-9 place-items-center rounded-xl"
          onClick={toggle}
        >
          {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
        </button>
      </div>
      <div className="w-full max-w-sm">
        <Link
          to="/sign-in"
          search={{ redirect: undefined }}
          className="mb-8 flex justify-center"
        >
          <Brand />
        </Link>
        {children}
      </div>
    </main>
  );
}

function Field({
  id,
  label,
  type = "text",
  required = true,
  ...props
}: {
  id: string;
  label: string;
  type?: string;
  autoComplete?: string;
  minLength?: number;
  required?: boolean;
}) {
  return (
    <label className="block text-xs font-semibold" htmlFor={id}>
      {label}
      <input
        id={id}
        name={id}
        type={type}
        required={required}
        className="mt-1.5 h-11 w-full rounded-xl border border-stone-200 bg-white px-3 text-sm outline-none"
        {...props}
      />
    </label>
  );
}

export function OnboardingScreen() {
  const navigate = useNavigate();
  const router = useRouter();
  const { data: me } = useSuspenseQuery(meQuery);
  const mutation = useMutation({
    mutationFn: api.createProfile,
    onSuccess: async ({ profile }) => {
      queryClient.setQueryData(keys.me, { ...me, profile });
      await router.invalidate();
      await navigate({
        to: "/feed/$mode",
        params: { mode: "hot" },
        search: { filter: "all", window: "week" },
      });
    },
  });
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    mutation.mutate({
      displayName: String(form.get("displayName") ?? ""),
      userId: String(form.get("userId") ?? ""),
      handle: String(form.get("handle") ?? ""),
    });
  };
  return (
    <AuthFrame>
      <form
        className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm"
        onSubmit={submit}
      >
        <p className="text-[.65rem] font-bold uppercase tracking-[.16em] text-teal-700">
          One last step
        </p>
        <h1 className="mt-2 text-2xl font-bold">Create your profile</h1>
        <p className="mt-2 text-sm text-stone-500">
          Signed in as {me.user.email}
        </p>
        <div className="mt-6 space-y-4">
          <Field id="displayName" label="Display name" autoComplete="name" />
          <Field
            id="userId"
            label="Permanent profile ID"
            autoComplete="off"
            minLength={3}
          />
          <Field id="handle" label="Handle" autoComplete="off" minLength={3} />
        </div>
        {mutation.error ? (
          <p className="mt-4 rounded-xl bg-red-50 px-3 py-2.5 text-xs text-red-700">
            {errorMessage(mutation.error)}
          </p>
        ) : null}
        <button
          disabled={mutation.isPending}
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-teal-600 px-4 py-3 text-sm font-bold text-white"
        >
          {mutation.isPending ? (
            <LoaderCircle className="size-4 animate-spin" />
          ) : null}
          Enter WakYak
        </button>
      </form>
    </AuthFrame>
  );
}

export function FeedScreen({
  mode,
  filter,
  window,
}: {
  mode: FeedMode;
  filter: FeedFilter;
  window: TopWindow;
}) {
  const navigate = useNavigate();
  const { compose } = useAppActions();
  const result = useInfiniteQuery(feedQuery(mode, filter, window));
  const posts = result.data?.pages.flatMap((page) => page.posts) ?? [];
  const setMode = (next: FeedMode) =>
    void navigate({
      to: "/feed/$mode",
      params: { mode: next },
      search: { filter, window },
    });
  return (
    <section aria-label="Home feed">
      <ScreenHeader title="Home" subtitle="A small, invitation-only feed" />
      <FeedControls
        mode={mode}
        filter={filter}
        window={window}
        onMode={setMode}
        onFilter={(next) =>
          void navigate({
            to: "/feed/$mode",
            params: { mode },
            search: { filter: next, window },
          })
        }
        onWindow={(next) =>
          void navigate({
            to: "/feed/$mode",
            params: { mode },
            search: { filter, window: next },
          })
        }
      />
      <div className="border-b border-stone-200 px-4 py-3">
        <button
          className="flex w-full items-center gap-3 rounded-xl bg-stone-50 px-3 py-2.5 text-left text-sm text-stone-400 hover:bg-stone-100"
          onClick={() => compose({ type: "post" })}
        >
          <Avatar author={useAppActions().viewer} />
          <span>Share something with the feed…</span>
          <Feather className="ml-auto size-4 text-teal-600" />
        </button>
      </div>
      {result.isLoading ? (
        <LoadingRows />
      ) : result.isError ? (
        <ErrorState error={result.error} retry={() => void result.refetch()} />
      ) : posts.length ? (
        <div className="divide-y divide-stone-200">
          {posts.map((post, index) => (
            <PostCard key={post.id} post={post} index={index} />
          ))}
        </div>
      ) : (
        <EmptyState
          title={
            mode === "following"
              ? "Nothing from people you follow"
              : "You’re caught up"
          }
          detail={
            filter === "unread"
              ? "You’ve already seen everything currently available in this view."
              : "Try another feed view."
          }
        />
      )}
      {result.hasNextPage ? (
        <LoadMore
          pending={result.isFetchingNextPage}
          onClick={() => void result.fetchNextPage()}
        />
      ) : null}
    </section>
  );
}

function FeedControls({
  mode,
  filter,
  window,
  onMode,
  onFilter,
  onWindow,
}: {
  mode: FeedMode;
  filter: FeedFilter;
  window: TopWindow;
  onMode: (value: FeedMode) => void;
  onFilter: (value: FeedFilter) => void;
  onWindow: (value: TopWindow) => void;
}) {
  return (
    <div className="border-b border-stone-200">
      <div className="grid grid-cols-4">
        {(["hot", "new", "top", "following"] as FeedMode[]).map((item) => (
          <button
            key={item}
            data-active={mode === item}
            className="border-b-2 border-transparent px-2 py-3 text-xs font-bold capitalize text-stone-400 data-[active=true]:border-teal-600 data-[active=true]:text-stone-950"
            onClick={() => onMode(item)}
          >
            {item}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2 px-4 py-2.5">
        <button
          data-active={filter === "unread"}
          className="rounded-lg border border-stone-200 px-3 py-1.5 text-[.65rem] font-bold data-[active=true]:bg-teal-50 data-[active=true]:text-teal-700"
          onClick={() => onFilter(filter === "all" ? "unread" : "all")}
        >
          Unread
        </button>
        {mode === "top" ? (
          <select
            aria-label="Top window"
            value={window}
            onChange={(event) => onWindow(event.target.value as TopWindow)}
            className="ml-auto rounded-lg border border-stone-200 bg-white px-2 py-1.5 text-[.65rem]"
          >
            <option value="day">Today</option>
            <option value="week">Week</option>
            <option value="month">Month</option>
            <option value="all">All time</option>
          </select>
        ) : null}
      </div>
      {filter === "unread" ? (
        <p className="px-4 pb-2.5 text-[.65rem] text-stone-500">
          Posts leave this view after they appear on screen.
        </p>
      ) : null}
    </div>
  );
}

function identityFor(
  author: PublicAuthor | null,
  anonymous: AnonymousIdentity | null,
) {
  return author
    ? { label: author.displayName, author }
    : {
        label: "Anonymous",
        anonymous: anonymous ?? {
          emoji: "•",
          color: "#57534e",
          paletteVersion: "v1",
        },
      };
}

function useSeen(ref: React.RefObject<HTMLElement | null>, postId: string) {
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    if (!("IntersectionObserver" in window)) {
      queuePostSeen(postId);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        queuePostSeen(postId);
        observer.disconnect();
      },
      { threshold: 0.35 },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [postId, ref]);
}

function PostCard({
  post,
  index = 0,
  detail = false,
}: {
  post: PostDto;
  index?: number;
  detail?: boolean;
}) {
  const ref = useRef<HTMLElement>(null);
  useSeen(ref, post.id);
  const navigate = useNavigate();
  const { block, hidden } = useAppActions();
  const identity = identityFor(post.author, post.anonymousIdentity);
  const [reaction, setReaction] = useState(post.viewerReaction);
  const [score, setScore] = useState(post.netScore);
  useEffect(() => {
    setReaction(post.viewerReaction);
    setScore(post.netScore);
  }, [post.viewerReaction, post.netScore]);
  const react = useMutation({
    mutationFn: async (value: -1 | 1) => {
      const next = reaction === value ? null : value;
      return api.react("posts", post.id, next);
    },
    onMutate: (value) => {
      const previous = { reaction, score };
      const next = reaction === value ? null : value;
      setScore((current) => current + (next ?? 0) - (reaction ?? 0));
      setReaction(next);
      return previous;
    },
    onError: (_error, _value, previous) => {
      if (previous) {
        setReaction(previous.reaction);
        setScore(previous.score);
      }
    },
    onSuccess: (result) => {
      setReaction(result.viewerReaction);
      setScore(result.netScore);
    },
  });
  const open = () =>
    void navigate({ to: "/posts/$postId", params: { postId: post.id } });
  if (hidden("post", post.id)) return null;
  return (
    <article
      ref={ref}
      className={`grid grid-cols-[2.5rem_minmax(0,1fr)] gap-3 px-4 py-4 motion-safe:animate-[row-enter_260ms_ease-out_both] max-md:px-3 ${detail ? "" : ""}`}
      style={{ "--row-index": index } as CSSProperties}
    >
      <Avatar author={identity.author} anonymous={identity.anonymous} />
      <div className="min-w-0">
        <header className="flex items-center gap-1.5 text-[.68rem] text-stone-500">
          {post.author ? (
            <Link
              to="/profiles/$profileId"
              params={{ profileId: post.author.userId }}
              search={{ tab: "posts" }}
              className="font-bold text-stone-800 hover:underline"
            >
              {identity.label}
            </Link>
          ) : (
            <strong className="text-stone-800">Anonymous</strong>
          )}
          {post.isMine ? (
            <span className="font-bold text-teal-700">you</span>
          ) : null}
          <time>· {formatRelativeTime(post.createdAt)}</time>
          {!post.isMine ? (
            <button
              aria-label={`Block ${identity.label}`}
              className="ml-auto grid size-7 place-items-center rounded-lg hover:bg-stone-100"
              onClick={() =>
                block({
                  sourceType: "post",
                  sourceId: post.id,
                  label: identity.label,
                  identity: identity.anonymous,
                })
              }
            >
              <MoreHorizontal className="size-4" />
            </button>
          ) : null}
        </header>
        <button
          className="mt-1.5 block w-full text-left text-sm leading-relaxed text-stone-800"
          onClick={open}
        >
          {post.body || (post.attachments.length ? "" : "Post unavailable")}
        </button>
        {post.attachments.length ? (
          <div
            className={`mt-3 grid gap-1.5 overflow-hidden rounded-2xl ${post.attachments.length > 1 ? "grid-cols-2" : ""}`}
          >
            {post.attachments.map((attachment) => (
              <img
                key={attachment.id}
                src={resolveApiUrl(attachment.url)}
                alt="Post attachment"
                className="max-h-96 min-h-32 w-full bg-stone-100 object-cover"
              />
            ))}
          </div>
        ) : null}
        <div className="mt-3 flex items-center gap-1 text-stone-500">
          <button
            disabled={react.isPending}
            aria-label="Upvote"
            data-active={reaction === 1}
            className="grid size-8 place-items-center data-[active=true]:text-teal-700"
            onClick={() => react.mutate(1)}
          >
            <ChevronUp className="size-4" />
          </button>
          <span
            className="min-w-6 text-center text-xs font-bold"
            aria-label={`${score} net score`}
          >
            {score}
          </span>
          <button
            disabled={react.isPending || post.isMine}
            aria-label="Downvote"
            data-active={reaction === -1}
            className="grid size-8 place-items-center data-[active=true]:text-red-700 disabled:opacity-35"
            onClick={() => react.mutate(-1)}
          >
            <ChevronDown className="size-4" />
          </button>
          <button
            className="ml-auto flex items-center gap-1.5 px-2 text-xs"
            onClick={open}
          >
            <MessageCircle className="size-4" />
            {post.commentCount}
          </button>
        </div>
      </div>
    </article>
  );
}

export function ThreadScreen({ postId }: { postId: string }) {
  const navigate = useNavigate();
  const { compose } = useAppActions();
  const postQuery = useQuery({
    queryKey: keys.post(postId),
    queryFn: () => api.post(postId),
  });
  const comments = useInfiniteQuery(commentsQuery(postId));
  const subscription = useQuery({
    queryKey: keys.subscription(postId),
    queryFn: () => api.subscription(postId),
  });
  const toggleSubscription = useMutation({
    mutationFn: (enabled: boolean) => api.updateSubscription(postId, enabled),
    onMutate: async (enabled) => {
      await queryClient.cancelQueries({ queryKey: keys.subscription(postId) });
      const previous = queryClient.getQueryData(keys.subscription(postId));
      queryClient.setQueryData(keys.subscription(postId), { enabled });
      return previous;
    },
    onError: (_error, _value, previous) =>
      queryClient.setQueryData(keys.subscription(postId), previous),
  });
  const roots = comments.data?.pages.flatMap((page) => page.comments) ?? [];
  return (
    <section>
      <ScreenHeader
        title="Conversation"
        back={() =>
          history.length > 1
            ? history.back()
            : void navigate({
                to: "/feed/$mode",
                params: { mode: "hot" },
                search: { filter: "all", window: "week" },
              })
        }
        action={
          subscription.data ? (
            <button
              aria-label={
                subscription.data.enabled
                  ? "Disable thread notifications"
                  : "Enable thread notifications"
              }
              className="grid size-9 place-items-center rounded-xl text-stone-500 hover:bg-stone-100"
              onClick={() =>
                toggleSubscription.mutate(!subscription.data.enabled)
              }
            >
              {subscription.data.enabled ? (
                <Bell className="size-4" />
              ) : (
                <BellOff className="size-4" />
              )}
            </button>
          ) : null
        }
      />
      {postQuery.isLoading ? (
        <LoadingRows />
      ) : postQuery.isError ? (
        <ErrorState
          error={postQuery.error}
          retry={() => void postQuery.refetch()}
        />
      ) : postQuery.data ? (
        <>
          <div className="border-b border-stone-200">
            <PostCard post={postQuery.data} detail />
          </div>
          <div className="border-b border-stone-200 px-4 py-3">
            <button
              className="w-full rounded-xl bg-stone-50 px-4 py-3 text-left text-sm text-stone-400"
              onClick={() => compose({ type: "reply", postId })}
            >
              Add to the conversation…
            </button>
          </div>
        </>
      ) : null}
      {comments.isLoading ? (
        <LoadingRows />
      ) : comments.isError ? (
        <ErrorState
          error={comments.error}
          retry={() => void comments.refetch()}
        />
      ) : roots.length ? (
        <div className="divide-y divide-stone-200">
          {roots.map((comment) => (
            <CommentCard key={comment.id} comment={comment} />
          ))}
        </div>
      ) : (
        <EmptyState title="No replies yet" detail="Start the conversation." />
      )}
      {comments.hasNextPage ? (
        <LoadMore
          pending={comments.isFetchingNextPage}
          onClick={() => void comments.fetchNextPage()}
        />
      ) : null}
    </section>
  );
}

function CommentCard({
  comment,
  nested = false,
}: {
  comment: CommentDto;
  nested?: boolean;
}) {
  const { compose, block, hidden } = useAppActions();
  const identity = identityFor(comment.author, comment.anonymousIdentity);
  const [expanded, setExpanded] = useState(false);
  const replies = useInfiniteQuery({
    ...repliesQuery(comment.id),
    enabled: expanded && comment.replyCount > 0,
  });
  const [reaction, setReaction] = useState(comment.viewerReaction);
  const [score, setScore] = useState(comment.netScore);
  useEffect(() => {
    setReaction(comment.viewerReaction);
    setScore(comment.netScore);
  }, [comment.viewerReaction, comment.netScore]);
  const react = useMutation({
    mutationFn: (value: -1 | 1) =>
      api.react("comments", comment.id, reaction === value ? null : value),
    onMutate: (value) => {
      const previous = { reaction, score };
      const next = reaction === value ? null : value;
      setScore((current) => current + (next ?? 0) - (reaction ?? 0));
      setReaction(next);
      return previous;
    },
    onError: (_error, _value, previous) => {
      if (previous) {
        setReaction(previous.reaction);
        setScore(previous.score);
      }
    },
    onSuccess: (value) => {
      setReaction(value.viewerReaction);
      setScore(value.netScore);
    },
  });
  if (hidden("comment", comment.id)) return null;
  return (
    <div className={nested ? "ml-8 border-l border-stone-200" : ""}>
      <article className="grid grid-cols-[2.25rem_minmax(0,1fr)] gap-3 px-4 py-4">
        <Avatar author={identity.author} anonymous={identity.anonymous} />
        <div className="min-w-0">
          <header className="flex items-center gap-1.5 text-[.65rem] text-stone-500">
            {comment.author ? (
              <Link
                to="/profiles/$profileId"
                params={{ profileId: comment.author.userId }}
                search={{ tab: "posts" }}
                className="font-bold text-stone-800"
              >
                {identity.label}
              </Link>
            ) : (
              <strong className="text-stone-800">Anonymous</strong>
            )}
            {comment.isPostAuthor ? (
              <span className="font-bold text-teal-700">OP</span>
            ) : null}
            <time>· {formatRelativeTime(comment.createdAt)}</time>
            {!comment.isMine && comment.status === "ACTIVE" ? (
              <button
                aria-label={`Block ${identity.label}`}
                className="ml-auto"
                onClick={() =>
                  block({
                    sourceType: "comment",
                    sourceId: comment.id,
                    label: identity.label,
                    identity: identity.anonymous,
                  })
                }
              >
                <MoreHorizontal className="size-4" />
              </button>
            ) : null}
          </header>
          <p className="mt-1.5 text-sm leading-relaxed text-stone-700">
            {comment.status === "ACTIVE"
              ? comment.body
              : comment.status === "DELETED"
                ? "This comment was deleted."
                : "This comment was removed."}
          </p>
          {comment.status === "ACTIVE" ? (
            <div className="mt-2 flex items-center gap-1 text-stone-500">
              <button
                disabled={react.isPending}
                aria-label="Upvote comment"
                data-active={reaction === 1}
                className="grid size-7 place-items-center data-[active=true]:text-teal-700"
                onClick={() => react.mutate(1)}
              >
                <ChevronUp className="size-3.5" />
              </button>
              <span className="min-w-5 text-center text-[.68rem] font-bold">
                {score}
              </span>
              <button
                disabled={react.isPending || comment.isMine}
                aria-label="Downvote comment"
                data-active={reaction === -1}
                className="grid size-7 place-items-center data-[active=true]:text-red-700 disabled:opacity-35"
                onClick={() => react.mutate(-1)}
              >
                <ChevronDown className="size-3.5" />
              </button>
              <button
                className="ml-2 text-[.68rem] font-bold"
                onClick={() =>
                  compose({
                    type: "reply",
                    postId: comment.postId,
                    parentCommentId: comment.id,
                  })
                }
              >
                Reply
              </button>
              {comment.replyCount ? (
                <button
                  className="ml-auto text-[.68rem] font-bold text-teal-700"
                  onClick={() => setExpanded((value) => !value)}
                >
                  {expanded ? "Hide" : `View ${comment.replyCount}`} replies
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </article>
      {expanded ? (
        <div>
          {replies.isLoading ? (
            <div className="px-5 py-4 text-xs text-stone-500">
              Loading replies…
            </div>
          ) : (
            replies.data?.pages
              .flatMap((page) => page.comments)
              .map((reply) => (
                <CommentCard key={reply.id} comment={reply} nested />
              ))
          )}
          {replies.hasNextPage ? (
            <LoadMore
              pending={replies.isFetchingNextPage}
              onClick={() => void replies.fetchNextPage()}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function LoadMore({
  pending,
  onClick,
}: {
  pending: boolean;
  onClick: () => void;
}) {
  return (
    <div className="border-t border-stone-200 p-4 text-center">
      <button
        disabled={pending}
        className="rounded-xl border border-stone-200 px-4 py-2 text-xs font-bold disabled:opacity-50"
        onClick={onClick}
      >
        {pending ? "Loading…" : "Load more"}
      </button>
    </div>
  );
}

export function ProfileScreen({
  profileId,
  tab,
}: {
  profileId: string;
  tab: "posts" | "replies" | "media";
}) {
  const navigate = useNavigate();
  const { viewer, block } = useAppActions();
  const details = useQuery({
    queryKey: keys.profile(profileId),
    queryFn: () => api.profile(profileId),
  });
  const posts = useInfiniteQuery({
    queryKey: keys.profilePosts(profileId),
    queryFn: ({ pageParam }) =>
      api.profilePosts(profileId, pageParam ?? undefined),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor,
    enabled: tab === "posts",
  });
  const comments = useInfiniteQuery({
    queryKey: keys.profileComments(profileId),
    queryFn: ({ pageParam }) =>
      api.profileComments(profileId, pageParam ?? undefined),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor,
    enabled: tab === "replies",
  });
  const media = useInfiniteQuery({
    queryKey: keys.profileMedia(profileId),
    queryFn: ({ pageParam }) =>
      api.profileMedia(profileId, pageParam ?? undefined),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor,
    enabled: tab === "media",
  });
  const follow = useMutation({
    mutationFn: async (profile: ProfileDetails) =>
      profile.viewerIsFollowing
        ? api.unfollow(profile.handle)
        : api.follow(profile.handle),
    onMutate: async (profile) => {
      await queryClient.cancelQueries({ queryKey: keys.profile(profileId) });
      queryClient.setQueryData<ProfileDetails>(keys.profile(profileId), {
        ...profile,
        viewerIsFollowing: !profile.viewerIsFollowing,
        counts: {
          ...profile.counts,
          followers:
            profile.counts.followers + (profile.viewerIsFollowing ? -1 : 1),
        },
      });
      return profile;
    },
    onError: (_error, _profile, previous) =>
      queryClient.setQueryData(keys.profile(profileId), previous),
    onSettled: () => {
      void queryClient.invalidateQueries({
        queryKey: keys.social("following"),
      });
      void queryClient.invalidateQueries({
        queryKey: keys.feed("following", "all", "week"),
      });
    },
  });
  if (details.isLoading)
    return (
      <>
        <ScreenHeader title="Profile" />
        <LoadingRows />
      </>
    );
  if (details.isError || !details.data)
    return (
      <>
        <ScreenHeader title="Profile" back={() => history.back()} />
        <ErrorState
          error={details.error}
          retry={() => void details.refetch()}
        />
      </>
    );
  const profile = details.data;
  const self = profile.userId === viewer.userId;
  const setTab = (next: typeof tab) =>
    void navigate({
      to: "/profiles/$profileId",
      params: { profileId },
      search: { tab: next },
    });
  const postItems = posts.data?.pages.flatMap((page) => page.posts) ?? [];
  const commentItems =
    comments.data?.pages.flatMap((page) => page.comments) ?? [];
  const mediaItems =
    media.data?.pages.flatMap((page) => page.attachments) ?? [];
  return (
    <section>
      <ScreenHeader
        title={self ? "Your profile" : "Profile"}
        back={self ? undefined : () => history.back()}
      />
      <div className="border-b border-stone-200 px-5 py-6 max-md:px-4">
        <div className="flex items-start gap-4">
          <Avatar author={profile} large />
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-bold tracking-tight">
              {profile.displayName}
            </h1>
            <p className="text-xs text-stone-500">@{profile.handle}</p>
            {!self ? (
              <div className="mt-3 flex gap-2">
                <button
                  data-active={profile.viewerIsFollowing}
                  disabled={follow.isPending}
                  className="rounded-xl bg-teal-600 px-4 py-2 text-xs font-bold text-white data-[active=true]:bg-stone-200 data-[active=true]:text-stone-700"
                  onClick={() => follow.mutate(profile)}
                >
                  {profile.viewerIsFollowing ? "Following" : "Follow"}
                </button>
                <button
                  aria-label={`Block ${profile.displayName}`}
                  className="grid size-9 place-items-center rounded-xl border border-stone-200"
                  onClick={() =>
                    block({
                      sourceType: "profile",
                      sourceId: profile.userId,
                      label: profile.displayName,
                    })
                  }
                >
                  <MoreHorizontal className="size-4" />
                </button>
              </div>
            ) : null}
          </div>
        </div>
        {profile.bio ? (
          <p className="mt-4 max-w-lg text-sm leading-relaxed text-stone-700">
            {profile.bio}
          </p>
        ) : null}
        <div className="mt-5 grid grid-cols-4 divide-x divide-stone-200 border-y border-stone-200 py-3">
          <ProfileStat value={profile.counts.posts} label="posts" />
          {self ? (
            <Link to="/me/followers" className="text-center">
              <strong className="block text-lg">
                {profile.counts.followers}
              </strong>
              <span className="text-[.65rem] text-stone-500">followers</span>
            </Link>
          ) : (
            <ProfileStat value={profile.counts.followers} label="followers" />
          )}
          {self ? (
            <Link to="/me/following" className="text-center">
              <strong className="block text-lg">
                {profile.counts.following}
              </strong>
              <span className="text-[.65rem] text-stone-500">following</span>
            </Link>
          ) : (
            <ProfileStat value={profile.counts.following} label="following" />
          )}
          <ProfileStat value={profile.wakarma.total} label="Wakarma" accent />
        </div>
        <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 px-2 text-[.68rem] text-stone-500">
          <span>
            <strong className="text-stone-700">{profile.wakarma.posts}</strong>{" "}
            from posts
          </span>
          <span>·</span>
          <span>
            <strong className="text-stone-700">
              {profile.wakarma.comments}
            </strong>{" "}
            from comments
          </span>
          <span className="ml-auto max-sm:ml-0 max-sm:w-full">
            Anonymous activity is included.
          </span>
        </div>
      </div>
      <div className="grid grid-cols-3 border-b border-stone-200">
        {(["posts", "replies", "media"] as const).map((item) => (
          <button
            key={item}
            data-active={tab === item}
            className="border-b-2 border-transparent px-3 py-3 text-xs font-bold capitalize text-stone-400 data-[active=true]:border-teal-600 data-[active=true]:text-stone-950"
            onClick={() => setTab(item)}
          >
            {item}
          </button>
        ))}
      </div>
      {tab === "posts" ? (
        posts.isLoading ? (
          <LoadingRows />
        ) : postItems.length ? (
          <div className="divide-y divide-stone-200">
            {postItems.map((post) => (
              <PostCard key={post.id} post={post} />
            ))}
          </div>
        ) : (
          <EmptyState
            title="No identified posts"
            detail="Anonymous posts never appear on profiles."
          />
        )
      ) : null}
      {tab === "replies" ? (
        comments.isLoading ? (
          <LoadingRows />
        ) : commentItems.length ? (
          <div className="divide-y divide-stone-200">
            {commentItems.map((comment) => (
              <Link
                key={comment.id}
                to="/posts/$postId"
                params={{ postId: comment.postId }}
                className="block px-4 py-4 hover:bg-stone-50"
              >
                <span className="text-xs text-stone-500">
                  Reply in a conversation
                </span>
                <p className="mt-1.5 text-sm text-stone-800">{comment.body}</p>
                <small className="mt-2 block text-[.65rem] text-stone-400">
                  {formatRelativeTime(comment.createdAt)} · {comment.netScore}{" "}
                  Wakarma
                </small>
              </Link>
            ))}
          </div>
        ) : (
          <EmptyState
            title="No identified replies"
            detail="Anonymous replies stay off profile pages."
          />
        )
      ) : null}
      {tab === "media" ? (
        media.isLoading ? (
          <LoadingRows />
        ) : mediaItems.length ? (
          <div className="grid grid-cols-2 gap-1 p-1">
            {mediaItems.map((item) => (
              <Link
                key={item.id}
                to="/posts/$postId"
                params={{ postId: item.postId }}
              >
                <img
                  src={resolveApiUrl(item.url)}
                  alt="Profile attachment"
                  className="aspect-square w-full object-cover"
                />
              </Link>
            ))}
          </div>
        ) : (
          <EmptyState
            title="No public media yet"
            detail="Only attachments from identified posts appear here."
          />
        )
      ) : null}
    </section>
  );
}

function ProfileStat({
  value,
  label,
  accent = false,
}: {
  value: number;
  label: string;
  accent?: boolean;
}) {
  return (
    <div className="px-1 text-center">
      <strong
        data-accent={accent}
        className="block text-lg data-[accent=true]:text-teal-700 dark:data-[accent=true]:text-teal-300"
      >
        {value}
      </strong>
      <span className="text-[.65rem] text-stone-500">{label}</span>
    </div>
  );
}

export function SocialListScreen({
  kind,
}: {
  kind: "followers" | "following";
}) {
  const query = useQuery({
    queryKey: keys.social(kind),
    queryFn: () => api.socialList(kind),
  });
  return (
    <section>
      <ScreenHeader
        title={kind === "followers" ? "Followers" : "Following"}
        subtitle="Only you can see this list"
        back={() => history.back()}
      />
      {query.isLoading ? (
        <LoadingRows />
      ) : query.isError ? (
        <ErrorState error={query.error} retry={() => void query.refetch()} />
      ) : query.data?.length ? (
        <div className="divide-y divide-stone-200">
          {query.data.map((profile) => (
            <Link
              key={profile.userId}
              to="/profiles/$profileId"
              params={{ profileId: profile.userId }}
              search={{ tab: "posts" }}
              className="flex items-center gap-3 px-4 py-4 hover:bg-stone-50"
            >
              <Avatar author={profile} />
              <span>
                <strong className="block text-sm">{profile.displayName}</strong>
                <small className="text-xs text-stone-500">
                  @{profile.handle}
                </small>
              </span>
              <ChevronUp className="ml-auto size-4 rotate-90 text-stone-300" />
            </Link>
          ))}
        </div>
      ) : (
        <EmptyState
          title={`No ${kind}`}
          detail={
            kind === "followers"
              ? "Nobody follows you yet."
              : "You aren’t following anyone yet."
          }
        />
      )}
    </section>
  );
}

export function NotificationsScreen({ state }: { state: "all" | "unread" }) {
  const navigate = useNavigate();
  const result = useInfiniteQuery(notificationsQuery(state));
  const items = result.data?.pages.flatMap((page) => page.notifications) ?? [];
  const readAll = useMutation({
    mutationFn: api.readAllNotifications,
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ["notifications"] });
      const previous = queryClient.getQueriesData<NotificationPages>({
        queryKey: ["notifications"],
      });
      const readAt = new Date().toISOString();
      updateNotificationCaches(undefined, readAt);
      return previous;
    },
    onError: (_error, _value, previous) =>
      previous?.forEach(([key, data]) => queryClient.setQueryData(key, data)),
    onSettled: () =>
      void queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });
  return (
    <section>
      <ScreenHeader
        title="Activity"
        subtitle="Replies, follows, and post milestones"
        action={
          <button
            disabled={readAll.isPending}
            className="text-[.68rem] font-bold text-teal-700"
            onClick={() => readAll.mutate()}
          >
            Mark all read
          </button>
        }
      />
      <div className="grid grid-cols-2 border-b border-stone-200">
        {(["all", "unread"] as const).map((item) => (
          <button
            key={item}
            data-active={state === item}
            className="border-b-2 border-transparent px-3 py-3 text-xs font-bold capitalize text-stone-400 data-[active=true]:border-teal-600 data-[active=true]:text-stone-950"
            onClick={() =>
              void navigate({ to: "/notifications", search: { state: item } })
            }
          >
            {item}
          </button>
        ))}
      </div>
      {result.isLoading ? (
        <LoadingRows />
      ) : result.isError ? (
        <ErrorState error={result.error} retry={() => void result.refetch()} />
      ) : items.length ? (
        <div className="divide-y divide-stone-200">
          {items.map((item) => (
            <NotificationRow key={item.id} notification={item} />
          ))}
        </div>
      ) : (
        <EmptyState
          title="No unread notifications"
          detail="New mentions, replies, follows, milestones, and trending awards will appear here."
        />
      )}
      {result.hasNextPage ? (
        <LoadMore
          pending={result.isFetchingNextPage}
          onClick={() => void result.fetchNextPage()}
        />
      ) : null}
    </section>
  );
}

function actorPresentation(actor: NotificationActor) {
  return actor.kind === "identified"
    ? { label: actor.profile.displayName, author: actor.profile }
    : { label: "Anonymous", anonymous: actor.identity };
}

type NotificationPage = {
  notifications: NotificationDto[];
  nextCursor: string | null;
};
type NotificationPages = InfiniteData<NotificationPage, string | null>;

function updateNotificationCaches(id: string | undefined, readAt: string) {
  queryClient.setQueryData<NotificationPages>(
    keys.notifications("all"),
    (data) =>
      data
        ? {
            ...data,
            pages: data.pages.map((page) => ({
              ...page,
              notifications: page.notifications.map((item) =>
                id === undefined || item.id === id
                  ? { ...item, readAt: item.readAt ?? readAt }
                  : item,
              ),
            })),
          }
        : data,
  );
  queryClient.setQueryData<NotificationPages>(
    keys.notifications("unread"),
    (data) =>
      data
        ? {
            ...data,
            pages: data.pages.map((page) => ({
              ...page,
              notifications:
                id === undefined
                  ? []
                  : page.notifications.filter((item) => item.id !== id),
            })),
          }
        : data,
  );
}

function NotificationRow({ notification }: { notification: NotificationDto }) {
  const navigate = useNavigate();
  const { block, hidden } = useAppActions();
  const actor =
    notification.type === "MENTION" ||
    notification.type === "DIRECT_REPLY" ||
    notification.type === "THREAD_COMMENT" ||
    notification.type === "NEW_FOLLOWER"
      ? notification.payload.actor
      : undefined;
  const identity = actor ? actorPresentation(actor) : undefined;
  const description = notificationText(notification);
  const read = useMutation({
    mutationFn: () => api.readNotification(notification.id),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ["notifications"] });
      const previous = queryClient.getQueriesData<NotificationPages>({
        queryKey: ["notifications"],
      });
      const readAt = new Date().toISOString();
      updateNotificationCaches(notification.id, readAt);
      return previous;
    },
    onError: (_error, _value, previous) =>
      previous?.forEach(([key, data]) => queryClient.setQueryData(key, data)),
    onSettled: () =>
      void queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });
  const open = async () => {
    if (!notification.readAt) {
      try {
        await read.mutateAsync();
      } catch {
        // The destination can still be opened when a read receipt fails.
      }
    }
    if (notification.postId)
      await navigate({
        to: "/posts/$postId",
        params: { postId: notification.postId },
      });
    else if (actor?.kind === "identified")
      await navigate({
        to: "/profiles/$profileId",
        params: { profileId: actor.profile.userId },
        search: { tab: "posts" },
      });
  };
  if (hidden("notification", notification.id)) return null;
  return (
    <article
      data-unread={!notification.readAt}
      className="flex gap-3 px-4 py-4 data-[unread=true]:bg-teal-50/35"
    >
      <button
        className="flex min-w-0 flex-1 gap-3 text-left"
        onClick={() => void open()}
      >
        {identity ? (
          <Avatar author={identity.author} anonymous={identity.anonymous} />
        ) : (
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-stone-100 text-lg">
            {notification.type === "POST_TRENDING"
              ? "🔥"
              : notification.type === "SCORE_MILESTONE"
                ? "↗"
                : "i"}
          </span>
        )}
        <span className="min-w-0">
          <span className="block text-sm leading-relaxed">
            {description.text}
          </span>
          {description.excerpt ? (
            <span className="mt-1 block truncate text-xs text-stone-500">
              {description.excerpt}
            </span>
          ) : null}
          <time className="mt-1 block text-[.62rem] text-stone-400">
            {formatRelativeTime(notification.createdAt)}
          </time>
        </span>
      </button>
      {actor ? (
        <button
          aria-label={`Block ${identity!.label}`}
          className="grid size-8 place-items-center rounded-lg"
          onClick={() =>
            block({
              sourceType: "notification",
              sourceId: notification.id,
              label: identity!.label,
              identity: identity!.anonymous,
            })
          }
        >
          <MoreHorizontal className="size-4" />
        </button>
      ) : null}
    </article>
  );
}

function notificationText(notification: NotificationDto): {
  text: string;
  excerpt?: string;
} {
  if (notification.type === "MENTION")
    return {
      text: `${actorPresentation(notification.payload.actor).label} mentioned you`,
      excerpt: notification.payload.excerpt,
    };
  if (notification.type === "DIRECT_REPLY")
    return {
      text: `${actorPresentation(notification.payload.actor).label} replied directly to you`,
      excerpt: notification.payload.excerpt,
    };
  if (notification.type === "THREAD_COMMENT")
    return {
      text: `${actorPresentation(notification.payload.actor).label} commented on a conversation you follow`,
      excerpt: notification.payload.excerpt,
    };
  if (notification.type === "NEW_FOLLOWER")
    return {
      text: `${actorPresentation(notification.payload.actor).label} followed you`,
    };
  if (notification.type === "SCORE_MILESTONE")
    return {
      text: `Your post reached ${notification.payload.threshold} Wakarma`,
      excerpt: notification.payload.excerpt,
    };
  if (notification.type === "POST_TRENDING")
    return {
      text: "Your post is trending in the feed",
      excerpt: notification.payload.excerpt,
    };
  return { text: (notification.payload as { message: string }).message };
}

export function SettingsScreen() {
  const navigate = useNavigate();
  const router = useRouter();
  const settings = useQuery({ queryKey: keys.settings, queryFn: api.settings });
  const blocks = useQuery({ queryKey: keys.blocks, queryFn: api.blocks });
  const adminAccess = useQuery(adminAccessQuery);
  const update = useMutation({
    mutationFn: api.updateSettings,
    onMutate: async (patch: Partial<SettingsDto>) => {
      await queryClient.cancelQueries({ queryKey: keys.settings });
      const previous = queryClient.getQueryData<SettingsDto>(keys.settings);
      if (previous)
        queryClient.setQueryData(keys.settings, { ...previous, ...patch });
      return previous;
    },
    onError: (_error, _patch, previous) =>
      queryClient.setQueryData(keys.settings, previous),
    onSuccess: (value) => queryClient.setQueryData(keys.settings, value),
  });
  const signOut = async () => {
    const result = await authClient.signOut();
    if (result.error)
      throw new Error(result.error.message ?? "Could not sign out.");
    queryClient.clear();
    await router.invalidate();
    await navigate({ to: "/sign-in", search: { redirect: undefined } });
  };
  if (settings.isLoading || blocks.isLoading)
    return (
      <>
        <ScreenHeader title="Settings" back={() => history.back()} />
        <LoadingRows />
      </>
    );
  if (settings.isError || blocks.isError || !settings.data)
    return (
      <>
        <ScreenHeader title="Settings" back={() => history.back()} />
        <ErrorState
          error={settings.error ?? blocks.error}
          retry={() => {
            void settings.refetch();
            void blocks.refetch();
          }}
        />
      </>
    );
  const item = (label: string, key: keyof SettingsDto, hint?: string) => (
    <SettingToggle
      label={label}
      checked={settings.data[key]}
      hint={hint}
      onChange={(checked) => update.mutate({ [key]: checked })}
    />
  );
  return (
    <section>
      <ScreenHeader
        title="Settings"
        subtitle="Your member preferences"
        back={() => history.back()}
      />
      <SettingsSection
        title="Notifications"
        detail="Choose which activity creates an in-app notification."
      >
        {item("Mentions", "notifyMentions")}
        {item("Direct replies", "notifyDirectReplies")}
        {item("Thread comments", "notifyThreadComments")}
        {item("New followers", "notifyNewFollowers")}
        {item("Score milestones", "notifyScoreMilestones")}
        {item("Post trending", "notifyPostTrending")}
        <SettingToggle
          label="System notifications"
          checked
          disabled
          hint="Always on"
          onChange={() => undefined}
        />
      </SettingsSection>
      <SettingsSection
        title="Posting defaults"
        detail="You can still change this in each composer."
      >
        {item("Post anonymously by default", "defaultPostAnonymous")}
        {item("Reply anonymously by default", "defaultReplyAnonymous")}
      </SettingsSection>
      <SettingsSection
        title="Blocked accounts"
        detail="Anonymous accounts remain anonymous here."
      >
        {blocks.data?.length ? (
          blocks.data.map((block) => (
            <div
              key={block.blockId}
              className="flex items-center gap-3 border-t border-stone-200 px-4 py-3 first:border-t-0"
            >
              <Avatar
                anonymous={
                  block.displaySnapshot.emoji
                    ? {
                        emoji: block.displaySnapshot.emoji,
                        color: block.displaySnapshot.color ?? "#57534e",
                        paletteVersion:
                          block.displaySnapshot.paletteVersion ?? "v1",
                      }
                    : undefined
                }
                author={
                  block.displaySnapshot.emoji
                    ? undefined
                    : {
                        userId: "opaque",
                        handle: "opaque",
                        displayName: block.displaySnapshot.label,
                        avatarUrl: null,
                      }
                }
              />
              <span className="min-w-0 flex-1">
                <strong className="block text-xs">
                  {block.displaySnapshot.label}
                </strong>
                <small className="block truncate text-[.6rem] text-stone-400">
                  {block.blockId} · {formatRelativeTime(block.createdAt)}
                </small>
              </span>
              <button
                className="rounded-lg border border-stone-200 px-3 py-2 text-[.65rem] font-bold"
                onClick={async () => {
                  await api.unblock(block.blockId);
                  await queryClient.invalidateQueries({
                    queryKey: keys.blocks,
                  });
                }}
              >
                Unblock
              </button>
            </div>
          ))
        ) : (
          <div className="px-4 py-5 text-sm text-stone-500">
            You haven’t blocked anyone.
          </div>
        )}
      </SettingsSection>
      <SettingsSection
        title="Account"
        detail="Session controls for this device."
      >
        <div className="px-4 py-3">
          <button
            className="rounded-xl border border-stone-200 px-4 py-2.5 text-xs font-bold"
            onClick={() => void signOut()}
          >
            Sign out
          </button>
        </div>
      </SettingsSection>
      {adminAccess.isSuccess ? (
        <SettingsSection
          title="Owner tools"
          detail="Invitation administration is authorized by the server."
        >
          <Link
            to="/admin/invitations"
            className="flex items-center justify-between border-t border-stone-200 px-4 py-3 text-xs font-bold first:border-t-0"
          >
            <span className="flex items-center gap-3">
              <KeyRound className="size-4 text-teal-600" />
              Manage invitations
            </span>
            <span aria-hidden className="text-stone-400">
              →
            </span>
          </Link>
        </SettingsSection>
      ) : null}
    </section>
  );
}

function SettingsSection({
  title,
  detail,
  children,
}: {
  title: string;
  detail: string;
  children: ReactNode;
}) {
  return (
    <section className="border-b border-stone-200 py-5">
      <header className="px-4 pb-3">
        <h2 className="text-sm font-bold">{title}</h2>
        <p className="mt-1 text-[.68rem] text-stone-500">{detail}</p>
      </header>
      {children}
    </section>
  );
}

function SettingToggle({
  label,
  checked,
  disabled = false,
  hint,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  hint?: string;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-4 border-t border-stone-200 px-4 py-3 first:border-t-0">
      <span className="min-w-0 flex-1 text-xs font-semibold">
        {label}
        {hint ? (
          <small className="ml-2 text-[.6rem] font-normal text-stone-400">
            {hint}
          </small>
        ) : null}
      </span>
      <input
        className="sr-only"
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span
        aria-hidden="true"
        data-checked={checked}
        className="relative h-6 w-10 rounded-full bg-stone-200 transition data-[checked=true]:bg-teal-600 after:absolute after:left-1 after:top-1 after:size-4 after:rounded-full after:bg-white after:transition-transform data-[checked=true]:after:translate-x-4"
      />
    </label>
  );
}

type UploadItem = {
  localId: string;
  file: File;
  preview: string;
  attachmentId?: string;
  status: "queued" | "uploading" | "processing" | "ready" | "failed";
  error?: string;
};
const IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
  "image/gif",
  "image/heic",
  "image/heif",
]);
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

function Composer({
  target,
  onClose,
}: {
  target: ComposeTarget;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const { viewer } = useAppActions();
  const { data: settings } = useSuspenseQuery({
    queryKey: keys.settings,
    queryFn: api.settings,
  });
  const [anonymous, setAnonymous] = useState(
    target.type === "post"
      ? settings.defaultPostAnonymous
      : settings.defaultReplyAnonymous,
  );
  const [draft, setDraft] = useState("");
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);
  const uploadsRef = useRef(uploads);
  uploadsRef.current = uploads;
  useEffect(
    () => () =>
      uploadsRef.current.forEach((item) => URL.revokeObjectURL(item.preview)),
    [],
  );

  const uploadItem = async (item: UploadItem) => {
    try {
      const reservation = (
        await api.reserveUploads([
          { contentType: item.file.type, byteSize: item.file.size },
        ])
      ).uploads[0];
      if (!reservation) throw new Error("The upload could not be reserved.");
      setUploads((current) =>
        current.map((value) =>
          value.localId === item.localId
            ? {
                ...value,
                attachmentId: reservation.id,
                status: "uploading",
                error: undefined,
              }
            : value,
        ),
      );
      await api.putUpload(
        reservation.uploadUrl,
        item.file,
        reservation.headers,
      );
      setUploads((current) =>
        current.map((value) =>
          value.localId === item.localId
            ? { ...value, status: "processing" }
            : value,
        ),
      );
      await api.completeUpload(reservation.id);
      setUploads((current) =>
        current.map((value) =>
          value.localId === item.localId
            ? { ...value, status: "ready" }
            : value,
        ),
      );
    } catch (value) {
      setUploads((current) =>
        current.map((entry) =>
          entry.localId === item.localId
            ? { ...entry, status: "failed", error: errorMessage(value) }
            : entry,
        ),
      );
    }
  };

  const addFiles = async (files: File[]) => {
    setError(undefined);
    const available = 4 - uploads.length;
    const selected = files.slice(0, available);
    const invalid = selected.find(
      (file) => !IMAGE_TYPES.has(file.type) || file.size > MAX_IMAGE_BYTES,
    );
    if (invalid) {
      setError("Images must be a supported format and no larger than 10 MB.");
      return;
    }
    const items = selected.map((file) => ({
      localId: crypto.randomUUID(),
      file,
      preview: URL.createObjectURL(file),
      status: "queued" as const,
    }));
    setUploads((current) => [...current, ...items]);
    await Promise.all(items.map(uploadItem));
  };

  const retry = async (item: UploadItem) => {
    if (item.attachmentId)
      await api.deleteUpload(item.attachmentId).catch(() => undefined);
    const retryItem = {
      ...item,
      attachmentId: undefined,
      status: "queued" as const,
      error: undefined,
    };
    setUploads((current) =>
      current.map((value) =>
        value.localId === item.localId ? retryItem : value,
      ),
    );
    await uploadItem(retryItem);
  };

  const remove = async (item: UploadItem) => {
    setUploads((current) =>
      current.filter((value) => value.localId !== item.localId),
    );
    URL.revokeObjectURL(item.preview);
    if (item.attachmentId)
      try {
        await api.deleteUpload(item.attachmentId);
      } catch {
        /* expiry cleanup is the fallback */
      }
  };
  const close = async () => {
    await Promise.all(
      uploads
        .filter((item) => item.attachmentId)
        .map((item) =>
          api.deleteUpload(item.attachmentId!).catch(() => undefined),
        ),
    );
    onClose();
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!draft.trim() && !uploads.some((item) => item.status === "ready"))
      return;
    if (uploads.some((item) => item.status !== "ready")) {
      setError(
        "Wait for every image to finish uploading or remove failed images.",
      );
      return;
    }
    setPending(true);
    setError(undefined);
    try {
      if (target.type === "post") {
        const { post } = await api.createPost({
          body: draft.trim() || null,
          isAnonymous: anonymous,
          attachmentIds: uploads.map((item) => item.attachmentId!),
        });
        await queryClient.invalidateQueries({ queryKey: keys.feeds });
        onClose();
        await navigate({ to: "/posts/$postId", params: { postId: post.id } });
      } else {
        await api.createComment(target.postId, {
          body: draft.trim(),
          isAnonymous: anonymous,
          parentCommentId: target.parentCommentId,
        });
        await Promise.all([
          queryClient.invalidateQueries({
            queryKey: keys.comments(target.postId),
          }),
          target.parentCommentId
            ? queryClient.invalidateQueries({
                queryKey: keys.replies(target.parentCommentId),
              })
            : Promise.resolve(),
          queryClient.invalidateQueries({ queryKey: keys.post(target.postId) }),
          queryClient.invalidateQueries({
            queryKey: keys.subscription(target.postId),
          }),
        ]);
        onClose();
        await navigate({
          to: "/posts/$postId",
          params: { postId: target.postId },
        });
      }
    } catch (value) {
      setError(errorMessage(value));
      setPending(false);
    }
  };
  const ready = uploads.every((item) => item.status === "ready");
  return (
    <Modal
      title={target.type === "post" ? "Create a post" : "Write a reply"}
      onClose={() => void close()}
    >
      <form className="p-5" onSubmit={(event) => void submit(event)}>
        <div className="flex items-center gap-3">
          <Avatar
            author={anonymous ? undefined : viewer}
            anonymous={
              anonymous
                ? { emoji: "•", color: "#0f766e", paletteVersion: "v1" }
                : undefined
            }
          />
          <div>
            <strong className="block text-sm">
              {anonymous ? "Anonymous" : viewer.displayName}
            </strong>
            <span className="text-xs text-stone-500">
              {anonymous ? "Thread-stable identity" : `@${viewer.handle}`}
            </span>
          </div>
        </div>
        <textarea
          autoFocus
          maxLength={280}
          className="mt-4 min-h-32 w-full resize-none bg-transparent text-lg leading-relaxed outline-none placeholder:text-stone-400"
          placeholder={
            target.type === "post"
              ? "What’s happening?"
              : "Add to the conversation…"
          }
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
        />
        {uploads.length ? (
          <div className="mb-3 grid grid-cols-2 gap-2">
            {uploads.map((item) => (
              <div
                key={item.localId}
                className="relative overflow-hidden rounded-xl bg-stone-100"
              >
                <img
                  src={item.preview}
                  alt="Upload preview"
                  className="aspect-video w-full object-cover"
                />
                <span className="absolute inset-x-0 bottom-0 bg-stone-950/70 px-2 py-1 text-[.6rem] text-white">
                  {item.status === "failed"
                    ? (item.error ?? "Upload failed")
                    : item.status}
                </span>
                {item.status === "failed" ? (
                  <button
                    type="button"
                    className="absolute bottom-7 left-1 rounded-lg bg-white/95 px-2 py-1 text-[.6rem] font-bold text-stone-900"
                    onClick={() => void retry(item)}
                  >
                    Retry
                  </button>
                ) : null}
                <button
                  type="button"
                  aria-label="Remove image"
                  className="absolute right-1 top-1 grid size-7 place-items-center rounded-lg bg-stone-950/70 text-white"
                  onClick={() => void remove(item)}
                >
                  <X className="size-3" />
                </button>
              </div>
            ))}
          </div>
        ) : null}
        {error ? (
          <p
            role="alert"
            className="mb-3 rounded-xl bg-red-50 px-3 py-2 text-xs text-red-700"
          >
            {error}
          </p>
        ) : null}
        <div className="flex items-center border-t border-stone-200 pt-3">
          <label className="grid size-9 cursor-pointer place-items-center rounded-xl text-stone-500 hover:bg-stone-100">
            <ImageIcon className="size-4" />
            <input
              type="file"
              multiple
              accept="image/jpeg,image/png,image/webp,image/avif,image/gif,image/heic,image/heif"
              className="sr-only"
              disabled={uploads.length >= 4}
              onChange={(event) => {
                void addFiles(Array.from(event.target.files ?? []));
                event.target.value = "";
              }}
            />
          </label>
          <button
            type="button"
            data-active={anonymous}
            className="ml-1 flex h-9 items-center gap-2 rounded-xl px-3 text-xs font-semibold text-stone-500 data-[active=true]:bg-teal-50 data-[active=true]:text-teal-700"
            onClick={() => setAnonymous((value) => !value)}
          >
            <Users className="size-4" />
            Anonymous
          </button>
          <span className="ml-auto text-xs tabular-nums text-stone-400">
            {280 - draft.length}
          </span>
        </div>
        <footer className="mt-4 flex items-center justify-between gap-4">
          <p className="text-xs text-stone-500">
            {target.type === "reply"
              ? "Replying subscribes unless this thread was disabled."
              : "Your default comes from Settings."}
          </p>
          <button
            disabled={pending || !ready || (!draft.trim() && !uploads.length)}
            className="flex items-center gap-2 rounded-xl bg-teal-600 px-5 py-2.5 text-xs font-bold text-white disabled:opacity-40"
          >
            {pending ? <LoaderCircle className="size-4 animate-spin" /> : null}
            {target.type === "post" ? "Post" : "Reply"}
          </button>
        </footer>
      </form>
    </Modal>
  );
}
