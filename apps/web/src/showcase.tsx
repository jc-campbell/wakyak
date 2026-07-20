import type {
  AnonymousIdentity,
  CommentDto,
  NotificationDto,
  PostDto,
  PublicAuthor,
  SettingsDto,
} from "@wakyak/contracts";
import {
  ArrowLeft,
  Bell,
  BellOff,
  Check,
  ChevronDown,
  ChevronUp,
  Feather,
  Home,
  Image,
  ListFilter,
  MessageCircle,
  Moon,
  MoreHorizontal,
  Paperclip,
  Settings,
  ShieldBan,
  Sun,
  UserRound,
  Users,
  X,
} from "lucide-react";
import {
  startTransition,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type ReactNode,
} from "react";

import { viewer } from "@/showcase/data";
import { formatRelativeTime, MockApiClient } from "@/showcase/mock-client";
import type {
  BlockIntent,
  ComposeTarget,
  FeedFilter,
  FeedMode,
  MockView,
  NotificationFilter,
  ProfileTab,
  SocialListKind,
  ToastState,
  TopWindow,
} from "@/showcase/types";

function readInitialDarkMode(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const stored = window.localStorage.getItem("wakyak-color-mode");
    if (stored) return stored === "dark";
  } catch {
    // Fall through to the operating-system preference.
  }
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
}

export function WakYakApp() {
  const client = useRef(new MockApiClient()).current;
  const [, setRevision] = useState(0);
  const refresh = () => setRevision((value) => value + 1);
  const [view, setView] = useState<MockView>("home");
  const [selectedPostId, setSelectedPostId] = useState(
    "22222222-2222-4222-8222-222222222222",
  );
  const [selectedProfileId, setSelectedProfileId] = useState<string>();
  const [socialList, setSocialList] = useState<SocialListKind>("followers");
  const [feedMode, setFeedMode] = useState<FeedMode>("hot");
  const [feedFilter, setFeedFilter] = useState<FeedFilter>("all");
  const [topWindow, setTopWindow] = useState<TopWindow>("week");
  const [feedPages, setFeedPages] = useState(1);
  const [notificationFilter, setNotificationFilter] =
    useState<NotificationFilter>("all");
  const [profileTab, setProfileTab] = useState<ProfileTab>("posts");
  const [composeTarget, setComposeTarget] = useState<ComposeTarget>();
  const [blockIntent, setBlockIntent] = useState<BlockIntent>();
  const [toast, setToast] = useState<ToastState>();
  const [darkMode, setDarkMode] = useState(readInitialDarkMode);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", darkMode);
    try {
      window.localStorage.setItem(
        "wakyak-color-mode",
        darkMode ? "dark" : "light",
      );
    } catch {
      // The showcase still works when browser storage is unavailable.
    }
  }, [darkMode]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(undefined), 4200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [view]);

  const navigate = (next: MockView) => startTransition(() => setView(next));
  const openThread = (postId: string) => {
    setSelectedPostId(postId);
    navigate("thread");
  };
  const openProfile = (profileId: string) => {
    setSelectedProfileId(profileId);
    setProfileTab("posts");
    navigate(profileId === viewer.userId ? "profile" : "public-profile");
  };
  const showToast = (message: string, undoBlockId?: string) =>
    setToast({ message, undoBlockId });

  const confirmBlock = () => {
    if (!blockIntent) return;
    const block = client.block({
      sourceType: blockIntent.sourceType,
      sourceId: blockIntent.sourceId,
    });
    setBlockIntent(undefined);
    showToast(`${block.displaySnapshot.label} blocked`, block.blockId);
    refresh();
  };

  return (
    <div
      className={`${darkMode ? "dark" : ""} relative isolate min-h-dvh overflow-x-clip bg-stone-100 text-stone-950 transition-colors duration-200 dark:bg-[#0c0a09]`}
    >
      <div className="pointer-events-none fixed -right-40 -top-64 -z-10 aspect-square w-[38rem] rounded-full bg-teal-300/20 blur-3xl max-md:hidden" />
      <div className="pointer-events-none fixed -bottom-80 -left-48 -z-10 aspect-square w-[38rem] rounded-full bg-amber-200/30 blur-3xl max-md:hidden" />
      <div className="mx-auto grid min-h-dvh w-full max-w-[58rem] grid-cols-[13rem_minmax(0,1fr)] max-md:block">
        <LeftNavigation
          view={view}
          onNavigate={navigate}
          onCompose={() => setComposeTarget({ type: "post" })}
        />
        <main className="min-h-dvh min-w-0 border-x border-stone-200 bg-white max-md:border-0">
          <MobileHeader
            view={view}
            onBack={() =>
              navigate(
                view === "settings" || view === "social-list"
                  ? "profile"
                  : "home",
              )
            }
            onProfile={() => navigate("profile")}
            onSettings={() => navigate("settings")}
            darkMode={darkMode}
            onToggleTheme={() => setDarkMode((value) => !value)}
          />
          <div
            className="animate-[screen-enter_240ms_ease-out_both] max-md:pb-24"
            key={view}
          >
            {view === "home" && (
              <HomeScreen
                client={client}
                mode={feedMode}
                filter={feedFilter}
                window={topWindow}
                pages={feedPages}
                onMode={(mode) => {
                  setFeedMode(mode);
                  setFeedPages(1);
                }}
                onFilter={(filter) => {
                  setFeedFilter(filter);
                  setFeedPages(1);
                }}
                onWindow={setTopWindow}
                onMore={() => setFeedPages((value) => value + 1)}
                onCompose={() => setComposeTarget({ type: "post" })}
                onThread={openThread}
                onProfile={openProfile}
                onBlock={setBlockIntent}
                onRefresh={refresh}
                onSettings={() => navigate("settings")}
                darkMode={darkMode}
                onToggleTheme={() => setDarkMode((value) => !value)}
              />
            )}
            {view === "thread" && (
              <ThreadScreen
                client={client}
                postId={selectedPostId}
                onBack={() => navigate("home")}
                onReply={(parentCommentId) =>
                  setComposeTarget({
                    type: "reply",
                    postId: selectedPostId,
                    parentCommentId,
                  })
                }
                onProfile={openProfile}
                onBlock={setBlockIntent}
                onRefresh={refresh}
              />
            )}
            {view === "notifications" && (
              <NotificationsScreen
                client={client}
                filter={notificationFilter}
                onFilter={setNotificationFilter}
                onThread={openThread}
                onProfile={openProfile}
                onBlock={setBlockIntent}
                onRefresh={refresh}
                onSettings={() => navigate("settings")}
                darkMode={darkMode}
                onToggleTheme={() => setDarkMode((value) => !value)}
              />
            )}
            {(view === "profile" || view === "public-profile") && (
              <ProfileScreen
                client={client}
                profileId={
                  view === "profile"
                    ? viewer.userId
                    : (selectedProfileId ?? viewer.userId)
                }
                isSelf={view === "profile"}
                tab={profileTab}
                onTab={setProfileTab}
                onThread={openThread}
                onBack={
                  view === "public-profile" ? () => navigate("home") : undefined
                }
                onSettings={() => navigate("settings")}
                onSocialList={(kind) => {
                  setSocialList(kind);
                  navigate("social-list");
                }}
                onBlock={setBlockIntent}
                onRefresh={refresh}
                darkMode={darkMode}
                onToggleTheme={() => setDarkMode((value) => !value)}
              />
            )}
            {view === "social-list" && (
              <SocialListScreen
                client={client}
                kind={socialList}
                onBack={() => navigate("profile")}
                onProfile={openProfile}
              />
            )}
            {view === "settings" && (
              <SettingsScreen
                client={client}
                onBack={() => navigate("profile")}
                onRefresh={refresh}
              />
            )}
          </div>
        </main>
      </div>
      <MobileNavigation
        view={view}
        onNavigate={navigate}
        onCompose={() => setComposeTarget({ type: "post" })}
      />

      {composeTarget && (
        <ComposeDialog
          client={client}
          target={composeTarget}
          onClose={() => setComposeTarget(undefined)}
          onCreated={(postId) => {
            setComposeTarget(undefined);
            showToast(
              composeTarget.type === "post"
                ? "Post added to the mock feed"
                : "Reply added to the conversation",
            );
            refresh();
            if (postId) openThread(postId);
          }}
        />
      )}
      {blockIntent && (
        <BlockDialog
          intent={blockIntent}
          onClose={() => setBlockIntent(undefined)}
          onConfirm={confirmBlock}
        />
      )}
      {toast && (
        <div
          className="fixed left-1/2 top-5 z-[250] flex -translate-x-1/2 items-center gap-3 rounded-full bg-stone-950 px-4 py-2.5 text-xs font-semibold text-white shadow-xl motion-safe:animate-[toast-in_220ms_ease-out_both]"
          role="status"
        >
          <span className="flex items-center gap-2">
            <Check className="size-4" />
            {toast.message}
          </span>
          {toast.undoBlockId && (
            <button
              className="font-bold text-teal-300 hover:text-white"
              onClick={() => {
                client.unblock(toast.undoBlockId!);
                setToast({ message: "Block undone" });
                refresh();
              }}
            >
              Undo
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5" aria-label="WakYak">
      <span className="grid size-8 -rotate-3 place-items-center rounded-[.65rem_.65rem_.65rem_.2rem] bg-teal-600 text-xs font-black text-white shadow-sm">
        W
      </span>
      {!compact && <strong className="text-lg tracking-tight">WakYak</strong>}
    </div>
  );
}

function LeftNavigation({
  view,
  onNavigate,
  onCompose,
}: {
  view: MockView;
  onNavigate: (view: MockView) => void;
  onCompose: () => void;
}) {
  const active =
    view === "public-profile" || view === "social-list" || view === "settings"
      ? "profile"
      : view === "thread"
        ? "home"
        : view;
  return (
    <aside className="max-md:hidden">
      <nav
        className="sticky top-0 flex h-dvh flex-col px-3 py-5"
        aria-label="Primary navigation"
      >
        <button
          className="rounded-xl p-2 text-left hover:bg-white/60"
          onClick={() => onNavigate("home")}
        >
          <Brand />
        </button>
        <div className="mt-7 flex flex-col gap-1">
          <NavButton
            icon={<Home />}
            label="Home"
            active={active === "home"}
            onClick={() => onNavigate("home")}
          />
          <NavButton
            icon={<Bell />}
            label="Notifications"
            active={active === "notifications"}
            badge
            onClick={() => onNavigate("notifications")}
          />
          <NavButton
            icon={<UserRound />}
            label="Profile"
            active={active === "profile"}
            onClick={() => onNavigate("profile")}
          />
        </div>
        <button
          className="mt-6 flex h-11 items-center justify-center gap-2 rounded-xl bg-teal-600 text-sm font-bold text-white shadow-sm transition hover:bg-teal-700 active:scale-[.98]"
          onClick={onCompose}
        >
          <Feather className="size-4" />
          Post
        </button>
        <button
          className="mt-auto grid grid-cols-[2.25rem_1fr] items-center gap-2 rounded-xl p-2 text-left hover:bg-white/70"
          onClick={() => onNavigate("profile")}
        >
          <Avatar label="CB" />
          <span>
            <strong className="block text-xs">Campbell</strong>
            <small className="block text-[.68rem] text-stone-500">
              @campbell
            </small>
          </span>
        </button>
      </nav>
    </aside>
  );
}

function NavButton({
  icon,
  label,
  active,
  badge,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  active: boolean;
  badge?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className="flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium text-stone-500 transition hover:bg-white/70 hover:text-stone-900 data-[active=true]:bg-white data-[active=true]:font-semibold data-[active=true]:text-stone-950 data-[active=true]:shadow-sm"
      data-active={active}
      onClick={onClick}
    >
      <span className="relative grid size-6 place-items-center [&>svg]:size-[1.1rem]">
        {icon}
        {badge && (
          <i className="absolute right-0 top-0 size-1.5 rounded-full bg-teal-500 ring-2 ring-stone-100" />
        )}
      </span>
      {label}
    </button>
  );
}

function MobileHeader({
  view,
  onBack,
  onProfile,
  onSettings,
  darkMode,
  onToggleTheme,
}: {
  view: MockView;
  onBack: () => void;
  onProfile: () => void;
  onSettings: () => void;
  darkMode: boolean;
  onToggleTheme: () => void;
}) {
  const secondary = [
    "thread",
    "public-profile",
    "social-list",
    "settings",
  ].includes(view);
  const title: Record<MockView, string> = {
    home: "Home",
    thread: "Conversation",
    notifications: "Activity",
    profile: "Profile",
    "public-profile": "Profile",
    "social-list": "Your circle",
    settings: "Settings",
  };
  return (
    <header className="sticky top-0 z-30 hidden h-[calc(3.25rem+env(safe-area-inset-top))] grid-cols-[2rem_1fr_auto] place-items-center border-b border-stone-200 bg-white/90 px-3 pt-[env(safe-area-inset-top)] backdrop-blur-xl max-md:grid">
      {secondary ? (
        <button
          className="grid size-9 place-items-center rounded-full hover:bg-stone-100"
          aria-label="Back"
          onClick={onBack}
        >
          <ArrowLeft className="size-4" />
        </button>
      ) : (
        <Brand compact />
      )}
      <strong className="text-xs">{title[view]}</strong>
      {view === "profile" ? (
        <div className="flex items-center gap-1 justify-self-end">
          <ThemeToggle darkMode={darkMode} onToggle={onToggleTheme} compact />
          <button
            className="grid size-8 place-items-center rounded-full text-stone-500 hover:bg-stone-100"
            aria-label="Settings"
            onClick={onSettings}
          >
            <Settings className="size-4" />
          </button>
        </div>
      ) : (
        <button
          className="grid size-7 place-items-center rounded-full bg-teal-700 text-[.58rem] font-bold text-white"
          aria-label="Open profile"
          onClick={onProfile}
        >
          CB
        </button>
      )}
    </header>
  );
}

function MobileNavigation({
  view,
  onNavigate,
  onCompose,
}: {
  view: MockView;
  onNavigate: (view: MockView) => void;
  onCompose: () => void;
}) {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-50 hidden h-[calc(3.75rem+env(safe-area-inset-bottom))] grid-cols-4 border-t border-stone-200 bg-white/95 px-3 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl max-md:grid"
      aria-label="Mobile navigation"
    >
      <MobileNavButton
        active={["home", "thread"].includes(view)}
        label="Home"
        icon={<Home />}
        onClick={() => onNavigate("home")}
      />
      <MobileNavButton
        active={view === "notifications"}
        label="Notifications"
        icon={<Bell />}
        onClick={() => onNavigate("notifications")}
      />
      <MobileNavButton
        active={[
          "profile",
          "public-profile",
          "settings",
          "social-list",
        ].includes(view)}
        label="Profile"
        icon={<UserRound />}
        onClick={() => onNavigate("profile")}
      />
      <button
        className="m-auto grid size-11 -translate-y-1 place-items-center rounded-[.9rem_.9rem_.9rem_.25rem] bg-teal-600 text-white shadow-lg"
        aria-label="Create a post"
        onClick={onCompose}
      >
        <Feather className="size-5" />
      </button>
    </nav>
  );
}

function MobileNavButton({
  active,
  label,
  icon,
  onClick,
}: {
  active: boolean;
  label: string;
  icon: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      aria-label={label}
      className="grid place-items-center text-stone-400 data-[active=true]:text-stone-950 [&>svg]:size-5"
      data-active={active}
      onClick={onClick}
    >
      {icon}
    </button>
  );
}

function ScreenHeader({
  title,
  subtitle,
  onBack,
  onSettings,
  action,
  darkMode,
  onToggleTheme,
}: {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  onSettings?: () => void;
  action?: ReactNode;
  darkMode?: boolean;
  onToggleTheme?: () => void;
}) {
  return (
    <header className="sticky top-0 z-20 flex min-h-16 items-center gap-3 border-b border-stone-200 bg-white/90 px-4 backdrop-blur-xl max-md:hidden">
      {onBack && (
        <button
          className="grid size-9 place-items-center rounded-full text-stone-500 hover:bg-stone-100"
          aria-label="Back"
          onClick={onBack}
        >
          <ArrowLeft className="size-4" />
        </button>
      )}
      <div className="min-w-0">
        <h1 className="text-base font-bold tracking-tight">{title}</h1>
        {subtitle && (
          <p className="mt-0.5 text-[.68rem] text-stone-500">{subtitle}</p>
        )}
      </div>
      <div className="ml-auto flex items-center gap-2">
        {action}
        {onSettings && (
          <>
            <ThemeToggle
              darkMode={darkMode ?? false}
              onToggle={onToggleTheme ?? (() => undefined)}
            />
            <button
              className="grid size-9 place-items-center rounded-full text-stone-500 hover:bg-stone-100"
              aria-label="Settings"
              onClick={onSettings}
            >
              <Settings className="size-4" />
            </button>
          </>
        )}
      </div>
    </header>
  );
}

function ThemeToggle({
  darkMode,
  onToggle,
  compact = false,
}: {
  darkMode: boolean;
  onToggle: () => void;
  compact?: boolean;
}) {
  return (
    <button
      className="grid size-9 place-items-center rounded-full text-stone-500 transition hover:bg-stone-100 hover:text-stone-950 data-[compact=true]:size-8"
      data-compact={compact}
      aria-label={darkMode ? "Use light mode" : "Use dark mode"}
      aria-pressed={darkMode}
      title={darkMode ? "Use light mode" : "Use dark mode"}
      onClick={onToggle}
    >
      {darkMode ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </button>
  );
}

interface HomeProps {
  client: MockApiClient;
  mode: FeedMode;
  filter: FeedFilter;
  window: TopWindow;
  pages: number;
  onMode: (mode: FeedMode) => void;
  onFilter: (filter: FeedFilter) => void;
  onWindow: (window: TopWindow) => void;
  onMore: () => void;
  onCompose: () => void;
  onThread: (id: string) => void;
  onProfile: (id: string) => void;
  onBlock: (intent: BlockIntent) => void;
  onRefresh: () => void;
  onSettings: () => void;
  darkMode: boolean;
  onToggleTheme: () => void;
}

function HomeScreen(props: HomeProps) {
  const first = props.client.getFeed({
    mode: props.mode,
    filter: props.filter,
    window: props.window,
  });
  const posts = [...first.posts];
  let cursor = first.nextCursor;
  for (let page = 1; page < props.pages && cursor; page += 1) {
    const next = props.client.getFeed({
      mode: props.mode,
      filter: props.filter,
      window: props.window,
      cursor,
    });
    posts.push(...next.posts);
    cursor = next.nextCursor;
  }
  return (
    <section aria-label="Home feed">
      <ScreenHeader
        title="Home"
        subtitle="A small, invitation-only feed"
        onSettings={props.onSettings}
        darkMode={props.darkMode}
        onToggleTheme={props.onToggleTheme}
      />
      <FeedControls {...props} />
      <div className="border-b border-stone-200 px-4 py-3">
        <button
          className="flex w-full items-center gap-3 rounded-xl bg-stone-50 px-3 py-2.5 text-left text-sm text-stone-400 transition hover:bg-stone-100"
          onClick={props.onCompose}
        >
          <Avatar label="CB" />
          <span>Share something with the feed…</span>
          <Feather className="ml-auto size-4 text-teal-600" />
        </button>
      </div>
      {posts.length ? (
        <div className="divide-y divide-stone-200">
          {posts.map((post, index) => (
            <PostCard
              key={post.id}
              post={post}
              index={index}
              onOpen={() => props.onThread(post.id)}
              onProfile={props.onProfile}
              onBlock={props.onBlock}
              onSeen={() => props.client.markPostSeen(post.id)}
              onReact={(reaction) => {
                props.client.reactToPost(post.id, reaction);
                props.onRefresh();
              }}
            />
          ))}
        </div>
      ) : (
        <EmptyState
          title={
            props.mode === "following"
              ? "Nothing from people you follow"
              : "You’re caught up"
          }
          detail={
            props.filter === "unread"
              ? "You’ve already seen everything currently available in this view."
              : "Try another feed view."
          }
        />
      )}
      {cursor && (
        <div className="border-t border-stone-200 p-4 text-center">
          <button
            className="rounded-xl border border-stone-200 px-4 py-2 text-xs font-bold text-stone-600 hover:bg-stone-50"
            onClick={props.onMore}
          >
            Load more
          </button>
        </div>
      )}
    </section>
  );
}

function FeedControls(
  props: Pick<
    HomeProps,
    "mode" | "filter" | "window" | "onMode" | "onFilter" | "onWindow"
  >,
) {
  return (
    <div className="border-b border-stone-200 bg-white px-3 py-2.5">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
        <div
          className="grid grid-cols-4 rounded-xl bg-stone-100 p-1"
          role="tablist"
        >
          {(["hot", "new", "top", "following"] as const).map((mode) => (
            <button
              key={mode}
              role="tab"
              aria-selected={props.mode === mode}
              className="rounded-lg px-2 py-1.5 text-[.68rem] font-semibold capitalize text-stone-500 data-[active=true]:bg-white data-[active=true]:text-stone-950 data-[active=true]:shadow-sm"
              data-active={props.mode === mode}
              onClick={() => props.onMode(mode)}
            >
              {mode}
            </button>
          ))}
        </div>
        <button
          className="flex items-center gap-1.5 rounded-xl border border-stone-200 px-3 text-xs font-semibold text-stone-600 data-[active=true]:border-teal-200 data-[active=true]:bg-teal-50 data-[active=true]:text-teal-800"
          aria-label="Unread"
          aria-pressed={props.filter === "unread"}
          data-active={props.filter === "unread"}
          onClick={() =>
            props.onFilter(props.filter === "all" ? "unread" : "all")
          }
        >
          <ListFilter className="size-3.5" />
          <span className="max-sm:hidden">Unread</span>
        </button>
      </div>
      <div className="mt-2 flex min-h-8 items-center gap-3">
        {props.mode === "top" ? (
          <label className="relative rounded-lg bg-stone-100 text-xs font-semibold text-stone-600">
            <select
              className="appearance-none bg-transparent py-2 pl-3 pr-8 outline-none"
              value={props.window}
              onChange={(event) =>
                props.onWindow(event.target.value as TopWindow)
              }
            >
              <option value="day">Today</option>
              <option value="week">This week</option>
              <option value="month">This month</option>
              <option value="all">All time</option>
            </select>
            <ChevronDown className="pointer-events-none absolute right-2 top-2.5 size-3" />
          </label>
        ) : (
          <p className="text-[.65rem] text-stone-400">
            Posts become read as they appear in your feed.
          </p>
        )}
      </div>
    </div>
  );
}

function PostCard({
  post,
  index,
  detail,
  onOpen,
  onProfile,
  onBlock,
  onReact,
  onSeen,
}: {
  post: PostDto;
  index?: number;
  detail?: boolean;
  onOpen?: () => void;
  onProfile: (id: string) => void;
  onBlock: (intent: BlockIntent) => void;
  onReact: (reaction: -1 | 1) => void;
  onSeen?: () => void;
}) {
  const identity = getIdentity(post.author, post.anonymousIdentity);
  const articleRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!onSeen || !articleRef.current) return;
    const article = articleRef.current;
    if (!("IntersectionObserver" in window)) {
      onSeen();
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        onSeen();
        observer.disconnect();
      },
      { threshold: 0.35 },
    );
    observer.observe(article);
    return () => observer.disconnect();
  }, [onSeen, post.id]);

  return (
    <article
      ref={articleRef}
      className="grid grid-cols-[2.5rem_minmax(0,1fr)] gap-3 px-4 py-4 motion-safe:animate-[row-enter_260ms_ease-out_both] max-md:px-3"
      style={{ "--row-index": index ?? 0 } as CSSProperties}
    >
      <Avatar
        label={identity.avatar}
        anonymous={!post.author}
        color={post.anonymousIdentity?.color}
      />
      <div className="min-w-0">
        <header className="flex items-center gap-1.5 text-[.68rem] text-stone-500">
          <AuthorButton
            author={post.author}
            label={identity.label}
            onProfile={onProfile}
          />
          {post.isMine && (
            <span className="rounded-full bg-teal-50 px-1.5 py-0.5 text-[.55rem] font-bold uppercase text-teal-700">
              you
            </span>
          )}
          <time>· {formatRelativeTime(post.createdAt)}</time>
          {!post.isMine && (
            <OverflowMenu
              label={identity.label}
              onBlock={() =>
                onBlock({
                  sourceType: "post",
                  sourceId: post.id,
                  snapshot: {
                    label: identity.label,
                    anonymousIdentity: post.anonymousIdentity ?? undefined,
                  },
                })
              }
            />
          )}
        </header>
        <button
          className="mt-1.5 block w-full text-left text-[.9rem] leading-relaxed text-stone-800 data-[detail=true]:text-base"
          data-detail={detail}
          onClick={onOpen}
        >
          {post.body}
        </button>
        {post.attachments.map((attachment) => (
          <AttachmentPreview key={attachment.id} attachment={attachment} />
        ))}
        <ActionStrip
          score={post.netScore}
          reaction={post.viewerReaction}
          replyCount={post.commentCount}
          replyLabel="comments"
          onReply={onOpen}
          onReact={onReact}
        />
      </div>
    </article>
  );
}

function AttachmentPreview({
  attachment,
}: {
  attachment: PostDto["attachments"][number];
}) {
  return (
    <div
      className="relative mt-3 h-56 overflow-hidden rounded-2xl bg-gradient-to-b from-sky-200 via-amber-100 to-teal-900 ring-1 ring-black/10 max-md:h-[clamp(11rem,54vw,15rem)]"
      role="img"
      aria-label={`Attachment ${attachment.width ?? ""} by ${attachment.height ?? ""}`}
    >
      <span className="absolute right-[20%] top-[18%] size-14 rounded-full bg-amber-200 shadow-[0_0_32px_rgba(253,230,138,.7)]" />
      <span className="absolute inset-x-0 bottom-[20%] h-[58%] bg-teal-700/60 [clip-path:polygon(0_58%,16%_34%,29%_56%,49%_18%,67%_62%,84%_29%,100%_55%,100%_100%,0_100%)]" />
      <span className="absolute inset-x-0 bottom-0 h-[32%] bg-teal-950/65" />
      <span className="absolute bottom-2 right-2 rounded-full bg-black/55 px-2 py-1 text-[.58rem] text-white">
        {attachment.width} × {attachment.height}
      </span>
    </div>
  );
}

function ActionStrip({
  score,
  reaction,
  replyCount,
  replyLabel,
  onReply,
  onReact,
}: {
  score: number;
  reaction: -1 | 1 | null;
  replyCount: number;
  replyLabel: string;
  onReply?: () => void;
  onReact: (reaction: -1 | 1) => void;
}) {
  return (
    <footer className="mt-3 grid grid-cols-[auto_auto_auto_1fr] items-center text-stone-500">
      <VoteButton
        label="Upvote"
        active={reaction === 1}
        onClick={() => onReact(1)}
      >
        <ChevronUp />
      </VoteButton>
      <span
        className="min-w-6 text-center text-xs font-bold text-stone-700"
        aria-label={`${score} net score`}
      >
        {score}
      </span>
      <VoteButton
        label="Downvote"
        active={reaction === -1}
        onClick={() => onReact(-1)}
      >
        <ChevronDown />
      </VoteButton>
      <button
        className="ml-auto flex h-8 items-center gap-1.5 rounded-full px-2 text-xs hover:bg-stone-100 hover:text-teal-700"
        aria-label={`${replyCount} ${replyLabel}`}
        onClick={onReply}
      >
        <MessageCircle className="size-4" />
        {replyCount}
      </button>
    </footer>
  );
}

function VoteButton({
  label,
  active,
  children,
  onClick,
}: {
  label: string;
  active: boolean;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      className="grid size-8 place-items-center rounded-full transition hover:bg-stone-100 data-[active=true]:bg-teal-50 data-[active=true]:text-teal-700 [&>svg]:size-4"
      data-active={active}
      aria-label={label}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function ThreadScreen({
  client,
  postId,
  onBack,
  onReply,
  onProfile,
  onBlock,
  onRefresh,
}: {
  client: MockApiClient;
  postId: string;
  onBack: () => void;
  onReply: (parentId?: string) => void;
  onProfile: (id: string) => void;
  onBlock: (intent: BlockIntent) => void;
  onRefresh: () => void;
}) {
  const post = client.getPost(postId);
  const comments = client.getComments(postId).comments;
  const subscription = client.getSubscription(postId);
  if (!post)
    return (
      <section>
        <ScreenHeader title="Conversation unavailable" onBack={onBack} />
        <EmptyState
          title="This conversation is hidden"
          detail="It may belong to an account you blocked."
        />
      </section>
    );
  return (
    <section>
      <ScreenHeader
        title="Conversation"
        subtitle={`${post.commentCount} comments`}
        onBack={onBack}
        action={
          <button
            className="flex items-center gap-2 rounded-xl border border-stone-200 px-3 py-2 text-[.68rem] font-semibold text-stone-600 data-[active=true]:border-teal-200 data-[active=true]:bg-teal-50 data-[active=true]:text-teal-800"
            aria-pressed={subscription.enabled}
            data-active={subscription.enabled}
            onClick={() => {
              client.updateSubscription(postId, !subscription.enabled);
              onRefresh();
            }}
          >
            {subscription.enabled ? (
              <Bell className="size-3.5" />
            ) : (
              <BellOff className="size-3.5" />
            )}
            Notify me
          </button>
        }
      />
      <div className="hidden items-center justify-between border-b border-stone-200 bg-stone-50 px-3 py-2 max-md:flex">
        <span className="text-[.68rem] font-semibold text-stone-600">
          Thread notifications
        </span>
        <button
          className="flex items-center gap-2 rounded-lg border border-stone-200 bg-white px-3 py-2 text-[.65rem] font-bold text-stone-600 data-[active=true]:border-teal-200 data-[active=true]:bg-teal-50 data-[active=true]:text-teal-800"
          aria-pressed={subscription.enabled}
          data-active={subscription.enabled}
          onClick={() => {
            client.updateSubscription(postId, !subscription.enabled);
            onRefresh();
          }}
        >
          {subscription.enabled ? (
            <Bell className="size-3.5" />
          ) : (
            <BellOff className="size-3.5" />
          )}
          {subscription.enabled ? "On" : "Off"}
        </button>
      </div>
      <PostCard
        post={post}
        detail
        onProfile={onProfile}
        onBlock={onBlock}
        onReact={(reaction) => {
          client.reactToPost(post.id, reaction);
          onRefresh();
        }}
      />
      <div className="border-y border-stone-200 bg-stone-50 px-4 py-3">
        <button
          className="flex w-full items-center gap-3 rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-left text-sm text-stone-400 hover:border-teal-200"
          onClick={() => onReply()}
        >
          <MessageCircle className="size-4" />
          Reply to this conversation
        </button>
      </div>
      <CommentTree
        comments={comments}
        onReply={onReply}
        onProfile={onProfile}
        onBlock={onBlock}
        client={client}
        onRefresh={onRefresh}
      />
      <div className="border-t border-stone-200 p-4 text-center">
        <button className="rounded-xl border border-stone-200 px-4 py-2 text-xs font-bold text-stone-600 hover:bg-stone-50">
          Load more root comments
        </button>
      </div>
    </section>
  );
}

function CommentTree({
  comments,
  ...props
}: {
  comments: CommentDto[];
  onReply: (id: string) => void;
  onProfile: (id: string) => void;
  onBlock: (intent: BlockIntent) => void;
  client: MockApiClient;
  onRefresh: () => void;
}) {
  const roots = comments.filter((comment) => comment.parentCommentId === null);
  return (
    <div className="divide-y divide-stone-200">
      {roots.map((comment) => (
        <CommentBranch
          key={comment.id}
          comment={comment}
          comments={comments}
          {...props}
        />
      ))}
    </div>
  );
}

function CommentBranch({
  comment,
  comments,
  ...props
}: {
  comment: CommentDto;
  comments: CommentDto[];
  onReply: (id: string) => void;
  onProfile: (id: string) => void;
  onBlock: (intent: BlockIntent) => void;
  client: MockApiClient;
  onRefresh: () => void;
}) {
  const children = comments.filter(
    (item) => item.parentCommentId === comment.id,
  );
  return (
    <div>
      <CommentCard comment={comment} {...props} />
      {children.length > 0 && (
        <div className="ml-8 border-l border-stone-200 pl-3 max-md:ml-6 max-md:pl-2">
          {children.map((child) => (
            <CommentBranch
              key={child.id}
              comment={child}
              comments={comments}
              {...props}
            />
          ))}
        </div>
      )}
      {comment.replyCount > children.length && (
        <button className="mb-3 ml-14 text-[.68rem] font-bold text-teal-700">
          Show {comment.replyCount - children.length} more{" "}
          {comment.replyCount - children.length === 1 ? "reply" : "replies"}
        </button>
      )}
    </div>
  );
}

function CommentCard({
  comment,
  onReply,
  onProfile,
  onBlock,
  client,
  onRefresh,
}: {
  comment: CommentDto;
  onReply: (id: string) => void;
  onProfile: (id: string) => void;
  onBlock: (intent: BlockIntent) => void;
  client: MockApiClient;
  onRefresh: () => void;
}) {
  if (comment.status !== "ACTIVE" || !comment.body)
    return (
      <article className="grid grid-cols-[2.5rem_1fr] gap-3 px-4 py-4 text-stone-400">
        <span className="mx-auto h-full w-px bg-stone-200" />
        <div>
          <strong className="text-xs">Comment deleted</strong>
          <p className="mt-1 text-sm">This reply was removed by its author.</p>
          <small className="text-[.65rem]">
            {comment.replyCount} reply remains
          </small>
        </div>
      </article>
    );
  const identity = getIdentity(comment.author, comment.anonymousIdentity);
  return (
    <article className="grid grid-cols-[2.5rem_minmax(0,1fr)] gap-3 px-4 py-4 max-md:px-3">
      <Avatar
        label={identity.avatar}
        anonymous={!comment.author}
        color={comment.anonymousIdentity?.color}
      />
      <div className="min-w-0">
        <header className="flex items-center gap-1.5 text-[.68rem] text-stone-500">
          <AuthorButton
            author={comment.author}
            label={identity.label}
            onProfile={onProfile}
          />
          {comment.isPostAuthor && (
            <span className="rounded-full bg-amber-50 px-1.5 py-0.5 text-[.55rem] font-bold uppercase text-amber-700">
              author
            </span>
          )}
          <time>· {formatRelativeTime(comment.createdAt)}</time>
          {!comment.isMine && (
            <OverflowMenu
              label={identity.label}
              onBlock={() =>
                onBlock({
                  sourceType: "comment",
                  sourceId: comment.id,
                  snapshot: {
                    label: identity.label,
                    anonymousIdentity: comment.anonymousIdentity ?? undefined,
                  },
                })
              }
            />
          )}
        </header>
        <p className="mt-1.5 text-sm leading-relaxed text-stone-700">
          {comment.body}
        </p>
        <ActionStrip
          score={comment.netScore}
          reaction={comment.viewerReaction}
          replyCount={comment.replyCount}
          replyLabel="replies"
          onReply={() => onReply(comment.id)}
          onReact={(reaction) => {
            client.reactToComment(comment.id, reaction);
            onRefresh();
          }}
        />
      </div>
    </article>
  );
}

function NotificationsScreen({
  client,
  filter,
  onFilter,
  onThread,
  onProfile,
  onBlock,
  onRefresh,
  onSettings,
  darkMode,
  onToggleTheme,
}: {
  client: MockApiClient;
  filter: NotificationFilter;
  onFilter: (filter: NotificationFilter) => void;
  onThread: (id: string) => void;
  onProfile: (id: string) => void;
  onBlock: (intent: BlockIntent) => void;
  onRefresh: () => void;
  onSettings: () => void;
  darkMode: boolean;
  onToggleTheme: () => void;
}) {
  const notifications = client.getNotifications(filter).notifications;
  return (
    <section>
      <ScreenHeader
        title="Activity"
        subtitle="Replies, follows, and post milestones"
        onSettings={onSettings}
        darkMode={darkMode}
        onToggleTheme={onToggleTheme}
        action={
          <button
            className="text-[.68rem] font-bold text-teal-700"
            onClick={() => {
              client.markAllNotificationsRead();
              onRefresh();
            }}
          >
            Mark all read
          </button>
        }
      />
      <TabBar
        items={[
          { id: "all", label: "All" },
          { id: "unread", label: "Unread" },
        ]}
        active={filter}
        onChange={onFilter}
        label="Notification filter"
      />
      {notifications.length ? (
        <div className="divide-y divide-stone-200">
          {notifications.map((notification) => (
            <NotificationRow
              key={notification.id}
              notification={notification}
              onOpen={() => {
                client.markNotificationRead(notification.id);
                onRefresh();
                if (notification.postId) onThread(notification.postId);
              }}
              onProfile={onProfile}
              onBlock={onBlock}
            />
          ))}
        </div>
      ) : (
        <EmptyState
          title="No unread notifications"
          detail="New mentions, replies, follows, milestones, and trending awards will appear here."
        />
      )}
    </section>
  );
}

function NotificationRow({
  notification,
  onOpen,
  onProfile,
  onBlock,
}: {
  notification: NotificationDto;
  onOpen: () => void;
  onProfile: (id: string) => void;
  onBlock: (intent: BlockIntent) => void;
}) {
  const actor = notification.payload.actor as PublicAuthor | undefined;
  const anonymousIdentity = notification.payload.anonymousIdentity as
    AnonymousIdentity | undefined;
  const blockable = Boolean(actor || anonymousIdentity);
  const identity = getIdentity(actor ?? null, anonymousIdentity ?? null);
  const copy = notificationCopy(notification);
  return (
    <article
      className="relative grid grid-cols-[2.5rem_minmax(0,1fr)] gap-3 px-4 py-4 transition hover:bg-stone-50 data-[unread=true]:bg-teal-50/35"
      data-unread={!notification.readAt}
    >
      <Avatar
        label={copy.icon ?? identity.avatar}
        anonymous={!actor}
        color={anonymousIdentity?.color}
      />
      <div className="min-w-0">
        <div className="flex items-start gap-2">
          <div
            role="button"
            tabIndex={0}
            className="min-w-0 flex-1 text-left"
            onClick={onOpen}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") onOpen();
            }}
          >
            <p className="text-sm leading-relaxed text-stone-700">
              {actor ? (
                <button
                  className="font-bold text-stone-950 hover:underline"
                  onClick={(event) => {
                    event.stopPropagation();
                    onProfile(actor.userId);
                  }}
                >
                  {actor.displayName}
                </button>
              ) : anonymousIdentity ? (
                <strong className="text-stone-950">Anonymous</strong>
              ) : (
                <strong className="text-stone-950">WakYak</strong>
              )}{" "}
              {copy.text}
            </p>
            {copy.excerpt && (
              <p className="mt-1.5 line-clamp-2 rounded-lg bg-stone-100 px-2.5 py-2 text-xs text-stone-600">
                {copy.excerpt}
              </p>
            )}
            <time className="mt-1.5 block text-[.65rem] text-stone-400">
              {formatRelativeTime(notification.createdAt)}
            </time>
          </div>
          {blockable && (
            <OverflowMenu
              label={identity.label}
              onBlock={() =>
                onBlock({
                  sourceType: "notification",
                  sourceId: notification.id,
                  snapshot: { label: identity.label, anonymousIdentity },
                })
              }
            />
          )}
        </div>
      </div>
      {!notification.readAt && (
        <span className="absolute right-3 top-1/2 size-1.5 -translate-y-1/2 rounded-full bg-teal-500" />
      )}
    </article>
  );
}

function notificationCopy(notification: NotificationDto): {
  text: string;
  excerpt?: string;
  icon?: string;
} {
  const excerpt =
    typeof notification.payload.excerpt === "string"
      ? notification.payload.excerpt
      : undefined;
  switch (notification.type) {
    case "MENTION":
      return { text: "mentioned you", excerpt };
    case "DIRECT_REPLY":
      return { text: "replied directly to you", excerpt };
    case "THREAD_COMMENT":
      return { text: "commented on a conversation you follow", excerpt };
    case "NEW_FOLLOWER":
      return { text: "followed you" };
    case "SCORE_MILESTONE":
      return {
        text: `Your post reached ${String(notification.payload.threshold)} Wakarma`,
        excerpt,
        icon: "↗",
      };
    case "POST_TRENDING":
      return { text: "Your post is trending in the feed", excerpt, icon: "🔥" };
    case "SYSTEM":
      return {
        text: String(notification.payload.message ?? "System update"),
        icon: "W",
      };
    default:
      return { text: "sent you an update" };
  }
}

function ProfileScreen({
  client,
  profileId,
  isSelf,
  tab,
  onTab,
  onThread,
  onBack,
  onSettings,
  onSocialList,
  onBlock,
  onRefresh,
  darkMode,
  onToggleTheme,
}: {
  client: MockApiClient;
  profileId: string;
  isSelf: boolean;
  tab: ProfileTab;
  onTab: (tab: ProfileTab) => void;
  onThread: (id: string) => void;
  onBack?: () => void;
  onSettings: () => void;
  onSocialList: (kind: SocialListKind) => void;
  onBlock: (intent: BlockIntent) => void;
  onRefresh: () => void;
  darkMode: boolean;
  onToggleTheme: () => void;
}) {
  const profile = client.getProfile(profileId);
  if (!profile)
    return (
      <EmptyState
        title="Profile unavailable"
        detail="This profile could not be loaded."
      />
    );
  const following = client.isFollowing(profile.handle);
  const profilePosts = client.getProfilePosts(profileId);
  const profileComments = client.getProfileComments(profileId);
  return (
    <section>
      <ScreenHeader
        title={isSelf ? "Your profile" : "Profile"}
        onBack={onBack}
        onSettings={isSelf ? onSettings : undefined}
        darkMode={darkMode}
        onToggleTheme={onToggleTheme}
      />
      <div className="border-b border-stone-200 px-5 py-6 max-md:px-4">
        <div className="flex items-start gap-4">
          <Avatar label={initials(profile.displayName)} large />
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-bold tracking-tight">
              {profile.displayName}
            </h1>
            <p className="text-xs text-stone-500">@{profile.handle}</p>
            {!isSelf && (
              <div className="mt-3 flex gap-2">
                <button
                  className="rounded-xl px-4 py-2 text-xs font-bold text-white transition data-[active=true]:bg-stone-200 data-[active=true]:text-stone-700 data-[active=false]:bg-teal-600"
                  data-active={following}
                  onClick={() => {
                    if (following) client.unfollow(profile.handle);
                    else client.follow(profile.handle);
                    onRefresh();
                  }}
                >
                  {following ? "Following" : "Follow"}
                </button>
                <OverflowMenu
                  label={profile.displayName}
                  onBlock={() =>
                    onBlock({
                      sourceType: "profile",
                      sourceId: profile.userId,
                      snapshot: { label: profile.displayName },
                    })
                  }
                />
              </div>
            )}
          </div>
        </div>
        {profile.bio && (
          <p className="mt-4 max-w-lg text-sm leading-relaxed text-stone-700">
            {profile.bio}
          </p>
        )}
        <div className="mt-5 grid grid-cols-4 divide-x divide-stone-200 border-y border-stone-200 py-3">
          <Stat value={profile.postCount} label="posts" />
          <button
            disabled={!isSelf}
            className="px-2 text-center transition enabled:hover:text-teal-700 disabled:cursor-default"
            onClick={() => onSocialList("followers")}
          >
            <strong className="block text-lg">{profile.followerCount}</strong>
            <span className="text-[.65rem] text-stone-500">followers</span>
          </button>
          <button
            disabled={!isSelf}
            className="px-2 text-center transition enabled:hover:text-teal-700 disabled:cursor-default"
            onClick={() => onSocialList("following")}
          >
            <strong className="block text-lg">{profile.followingCount}</strong>
            <span className="text-[.65rem] text-stone-500">following</span>
          </button>
          <Stat value={profile.totalWakarma} label="Wakarma" accent />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 px-2 text-[.68rem] text-stone-500">
          <span>
            <strong className="font-bold text-stone-700">
              {profile.postWakarma}
            </strong>{" "}
            from posts
          </span>
          <span aria-hidden="true">·</span>
          <span>
            <strong className="font-bold text-stone-700">
              {profile.commentWakarma}
            </strong>{" "}
            from comments
          </span>
          <span className="ml-auto max-sm:ml-0 max-sm:w-full">
            Anonymous activity is included.
          </span>
        </div>
      </div>
      <TabBar
        items={[
          { id: "posts", label: "Posts" },
          { id: "replies", label: "Replies" },
          { id: "media", label: "Media" },
        ]}
        active={tab}
        onChange={onTab}
        label="Profile content"
      />
      {tab === "posts" &&
        (profilePosts.length ? (
          <div className="divide-y divide-stone-200">
            {profilePosts.map((post) => (
              <PostCard
                key={post.id}
                post={post}
                onOpen={() => onThread(post.id)}
                onProfile={() => undefined}
                onBlock={onBlock}
                onReact={(reaction) => {
                  client.reactToPost(post.id, reaction);
                  onRefresh();
                }}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            title="No identified posts"
            detail="Anonymous posts never appear on profiles."
          />
        ))}
      {tab === "replies" &&
        (profileComments.length ? (
          <div className="divide-y divide-stone-200">
            {profileComments.map((comment) => (
              <button
                key={comment.id}
                className="block w-full px-4 py-4 text-left hover:bg-stone-50"
                onClick={() => onThread(comment.postId)}
              >
                <span className="text-xs text-stone-500">
                  Reply in a conversation
                </span>
                <p className="mt-1.5 text-sm text-stone-800">{comment.body}</p>
                <small className="mt-2 block text-[.65rem] text-stone-400">
                  {formatRelativeTime(comment.createdAt)} · {comment.netScore}{" "}
                  Wakarma
                </small>
              </button>
            ))}
          </div>
        ) : (
          <EmptyState
            title="No identified replies"
            detail="Anonymous replies stay off profile pages."
          />
        ))}
      {tab === "media" && (
        <EmptyState
          title="No public media yet"
          detail="Only attachments from identified posts appear here."
        />
      )}
    </section>
  );
}

function SocialListScreen({
  client,
  kind,
  onBack,
  onProfile,
}: {
  client: MockApiClient;
  kind: SocialListKind;
  onBack: () => void;
  onProfile: (id: string) => void;
}) {
  const list = client.getSocialList(kind).profiles;
  return (
    <section>
      <ScreenHeader
        title={kind === "followers" ? "Followers" : "Following"}
        subtitle="Only you can see this list"
        onBack={onBack}
      />
      <div className="divide-y divide-stone-200">
        {list.map((profile) => (
          <button
            key={profile.userId}
            className="flex w-full items-center gap-3 px-4 py-4 text-left hover:bg-stone-50"
            onClick={() => onProfile(profile.userId)}
          >
            <Avatar label={initials(profile.displayName)} />
            <span>
              <strong className="block text-sm">{profile.displayName}</strong>
              <small className="text-xs text-stone-500">
                @{profile.handle}
              </small>
            </span>
            <ChevronUp className="ml-auto size-4 rotate-90 text-stone-300" />
          </button>
        ))}
      </div>
    </section>
  );
}

function SettingsScreen({
  client,
  onBack,
  onRefresh,
}: {
  client: MockApiClient;
  onBack: () => void;
  onRefresh: () => void;
}) {
  const settings = client.getSettings();
  const blocks = client.getBlocks().blocks;
  const update = (patch: Partial<SettingsDto>) => {
    client.updateSettings(patch);
    onRefresh();
  };
  return (
    <section>
      <ScreenHeader
        title="Settings"
        subtitle="Your member preferences"
        onBack={onBack}
      />
      <SettingsSection
        title="Notifications"
        detail="Choose which activity creates an in-app notification."
      >
        <SettingToggle
          label="Mentions"
          checked={settings.notifyMentions}
          onChange={(checked) => update({ notifyMentions: checked })}
        />
        <SettingToggle
          label="Direct replies"
          checked={settings.notifyDirectReplies}
          onChange={(checked) => update({ notifyDirectReplies: checked })}
        />
        <SettingToggle
          label="Thread comments"
          checked={settings.notifyThreadComments}
          onChange={(checked) => update({ notifyThreadComments: checked })}
        />
        <SettingToggle
          label="New followers"
          checked={settings.notifyNewFollowers}
          onChange={(checked) => update({ notifyNewFollowers: checked })}
        />
        <SettingToggle
          label="Score milestones"
          checked={settings.notifyScoreMilestones}
          onChange={(checked) => update({ notifyScoreMilestones: checked })}
        />
        <SettingToggle
          label="Post trending"
          checked={settings.notifyPostTrending}
          onChange={(checked) => update({ notifyPostTrending: checked })}
        />
        <SettingToggle
          label="System notifications"
          checked
          disabled
          onChange={() => undefined}
          hint="Always on"
        />
      </SettingsSection>
      <SettingsSection
        title="Posting defaults"
        detail="You can still change this in each composer."
      >
        <SettingToggle
          label="Post anonymously by default"
          checked={settings.defaultPostAnonymous}
          onChange={(checked) => update({ defaultPostAnonymous: checked })}
        />
        <SettingToggle
          label="Reply anonymously by default"
          checked={settings.defaultReplyAnonymous}
          onChange={(checked) => update({ defaultReplyAnonymous: checked })}
        />
      </SettingsSection>
      <SettingsSection
        title="Blocked accounts"
        detail="Blocks are opaque. Anonymous accounts remain anonymous here."
      >
        {blocks.length ? (
          blocks.map((block) => (
            <div
              key={block.blockId}
              className="flex items-center gap-3 border-t border-stone-200 px-4 py-3 first:border-t-0"
            >
              <Avatar
                label={
                  block.displaySnapshot.emoji ??
                  initials(block.displaySnapshot.label)
                }
                anonymous={Boolean(block.displaySnapshot.emoji)}
                color={block.displaySnapshot.color ?? undefined}
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
                className="rounded-lg border border-stone-200 px-3 py-2 text-[.65rem] font-bold text-stone-600 hover:bg-stone-50"
                onClick={() => {
                  client.unblock(block.blockId);
                  onRefresh();
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
      <div>{children}</div>
    </section>
  );
}
function SettingToggle({
  label,
  checked,
  disabled,
  hint,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  hint?: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex min-h-12 items-center gap-3 px-4 py-2 text-sm hover:bg-stone-50">
      <span className="flex-1">
        {label}
        {hint && (
          <small className="ml-2 text-[.62rem] text-stone-400">{hint}</small>
        )}
      </span>
      <button
        type="button"
        role="switch"
        aria-label={label}
        aria-checked={checked}
        disabled={disabled}
        className="relative h-6 w-10 rounded-full bg-stone-200 transition data-[checked=true]:bg-teal-600 disabled:opacity-60 after:absolute after:left-1 after:top-1 after:size-4 after:rounded-full after:bg-white after:shadow-sm after:transition data-[checked=true]:after:translate-x-4"
        data-checked={checked}
        onClick={() => onChange(!checked)}
      />
    </div>
  );
}

function TabBar<T extends string>({
  items,
  active,
  onChange,
  label,
}: {
  items: { id: T; label: string }[];
  active: T;
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div
      className="grid h-12 grid-flow-col auto-cols-fr border-b border-stone-200"
      role="tablist"
      aria-label={label}
    >
      {items.map((item) => (
        <button
          key={item.id}
          role="tab"
          aria-selected={active === item.id}
          className="relative text-xs font-semibold text-stone-500 data-[active=true]:text-stone-950 data-[active=true]:after:absolute data-[active=true]:after:inset-x-8 data-[active=true]:after:bottom-0 data-[active=true]:after:h-0.5 data-[active=true]:after:bg-teal-600"
          data-active={active === item.id}
          onClick={() => onChange(item.id)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
function Stat({
  value,
  label,
  accent = false,
}: {
  value: number;
  label: string;
  accent?: boolean;
}) {
  return (
    <div className="px-2 text-center">
      <strong
        className="block text-lg data-[accent=true]:text-teal-700 dark:data-[accent=true]:text-teal-300"
        data-accent={accent}
      >
        {value}
      </strong>
      <span className="text-[.65rem] text-stone-500">{label}</span>
    </div>
  );
}
function EmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="px-6 py-16 text-center">
      <span className="mx-auto grid size-11 place-items-center rounded-2xl bg-stone-100 text-stone-400">
        <Feather className="size-5" />
      </span>
      <h2 className="mt-4 text-sm font-bold">{title}</h2>
      <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-stone-500">
        {detail}
      </p>
    </div>
  );
}

function Avatar({
  label,
  anonymous,
  color,
  large,
}: {
  label: string;
  anonymous?: boolean;
  color?: string;
  large?: boolean;
}) {
  return (
    <span
      className="grid size-10 shrink-0 place-items-center rounded-xl bg-teal-700 text-xs font-bold text-white shadow-sm data-[anonymous=true]:bg-stone-100 data-[anonymous=true]:text-lg data-[large=true]:size-16 data-[large=true]:rounded-2xl data-[large=true]:text-lg"
      data-anonymous={anonymous}
      data-large={large}
      style={
        anonymous && color
          ? { backgroundColor: `${color}18`, color }
          : undefined
      }
    >
      {label}
    </span>
  );
}
function AuthorButton({
  author,
  label,
  onProfile,
}: {
  author: PublicAuthor | null;
  label: string;
  onProfile: (id: string) => void;
}) {
  return author ? (
    <button
      className="font-bold text-stone-900 hover:underline"
      onClick={() => onProfile(author.userId)}
    >
      {label}
    </button>
  ) : (
    <strong className="font-bold text-stone-900">{label}</strong>
  );
}

function OverflowMenu({
  label,
  onBlock,
}: {
  label: string;
  onBlock: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative ml-auto">
      <button
        className="grid size-8 place-items-center rounded-full text-stone-400 hover:bg-stone-100 hover:text-stone-700"
        aria-label={`More actions for ${label}`}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <MoreHorizontal className="size-4" />
      </button>
      {open && (
        <span className="absolute right-0 top-8 z-30 w-44 rounded-xl border border-stone-200 bg-white p-1.5 shadow-xl">
          <button
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-semibold text-red-700 hover:bg-red-50"
            onClick={() => {
              setOpen(false);
              onBlock();
            }}
          >
            <ShieldBan className="size-3.5" />
            Block this account
          </button>
        </span>
      )}
    </span>
  );
}

function BlockDialog({
  intent,
  onClose,
  onConfirm,
}: {
  intent: BlockIntent;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal title="Block account?" onClose={onClose}>
      <div className="p-5">
        <div className="flex items-center gap-3">
          <Avatar
            label={
              intent.snapshot.anonymousIdentity?.emoji ??
              initials(intent.snapshot.label)
            }
            anonymous={Boolean(intent.snapshot.anonymousIdentity)}
            color={intent.snapshot.anonymousIdentity?.color}
          />
          <div>
            <strong className="text-sm">{intent.snapshot.label}</strong>
            <p className="text-xs text-stone-500">
              This uses only the identity visible to you.
            </p>
          </div>
        </div>
        <p className="mt-4 text-sm leading-relaxed text-stone-600">
          You will stop seeing each other’s content and notifications. Any
          follows in either direction will be removed.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            className="rounded-xl px-4 py-2 text-xs font-bold text-stone-600 hover:bg-stone-100"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            className="rounded-xl bg-red-600 px-4 py-2 text-xs font-bold text-white hover:bg-red-700"
            onClick={onConfirm}
          >
            Block
          </button>
        </div>
      </div>
    </Modal>
  );
}

function ComposeDialog({
  client,
  target,
  onClose,
  onCreated,
}: {
  client: MockApiClient;
  target: ComposeTarget;
  onClose: () => void;
  onCreated: (postId?: string) => void;
}) {
  const settings = client.getSettings();
  const [anonymous, setAnonymous] = useState(
    target.type === "post"
      ? settings.defaultPostAnonymous
      : settings.defaultReplyAnonymous,
  );
  const [draft, setDraft] = useState("");
  const [attachment, setAttachment] = useState(false);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!draft.trim()) return;
    if (target.type === "post") {
      const result = client.createPost({
        body: draft.trim(),
        isAnonymous: anonymous,
      });
      onCreated(result.post.id);
    } else {
      client.createComment({
        postId: target.postId,
        parentCommentId: target.parentCommentId,
        body: draft.trim(),
        isAnonymous: anonymous,
      });
      onCreated(target.postId);
    }
  };
  return (
    <Modal
      title={target.type === "post" ? "Create a post" : "Write a reply"}
      onClose={onClose}
    >
      <form className="p-5" onSubmit={submit}>
        <div className="flex items-center gap-3">
          <Avatar label={anonymous ? "🦌" : "CB"} anonymous={anonymous} />
          <div>
            <strong className="block text-sm">
              {anonymous ? "Anonymous" : "Campbell"}
            </strong>
            <span className="text-xs text-stone-500">
              {anonymous ? "Thread-stable identity" : "@campbell"}
            </span>
          </div>
        </div>
        <textarea
          autoFocus
          maxLength={280}
          className="mt-4 min-h-36 w-full resize-none bg-transparent text-lg leading-relaxed outline-none placeholder:text-stone-400"
          placeholder={
            target.type === "post"
              ? "What’s happening?"
              : "Add to the conversation…"
          }
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
        />
        {attachment && (
          <div className="mb-3 flex items-center gap-2 rounded-xl bg-stone-100 px-3 py-2 text-xs text-stone-600">
            <Paperclip className="size-4" />
            reservoir-photo.jpg{" "}
            <button
              type="button"
              className="ml-auto"
              onClick={() => setAttachment(false)}
            >
              <X className="size-3" />
            </button>
          </div>
        )}
        <div className="flex items-center border-t border-stone-200 pt-3">
          <button
            type="button"
            className="grid size-9 place-items-center rounded-xl text-stone-500 hover:bg-stone-100"
            aria-label="Stage attachment"
            onClick={() => setAttachment(true)}
          >
            <Image className="size-4" />
          </button>
          <button
            type="button"
            className="ml-1 flex h-9 items-center gap-2 rounded-xl px-3 text-xs font-semibold text-stone-500 data-[active=true]:bg-teal-50 data-[active=true]:text-teal-700"
            data-active={anonymous}
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
              ? "Replying subscribes unless you previously turned this thread off."
              : "Your default comes from Settings."}
          </p>
          <button
            disabled={!draft.trim()}
            className="rounded-xl bg-teal-600 px-5 py-2.5 text-xs font-bold text-white disabled:opacity-40"
          >
            {target.type === "post" ? "Post" : "Reply"}
          </button>
        </footer>
      </form>
    </Modal>
  );
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-[200] grid place-items-center bg-stone-950/40 p-4 backdrop-blur-sm max-md:block max-md:bg-white max-md:p-0 dark:max-md:bg-[#0c0a09]">
      <section
        className="w-full max-w-xl overflow-visible rounded-2xl bg-white shadow-2xl max-md:min-h-svh max-md:rounded-none"
        role="dialog"
        aria-modal="true"
      >
        <header className="grid min-h-14 grid-cols-[2.25rem_1fr_2.25rem] place-items-center border-b border-stone-200 px-3 max-md:pt-[env(safe-area-inset-top)]">
          <button
            className="grid size-9 place-items-center rounded-full text-stone-500 hover:bg-stone-100"
            aria-label="Close dialog"
            onClick={onClose}
          >
            <X className="size-4" />
          </button>
          <h2 className="text-sm font-bold">{title}</h2>
          <span />
        </header>
        {children}
      </section>
    </div>
  );
}

function getIdentity(
  author: PublicAuthor | null,
  anonymousIdentity: AnonymousIdentity | null,
): { label: string; avatar: string } {
  return author
    ? { label: author.displayName, avatar: initials(author.displayName) }
    : { label: "Anonymous", avatar: anonymousIdentity?.emoji ?? "?" };
}
function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}
