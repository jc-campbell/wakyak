import {
  ArrowLeft,
  Bell,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronUp,
  Feather,
  Home,
  Image,
  Info,
  ListFilter,
  MessageCircle,
  MoreHorizontal,
  Search,
  Settings,
  Share,
  Sparkles,
  UserRound,
  Users,
  X,
} from "lucide-react";
import {
  startTransition,
  useEffect,
  useEffectEvent,
  useState,
  type CSSProperties,
  type FormEvent,
} from "react";

import {
  comments,
  currentProfile,
  notifications,
  posts,
  trends,
} from "@/showcase/data";
import type {
  CommentData,
  FeedSort,
  MockView,
  NotificationFilter,
  PostData,
  ProfileTab,
  TopWindow,
} from "@/showcase/types";

export function WakYakApp() {
  const [view, setView] = useState<MockView>("home");
  const [selectedPostId, setSelectedPostId] = useState("reservoir-walk");
  const [feedSort, setFeedSort] = useState<FeedSort>("hot");
  const [topWindow, setTopWindow] = useState<TopWindow>("week");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [notificationFilter, setNotificationFilter] =
    useState<NotificationFilter>("all");
  const [profileTab, setProfileTab] = useState<ProfileTab>("posts");
  const [composeOpen, setComposeOpen] = useState(false);
  const [anonymous, setAnonymous] = useState(true);
  const [draft, setDraft] = useState("");
  const [toast, setToast] = useState<string>();

  const closeComposer = useEffectEvent(() => setComposeOpen(false));

  useEffect(() => {
    if (!composeOpen) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") closeComposer();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [composeOpen]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(undefined), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [view]);

  function navigate(nextView: MockView) {
    startTransition(() => setView(nextView));
  }

  function openThread(postId: string) {
    setSelectedPostId(postId);
    navigate("thread");
  }

  function submitMockPost(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.trim() || draft.length > 280) return;
    setComposeOpen(false);
    setDraft("");
    setAnonymous(true);
    setToast("Mock post added to the showcase");
  }

  const selectedPost =
    posts.find((post) => post.id === selectedPostId) ?? posts[1];

  return (
    <div className="relative isolate min-h-dvh overflow-x-clip bg-stone-100 text-stone-950">
      <div
        className="pointer-events-none fixed -right-40 -top-64 -z-10 aspect-square w-[38rem] rounded-full bg-teal-300/20 blur-3xl max-md:hidden"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none fixed -bottom-80 -left-48 -z-10 aspect-square w-[38rem] rounded-full bg-amber-200/30 blur-3xl max-md:hidden"
        aria-hidden="true"
      />

      <AppShell
        view={view}
        feedSort={feedSort}
        topWindow={topWindow}
        unreadOnly={unreadOnly}
        notificationFilter={notificationFilter}
        profileTab={profileTab}
        selectedPost={selectedPost}
        onNavigate={navigate}
        onOpenComposer={() => setComposeOpen(true)}
        onOpenThread={openThread}
        onFeedSortChange={setFeedSort}
        onTopWindowChange={setTopWindow}
        onUnreadOnlyChange={setUnreadOnly}
        onNotificationFilterChange={setNotificationFilter}
        onProfileTabChange={setProfileTab}
      />

      {composeOpen ? (
        <ComposeDialog
          anonymous={anonymous}
          draft={draft}
          onAnonymousChange={() => setAnonymous((value) => !value)}
          onClose={() => setComposeOpen(false)}
          onDraftChange={setDraft}
          onSubmit={submitMockPost}
        />
      ) : null}

      {toast ? (
        <div
          className="fixed left-1/2 top-5 z-[250] flex -translate-x-1/2 items-center gap-2 rounded-full bg-stone-950 px-4 py-2.5 text-xs font-semibold text-white shadow-xl motion-safe:animate-[toast-in_220ms_ease-out_both] [&>svg]:size-4"
          role="status"
        >
          <Check /> {toast}
        </div>
      ) : null}
    </div>
  );
}

interface ShellProps {
  view: MockView;
  feedSort: FeedSort;
  topWindow: TopWindow;
  unreadOnly: boolean;
  notificationFilter: NotificationFilter;
  profileTab: ProfileTab;
  selectedPost: PostData;
  onNavigate: (view: MockView) => void;
  onOpenComposer: () => void;
  onOpenThread: (postId: string) => void;
  onFeedSortChange: (sort: FeedSort) => void;
  onTopWindowChange: (window: TopWindow) => void;
  onUnreadOnlyChange: (unreadOnly: boolean) => void;
  onNotificationFilterChange: (filter: NotificationFilter) => void;
  onProfileTabChange: (tab: ProfileTab) => void;
}

function AppShell(props: ShellProps) {
  return (
    <div className="relative z-0 min-h-dvh w-full">
      <div className="mx-auto grid min-h-dvh w-full max-w-[66rem] grid-cols-[12.75rem_minmax(0,36rem)_17.25rem] max-lg:max-w-[48.75rem] max-lg:grid-cols-[12.75rem_minmax(0,36rem)] max-md:block max-md:min-h-svh">
        <LeftNavigation
          activeView={props.view}
          onNavigate={props.onNavigate}
          onOpenComposer={props.onOpenComposer}
        />
        <main className="min-h-dvh min-w-0 border-x border-stone-200 bg-white max-md:min-h-svh max-md:border-0">
          <MobileHeader
            view={props.view}
            onBack={() => props.onNavigate("home")}
            onProfile={() => props.onNavigate("profile")}
          />
          <div
            className="animate-[screen-enter_240ms_ease-out_both] max-md:pb-28 motion-reduce:animate-none"
            key={props.view}
          >
            {props.view === "home" ? (
              <HomeScreen
                sort={props.feedSort}
                topWindow={props.topWindow}
                unreadOnly={props.unreadOnly}
                onOpenComposer={props.onOpenComposer}
                onOpenThread={props.onOpenThread}
                onSortChange={props.onFeedSortChange}
                onTopWindowChange={props.onTopWindowChange}
                onUnreadOnlyChange={props.onUnreadOnlyChange}
              />
            ) : null}
            {props.view === "thread" ? (
              <ThreadScreen
                post={props.selectedPost}
                onBack={() => props.onNavigate("home")}
                onOpenComposer={props.onOpenComposer}
              />
            ) : null}
            {props.view === "notifications" ? (
              <NotificationsScreen
                filter={props.notificationFilter}
                onFilterChange={props.onNotificationFilterChange}
                onOpenThread={() => props.onOpenThread("reservoir-walk")}
              />
            ) : null}
            {props.view === "profile" ? (
              <ProfileScreen
                tab={props.profileTab}
                onOpenThread={props.onOpenThread}
                onTabChange={props.onProfileTabChange}
              />
            ) : null}
          </div>
        </main>
        <ContextRail view={props.view} selectedPost={props.selectedPost} />
      </div>
      <MobileNavigation
        activeView={props.view}
        onNavigate={props.onNavigate}
        onOpenComposer={props.onOpenComposer}
      />
    </div>
  );
}

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className="flex items-center gap-2.5 [&>strong]:text-lg [&>strong]:font-bold [&>strong]:tracking-tight"
      aria-label="WakYak"
    >
      <span
        className="grid size-8 -rotate-3 place-items-center rounded-[0.65rem_0.65rem_0.65rem_0.2rem] bg-teal-600 text-xs font-black text-white shadow-sm"
        aria-hidden="true"
      >
        W
      </span>
      {!compact ? <strong>WakYak</strong> : null}
    </div>
  );
}

function LeftNavigation({
  activeView,
  onNavigate,
  onOpenComposer,
}: {
  activeView: MockView;
  onNavigate: (view: MockView) => void;
  onOpenComposer: () => void;
}) {
  const items = [
    { view: "home" as const, label: "Home", icon: Home },
    {
      view: "notifications" as const,
      label: "Notifications",
      icon: Bell,
      badge: true,
    },
    { view: "profile" as const, label: "Profile", icon: UserRound },
  ];

  return (
    <aside className="min-w-0 max-md:hidden">
      <nav
        className="sticky top-0 flex h-dvh flex-col px-3 py-5"
        aria-label="Primary navigation"
      >
        <button
          className="rounded-xl p-2 text-left transition hover:bg-white/60"
          onClick={() => onNavigate("home")}
        >
          <Brand />
        </button>
        <div className="mt-7 flex flex-col gap-1">
          {items.map(({ view, label, icon: Icon, badge }) => (
            <button
              className="group flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium text-stone-500 transition hover:bg-white/70 hover:text-stone-900 data-[active=true]:bg-white data-[active=true]:font-semibold data-[active=true]:text-stone-950 data-[active=true]:shadow-sm"
              data-active={activeView === view}
              aria-label={label}
              key={view}
              onClick={() => onNavigate(view)}
            >
              <span className="relative grid size-6 place-items-center [&>svg]:size-[1.1rem] [&>i]:absolute [&>i]:right-0 [&>i]:top-0 [&>i]:size-1.5 [&>i]:rounded-full [&>i]:bg-teal-500 [&>i]:ring-2 [&>i]:ring-stone-100">
                <Icon />
                {badge ? <i /> : null}
              </span>
              <span>{label}</span>
            </button>
          ))}
        </div>
        <button
          className="mt-6 flex h-11 items-center justify-center gap-2 rounded-xl bg-teal-600 text-sm font-bold text-white shadow-sm transition hover:bg-teal-700 active:scale-[0.98] [&>svg]:size-4"
          aria-label="Create a post"
          onClick={onOpenComposer}
        >
          <Feather /> <span>Post</span>
        </button>
        <button
          className="mt-auto grid grid-cols-[2.25rem_1fr_auto] items-center gap-2 rounded-xl p-2 text-left transition hover:bg-white/70 [&>svg]:size-4 [&>svg]:text-stone-400"
          aria-label="Open profile"
          onClick={() => onNavigate("profile")}
        >
          <Avatar label="CB" />
          <span className="min-w-0 [&>strong]:block [&>strong]:truncate [&>strong]:text-xs [&>strong]:font-semibold [&>small]:block [&>small]:truncate [&>small]:text-[0.68rem] [&>small]:text-stone-500">
            <strong>Campbell</strong>
            <small>@campbell</small>
          </span>
          <MoreHorizontal />
        </button>
      </nav>
    </aside>
  );
}

function MobileHeader({
  view,
  onBack,
  onProfile,
}: {
  view: MockView;
  onBack: () => void;
  onProfile: () => void;
}) {
  const titles: Record<MockView, string> = {
    home: "Home",
    thread: "Conversation",
    notifications: "Activity",
    profile: "Profile",
  };
  return (
    <header className="sticky top-0 z-30 hidden h-[calc(3.25rem+env(safe-area-inset-top))] grid-cols-[2rem_1fr_2rem] place-items-center border-b border-stone-200 bg-white/90 px-3 pt-[env(safe-area-inset-top)] backdrop-blur-xl max-md:grid [&>strong]:text-xs [&>strong]:font-bold">
      {view === "thread" ? (
        <button
          className="grid size-9 shrink-0 place-items-center rounded-full text-stone-500 transition hover:bg-stone-100 hover:text-stone-950 [&>svg]:size-4"
          aria-label="Back to home"
          onClick={onBack}
        >
          <ArrowLeft />
        </button>
      ) : (
        <Brand compact />
      )}
      <strong>{titles[view]}</strong>
      <button
        className="grid size-7 place-items-center rounded-full bg-teal-700 text-[0.58rem] font-bold text-white"
        aria-label="Open profile"
        onClick={onProfile}
      >
        CB
      </button>
    </header>
  );
}

function MobileNavigation({
  activeView,
  onNavigate,
  onOpenComposer,
}: {
  activeView: MockView;
  onNavigate: (view: MockView) => void;
  onOpenComposer: () => void;
}) {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-50 hidden h-[calc(3.75rem+env(safe-area-inset-bottom))] grid-cols-4 border-t border-stone-200 bg-white/95 px-3 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl max-md:grid [&>button]:relative [&>button]:grid [&>button]:place-items-center [&>button]:text-stone-400 [&>button]:transition [&>button]:data-[active=true]:text-stone-950 [&>button>svg]:size-5"
      aria-label="Mobile navigation"
    >
      <button
        data-active={activeView === "home" || activeView === "thread"}
        aria-label="Home"
        onClick={() => onNavigate("home")}
      >
        <Home />
      </button>
      <button
        data-active={activeView === "notifications"}
        aria-label="Notifications"
        onClick={() => onNavigate("notifications")}
      >
        <Bell />
      </button>
      <button
        data-active={activeView === "profile"}
        aria-label="Profile"
        onClick={() => onNavigate("profile")}
      >
        <UserRound />
      </button>
      <button
        className="m-auto size-11 -translate-y-1 rounded-[0.9rem_0.9rem_0.9rem_0.25rem] bg-teal-600! text-white! shadow-lg shadow-teal-600/20"
        aria-label="Create a post"
        onClick={onOpenComposer}
      >
        <Feather />
      </button>
    </nav>
  );
}

function ScreenHeader({
  title,
  subtitle,
  onBack,
}: {
  title: string;
  subtitle?: string;
  onBack?: () => void;
}) {
  return (
    <header className="sticky top-0 z-20 flex min-h-16 items-center gap-3 border-b border-stone-200 bg-white/90 px-4 backdrop-blur-xl max-md:hidden [&>div]:min-w-0 [&_h1]:text-base [&_h1]:font-bold [&_h1]:tracking-tight [&_p]:mt-0.5 [&_p]:text-[0.68rem] [&_p]:text-stone-500">
      {onBack ? (
        <button
          className="grid size-9 shrink-0 place-items-center rounded-full text-stone-500 transition hover:bg-stone-100 hover:text-stone-950 [&>svg]:size-4"
          aria-label="Back to home"
          onClick={onBack}
        >
          <ArrowLeft />
        </button>
      ) : null}
      <div>
        <h1>{title}</h1>
        {subtitle ? <p>{subtitle}</p> : null}
      </div>
      <button
        className="ml-auto grid size-9 shrink-0 place-items-center rounded-full text-stone-500 transition hover:bg-stone-100 hover:text-stone-950 [&>svg]:size-4"
        aria-label={`${title} settings`}
      >
        <Settings />
      </button>
    </header>
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
  onChange: (item: T) => void;
  label: string;
}) {
  return (
    <div
      className="grid h-12 grid-flow-col auto-cols-fr border-b border-stone-200 bg-white [&>button]:relative [&>button]:text-xs [&>button]:font-semibold [&>button]:text-stone-500 [&>button]:transition [&>button]:hover:bg-stone-50 [&>button]:data-[active=true]:text-stone-950 [&>button]:data-[active=true]:after:absolute [&>button]:data-[active=true]:after:inset-x-6 [&>button]:data-[active=true]:after:bottom-0 [&>button]:data-[active=true]:after:h-0.5 [&>button]:data-[active=true]:after:rounded-full [&>button]:data-[active=true]:after:bg-teal-600"
      role="tablist"
      aria-label={label}
    >
      {items.map((item) => (
        <button
          key={item.id}
          role="tab"
          aria-selected={active === item.id}
          data-active={active === item.id}
          onClick={() => onChange(item.id)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

function FeedSortControl({
  sort,
  topWindow,
  unreadOnly,
  onSortChange,
  onTopWindowChange,
  onUnreadOnlyChange,
}: {
  sort: FeedSort;
  topWindow: TopWindow;
  unreadOnly: boolean;
  onSortChange: (sort: FeedSort) => void;
  onTopWindowChange: (window: TopWindow) => void;
  onUnreadOnlyChange: (unreadOnly: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-stone-200 bg-white px-3 py-2.5 max-md:grid max-md:grid-cols-[minmax(0,1fr)_auto]">
      <div className="flex min-w-0 items-center gap-2 max-md:contents">
        <div
          className="grid min-w-56 grid-cols-3 rounded-xl bg-stone-100 p-1 max-md:min-w-0 [&>button]:rounded-lg [&>button]:px-4 [&>button]:py-1.5 [&>button]:text-xs [&>button]:font-semibold [&>button]:text-stone-500 [&>button]:transition [&>button]:hover:text-stone-900 [&>button]:data-[active=true]:bg-white [&>button]:data-[active=true]:text-stone-950 [&>button]:data-[active=true]:shadow-sm"
          role="tablist"
          aria-label="Feed sort"
        >
          {(["hot", "new", "top"] as const).map((item) => (
            <button
              key={item}
              role="tab"
              aria-selected={sort === item}
              data-active={sort === item}
              onClick={() => onSortChange(item)}
            >
              {item[0].toUpperCase() + item.slice(1)}
            </button>
          ))}
        </div>
        {sort === "top" ? (
          <label className="relative flex min-w-28 items-center rounded-lg bg-stone-100 pr-2 text-xs font-semibold text-stone-600 max-md:col-span-2 max-md:row-start-2 max-md:w-fit [&>select]:w-full [&>select]:appearance-none [&>select]:bg-transparent [&>select]:py-2 [&>select]:pl-3 [&>select]:pr-7 [&>select]:outline-none [&>svg]:pointer-events-none [&>svg]:absolute [&>svg]:right-2 [&>svg]:size-3.5">
            <span className="sr-only">Top posts timeframe</span>
            <select
              aria-label="Top posts timeframe"
              value={topWindow}
              onChange={(event) =>
                onTopWindowChange(event.target.value as TopWindow)
              }
            >
              <option value="day">Today</option>
              <option value="week">This week</option>
              <option value="month">This month</option>
              <option value="all">All time</option>
            </select>
            <ChevronDown aria-hidden="true" />
          </label>
        ) : null}
      </div>
      <button
        className="flex h-9 items-center gap-2 rounded-xl border border-stone-200 bg-white px-3 text-xs font-semibold text-stone-600 transition hover:border-stone-300 hover:text-stone-950 data-[active=true]:border-teal-200 data-[active=true]:bg-teal-50 data-[active=true]:text-teal-800 [&>svg]:size-3.5"
        aria-pressed={unreadOnly}
        data-active={unreadOnly}
        onClick={() => onUnreadOnlyChange(!unreadOnly)}
      >
        <ListFilter aria-hidden="true" />
        <span>Unread</span>
      </button>
    </div>
  );
}

function HomeScreen({
  sort,
  topWindow,
  unreadOnly,
  onSortChange,
  onTopWindowChange,
  onUnreadOnlyChange,
  onOpenComposer,
  onOpenThread,
}: {
  sort: FeedSort;
  topWindow: TopWindow;
  unreadOnly: boolean;
  onSortChange: (sort: FeedSort) => void;
  onTopWindowChange: (window: TopWindow) => void;
  onUnreadOnlyChange: (unreadOnly: boolean) => void;
  onOpenComposer: () => void;
  onOpenThread: (postId: string) => void;
}) {
  const orderedPosts = (
    sort === "top"
      ? [...posts].sort((a, b) => b.score - a.score)
      : sort === "new"
        ? [...posts].reverse()
        : posts
  ).filter((post) => !unreadOnly || post.unread);
  return (
    <section className="min-w-0" aria-label="Home feed">
      <ScreenHeader title="Home" subtitle="42 friends · 9 new posts" />
      <FeedSortControl
        sort={sort}
        topWindow={topWindow}
        unreadOnly={unreadOnly}
        onSortChange={onSortChange}
        onTopWindowChange={onTopWindowChange}
        onUnreadOnlyChange={onUnreadOnlyChange}
      />
      <ComposerPreview onOpen={onOpenComposer} />
      <div className="divide-y divide-stone-200">
        {orderedPosts.slice(0, 4).map((post, index) => (
          <PostCard
            index={index}
            key={post.id}
            post={post}
            onOpen={() => onOpenThread(post.id)}
          />
        ))}
      </div>
    </section>
  );
}

function ThreadScreen({
  post,
  onBack,
  onOpenComposer,
}: {
  post: PostData;
  onBack: () => void;
  onOpenComposer: () => void;
}) {
  return (
    <section className="min-w-0">
      <ScreenHeader
        title="Conversation"
        subtitle={`${post.comments} replies`}
        onBack={onBack}
      />
      <PostCard detail post={post} onOpen={() => undefined} />
      <button
        className="grid w-full grid-cols-[2.5rem_1fr_auto] items-center gap-3 border-y border-stone-200 bg-stone-50 px-4 py-3 text-left transition hover:bg-stone-100 max-md:px-3 [&>span:nth-child(2)]:text-sm [&>span:nth-child(2)]:text-stone-500 [&>strong]:text-xs [&>strong]:font-bold [&>strong]:text-teal-700"
        onClick={onOpenComposer}
      >
        <Avatar label="🦌" anonymous />
        <span>Reply anonymously</span>
        <strong>Reply</strong>
      </button>
      <CommentTree />
    </section>
  );
}

function NotificationsScreen({
  filter,
  onFilterChange,
  onOpenThread,
}: {
  filter: NotificationFilter;
  onFilterChange: (filter: NotificationFilter) => void;
  onOpenThread: () => void;
}) {
  const visible =
    filter === "mentions"
      ? notifications.filter((notification) => notification.kind === "mention")
      : notifications;
  return (
    <section className="min-w-0">
      <ScreenHeader title="Notifications" subtitle="3 unread since yesterday" />
      <TabBar
        label="Notification filters"
        active={filter}
        onChange={onFilterChange}
        items={[
          { id: "all", label: "All" },
          { id: "mentions", label: "Mentions" },
        ]}
      />
      <div className="divide-y divide-stone-200">
        {visible.map((notification, index) => (
          <button
            className="grid w-full grid-cols-[2.5rem_minmax(0,1fr)_auto] gap-3 px-4 py-4 text-left transition hover:bg-stone-50 data-[unread=true]:bg-teal-50/50 max-md:px-3 motion-safe:animate-[row-enter_260ms_ease-out_both] motion-safe:[animation-delay:calc(var(--row-index)*40ms)]"
            data-unread={notification.unread}
            key={notification.id}
            onClick={onOpenThread}
            style={{ "--row-index": index } as CSSProperties}
          >
            <Avatar
              label={notification.avatar}
              anonymous={!notification.avatar.match(/^[A-Z♥W]+$/)}
            />
            <span className="min-w-0 [&>span]:block [&>span]:text-sm [&>span]:leading-relaxed [&>span>strong]:font-bold [&>q]:mt-1 [&>q]:block [&>q]:truncate [&>q]:rounded-lg [&>q]:bg-stone-100 [&>q]:px-2.5 [&>q]:py-1.5 [&>q]:text-xs [&>q]:text-stone-600 [&>time]:mt-1.5 [&>time]:block [&>time]:text-[0.65rem] [&>time]:text-stone-400">
              <span>
                <strong>{notification.actor}</strong> {notification.text}
              </span>
              {notification.excerpt ? <q>{notification.excerpt}</q> : null}
              <time>{notification.time}</time>
            </span>
            {notification.unread ? (
              <i className="mt-2 size-2 rounded-full bg-teal-500" />
            ) : null}
          </button>
        ))}
      </div>
    </section>
  );
}

function ProfileScreen({
  tab,
  onTabChange,
  onOpenThread,
}: {
  tab: ProfileTab;
  onTabChange: (tab: ProfileTab) => void;
  onOpenThread: (postId: string) => void;
}) {
  const profilePosts = posts.filter((post) => post.mine);
  return (
    <section className="min-w-0">
      <ScreenHeader
        title={currentProfile.name}
        subtitle={`${currentProfile.posts} posts`}
      />
      <div
        className="relative h-36 overflow-hidden bg-gradient-to-br from-teal-100 via-emerald-50 to-amber-100 [&>span]:absolute [&>span]:rounded-full [&>span]:bg-white/40 [&>span:first-child]:-right-12 [&>span:first-child]:-top-16 [&>span:first-child]:size-48 [&>span:nth-child(2)]:bottom-[-4rem] [&>span:nth-child(2)]:left-[18%] [&>span:nth-child(2)]:size-36 [&>span:nth-child(3)]:right-[28%] [&>span:nth-child(3)]:top-8 [&>span:nth-child(3)]:size-10 max-md:h-28"
        aria-hidden="true"
      >
        <span />
        <span />
        <span />
      </div>
      <div className="relative px-4 pb-5 pt-14 [&>span:first-child]:absolute [&>span:first-child]:-top-7 [&>span:first-child]:size-16 [&>span:first-child]:text-sm [&>h2]:text-lg [&>h2]:font-bold [&>h2]:tracking-tight [&>span]:text-sm [&>span]:text-stone-500 [&>p]:mt-3 [&>p]:max-w-md [&>p]:text-sm [&>p]:leading-relaxed [&>p]:text-stone-700 [&>small]:mt-3 [&>small]:flex [&>small]:items-center [&>small]:gap-1.5 [&>small]:text-xs [&>small]:text-stone-500 [&>small>svg]:size-3.5 [&>dl]:mt-4 [&>dl]:flex [&>dl]:gap-7 [&>dl_div]:flex [&>dl_div]:items-baseline [&>dl_div]:gap-1.5 [&>dl_dd]:text-sm [&>dl_dd]:font-bold [&>dl_dt]:text-xs [&>dl_dt]:text-stone-500">
        <Avatar label={currentProfile.initials} />
        <button className="absolute right-4 top-4 rounded-xl border border-stone-300 bg-white px-3 py-2 text-xs font-bold transition hover:bg-stone-50">
          Edit profile
        </button>
        <h2>{currentProfile.name}</h2>
        <span>{currentProfile.handle}</span>
        <p>{currentProfile.bio}</p>
        <small>
          <CalendarDays /> {currentProfile.joined}
        </small>
        <dl>
          <div>
            <dd>{currentProfile.friends}</dd>
            <dt>Friends</dt>
          </div>
          <div>
            <dd>{currentProfile.posts}</dd>
            <dt>Posts</dt>
          </div>
        </dl>
      </div>
      <TabBar
        label="Profile content"
        active={tab}
        onChange={onTabChange}
        items={[
          { id: "posts", label: "Posts" },
          { id: "replies", label: "Replies" },
          { id: "media", label: "Media" },
        ]}
      />
      <div className="divide-y divide-stone-200">
        {tab === "replies" ? (
          <ProfileReply onOpen={() => onOpenThread("reservoir-walk")} />
        ) : (
          profilePosts
            .filter((post) => tab !== "media" || post.image)
            .map((post, index) => (
              <PostCard
                index={index}
                key={post.id}
                post={post}
                onOpen={() => onOpenThread(post.id)}
              />
            ))
        )}
      </div>
    </section>
  );
}

function ComposerPreview({ onOpen }: { onOpen: () => void }) {
  return (
    <button
      className="grid w-full grid-cols-[2.5rem_minmax(0,1fr)_auto_auto] items-center gap-3 border-b border-stone-200 px-4 py-3 text-left transition hover:bg-stone-50 max-md:px-3 [&>span:nth-child(2)]:truncate [&>span:nth-child(2)]:text-sm [&>span:nth-child(2)]:text-stone-500 [&>strong]:rounded-lg [&>strong]:bg-teal-600 [&>strong]:px-4 [&>strong]:py-2 [&>strong]:text-xs [&>strong]:font-bold [&>strong]:text-white"
      onClick={onOpen}
    >
      <Avatar label="🦌" anonymous />
      <span>Share something anonymously…</span>
      <span className="flex items-center gap-2 text-stone-400 [&>svg]:size-4">
        <Image />
        <Users />
      </span>
      <strong>Post</strong>
    </button>
  );
}

function Avatar({
  label,
  anonymous = false,
}: {
  label: string;
  anonymous?: boolean;
}) {
  return (
    <span
      className="grid size-10 shrink-0 place-items-center rounded-full bg-teal-700 text-[0.66rem] font-bold text-white ring-1 ring-black/5 data-[anonymous=true]:bg-teal-50 data-[anonymous=true]:text-base data-[anonymous=true]:ring-teal-200"
      data-anonymous={anonymous}
      aria-hidden="true"
    >
      {label}
    </span>
  );
}

function PostCard({
  post,
  onOpen,
  index = 0,
  detail = false,
}: {
  post: PostData;
  onOpen: () => void;
  index?: number;
  detail?: boolean;
}) {
  const anonymous = !post.handle;
  return (
    <article
      className="grid grid-cols-[2.5rem_minmax(0,1fr)] gap-3 px-4 py-4 transition hover:bg-stone-50 max-md:px-3 data-[detail=true]:py-5 motion-safe:animate-[row-enter_260ms_ease-out_both] motion-safe:[animation-delay:calc(var(--post-index)*45ms)]"
      data-detail={detail}
      style={{ "--post-index": index } as CSSProperties}
    >
      <Avatar label={post.avatar} anonymous={anonymous} />
      <div className="min-w-0">
        <header className="flex min-w-0 items-start justify-between gap-2 [&>div]:flex [&>div]:min-w-0 [&>div]:items-center [&>div]:gap-1.5 [&>div]:text-[0.68rem] [&>div]:text-stone-500 [&_strong]:truncate [&_strong]:text-xs [&_strong]:font-bold [&_strong]:text-stone-900 [&_time]:shrink-0 [&>button]:grid [&>button]:size-7 [&>button]:shrink-0 [&>button]:place-items-center [&>button]:rounded-full [&>button]:text-stone-400 [&>button]:transition [&>button]:hover:bg-stone-100 [&>button]:hover:text-stone-700 [&>button>svg]:size-4">
          <div>
            <strong>{post.identity}</strong>
            {anonymous ? (
              <span className="rounded-full bg-teal-50 px-1.5 py-0.5 text-[0.52rem] font-bold uppercase tracking-wider text-teal-700 max-[390px]:hidden">
                anonymous
              </span>
            ) : (
              <span>{post.handle}</span>
            )}
            <span>·</span>
            <time>{post.time}</time>
            {post.unread ? (
              <span
                className="size-1.5 shrink-0 rounded-full bg-teal-500 ring-2 ring-teal-50"
                aria-label="Unread post"
              />
            ) : null}
          </div>
          <button aria-label="More post actions">
            <MoreHorizontal />
          </button>
        </header>
        <button
          className="mt-1.5 flex w-full flex-col text-left [&>span:first-child]:text-[0.9rem] [&>span:first-child]:leading-relaxed [&>span:first-child]:text-stone-800 data-[detail=true]:[&>span:first-child]:text-base"
          data-detail={detail}
          onClick={onOpen}
        >
          <span>{post.body}</span>
          {post.image ? <PostImage /> : null}
        </button>
        <ActionStrip
          score={post.score}
          replyCount={post.comments}
          replyLabel="comments"
          onReply={onOpen}
        />
      </div>
    </article>
  );
}

function ActionStrip({
  score,
  replyCount,
  replyLabel,
  onReply,
}: {
  score: number;
  replyCount: number;
  replyLabel: "comments" | "replies";
  onReply?: () => void;
}) {
  return (
    <footer className="mt-3 grid w-full grid-cols-[auto_auto_auto_1fr_auto] items-center text-stone-500 [&>button]:grid [&>button]:size-8 [&>button]:place-items-center [&>button]:rounded-full [&>button]:transition [&>button]:hover:bg-stone-100 [&>button]:hover:text-teal-700 [&>button]:active:scale-90 [&>button>svg]:size-4">
      <button aria-label="Upvote">
        <ChevronUp />
      </button>
      <span
        className="min-w-6 text-center text-xs font-bold text-stone-700"
        aria-label={`${score} points`}
      >
        {score}
      </span>
      <button aria-label="Downvote">
        <ChevronDown />
      </button>
      <button
        className="ml-auto flex! w-auto! grid-cols-[auto_auto] gap-1.5 px-2! text-xs [&>span]:leading-none"
        aria-label={`${replyCount} ${replyLabel}`}
        onClick={onReply}
      >
        <MessageCircle />
        <span>{replyCount}</span>
      </button>
      <button className="ml-3" aria-label="Share">
        <Share />
      </button>
    </footer>
  );
}

function PostImage() {
  return (
    <span
      className="relative mt-3 block h-52 overflow-hidden rounded-2xl bg-gradient-to-b from-sky-200 via-amber-100 to-teal-900 ring-1 ring-black/10 max-md:h-[clamp(11rem,54vw,15rem)]"
      role="img"
      aria-label="Sunset over a quiet reservoir"
    >
      <span className="absolute right-[20%] top-[18%] size-14 rounded-full bg-amber-200 shadow-[0_0_32px_rgba(253,230,138,0.7)]" />
      <span className="absolute inset-x-0 bottom-[24%] h-[58%] bg-teal-700/60 [clip-path:polygon(0_58%,16%_34%,29%_56%,49%_18%,67%_62%,84%_29%,100%_55%,100%_100%,0_100%)]" />
      <span className="absolute inset-x-0 bottom-[10%] h-[48%] bg-teal-950/65 [clip-path:polygon(0_58%,14%_34%,31%_52%,45%_24%,62%_62%,78%_32%,100%_55%,100%_100%,0_100%)]" />
      <span className="absolute inset-x-0 bottom-0 h-[28%] bg-[repeating-linear-gradient(174deg,transparent_0_9px,rgba(255,255,255,.18)_10px_11px)]" />
    </span>
  );
}

function CommentTree() {
  const roots = comments.filter((comment) => !comment.parentId);
  return (
    <div className="divide-y divide-stone-200">
      {roots.map((comment) => (
        <CommentBranch comment={comment} key={comment.id} />
      ))}
    </div>
  );
}

function CommentBranch({ comment }: { comment: CommentData }) {
  const children = comments.filter((item) => item.parentId === comment.id);
  return (
    <div
      className="relative"
      data-depth={comment.depth}
      data-has-children={children.length > 0}
    >
      <CommentCard comment={comment} index={comments.indexOf(comment)} />
      {children.length > 0 ? (
        <div className="relative ml-8 border-l border-stone-200 pl-3 max-md:ml-6 max-md:pl-2">
          {children.map((child) => (
            <CommentBranch comment={child} key={child.id} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function CommentCard({
  comment,
  index,
}: {
  comment: CommentData;
  index: number;
}) {
  if (!comment.body) {
    return (
      <article
        className="grid grid-cols-[2.5rem_minmax(0,1fr)] gap-3 px-4 py-4 text-stone-400 max-md:px-3 motion-safe:animate-[row-enter_260ms_ease-out_both] motion-safe:[animation-delay:calc(var(--row-index)*35ms)] [&>div]:min-w-0 [&_strong]:text-xs [&_p]:mt-1 [&_p]:text-sm [&_small]:mt-1 [&_small]:block [&_small]:text-[0.65rem]"
        style={{ "--row-index": index } as CSSProperties}
      >
        <span className="mx-auto h-full w-px bg-stone-200" />
        <div>
          <strong>Comment deleted</strong>
          <p>This reply was removed by its author.</p>
          <small>{comment.replies} reply remains</small>
        </div>
      </article>
    );
  }
  return (
    <article
      className="grid grid-cols-[2.5rem_minmax(0,1fr)] gap-3 px-4 py-4 max-md:px-3 motion-safe:animate-[row-enter_260ms_ease-out_both] motion-safe:[animation-delay:calc(var(--row-index)*35ms)] [&>div]:min-w-0 [&_header]:flex [&_header]:items-center [&_header]:gap-1.5 [&_header]:text-[0.68rem] [&_header]:text-stone-500 [&_header_strong]:text-xs [&_header_strong]:font-bold [&_header_strong]:text-stone-900 [&_p]:mt-1.5 [&_p]:text-sm [&_p]:leading-relaxed [&_p]:text-stone-700 [&_footer]:mt-2"
      style={{ "--row-index": index } as CSSProperties}
    >
      <Avatar label={comment.avatar ?? "?"} anonymous={!comment.handle} />
      <div>
        <header>
          <strong>{comment.identity}</strong>
          {comment.postAuthor ? (
            <span className="rounded-full bg-amber-50 px-1.5 py-0.5 text-[0.55rem] font-bold uppercase tracking-wide text-amber-700">
              author
            </span>
          ) : null}
          <time>· {comment.time}</time>
        </header>
        <p>{comment.body}</p>
        <ActionStrip
          score={comment.score}
          replyCount={comment.replies}
          replyLabel="replies"
        />
      </div>
    </article>
  );
}

function ProfileReply({ onOpen }: { onOpen: () => void }) {
  return (
    <button
      className="w-full px-4 py-4 text-left transition hover:bg-stone-50 [&>span]:text-xs [&>span]:text-stone-500 [&>p]:mt-1.5 [&>p]:text-sm [&>p]:text-stone-800 [&>small]:mt-2 [&>small]:block [&>small]:text-[0.65rem] [&>small]:text-stone-400"
      onClick={onOpen}
    >
      <span>
        Replying to <strong>Mossy Moose</strong>
      </span>
      <p>north lot by the trail map. I’ll bring extra water.</p>
      <small>10m · 8 points</small>
    </button>
  );
}

function ContextRail({
  view,
  selectedPost,
}: {
  view: MockView;
  selectedPost: PostData;
}) {
  return (
    <aside className="min-w-0 space-y-3 px-3 py-5 max-lg:hidden">
      <label className="flex h-10 items-center gap-2 rounded-xl border border-stone-200 bg-white px-3 text-stone-400 shadow-sm transition focus-within:border-teal-300 focus-within:ring-2 focus-within:ring-teal-100 [&>svg]:size-4 [&>input]:min-w-0 [&>input]:flex-1 [&>input]:bg-transparent [&>input]:text-xs [&>input]:text-stone-900 [&>input]:outline-none [&>input]:placeholder:text-stone-400">
        <Search />
        <input aria-label="Search WakYak" placeholder="Search WakYak" />
      </label>
      {view === "home" ? <HomeContext /> : null}
      {view === "thread" ? <ThreadContext post={selectedPost} /> : null}
      {view === "notifications" ? <NotificationsContext /> : null}
      {view === "profile" ? <ProfileContext /> : null}
      <footer className="px-1 text-[0.58rem] leading-relaxed text-stone-400">
        Privacy · Rules · About · © 2026 WakYak
      </footer>
    </aside>
  );
}

function ContextSection({
  title,
  eyebrow,
  children,
}: {
  title: string;
  eyebrow?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-3 shadow-sm [&>header]:mb-2 [&>header]:flex [&>header]:items-center [&>header]:justify-between [&_h2]:text-sm [&_h2]:font-bold [&>header>span]:text-[0.62rem] [&>header>span]:text-stone-400">
      <header>
        <h2>{title}</h2>
        {eyebrow ? <span>{eyebrow}</span> : null}
      </header>
      {children}
    </section>
  );
}

function HomeContext() {
  return (
    <>
      <ContextSection title="Happening now" eyebrow="Nearby">
        {trends.map((trend) => (
          <button
            className="block w-full rounded-xl px-1 py-2 text-left transition hover:bg-stone-50 [&>span]:block [&>span]:text-[0.6rem] [&>span]:text-stone-400 [&>strong]:mt-0.5 [&>strong]:block [&>strong]:text-xs [&>small]:mt-0.5 [&>small]:block [&>small]:text-[0.62rem] [&>small]:text-stone-500"
            key={trend.title}
          >
            <span>{trend.eyebrow}</span>
            <strong>{trend.title}</strong>
            <small>{trend.detail}</small>
          </button>
        ))}
        <button className="mt-2 text-xs font-bold text-teal-700 transition hover:text-teal-900">
          Show more
        </button>
      </ContextSection>
      <div className="flex items-start gap-2 rounded-xl border border-stone-200 bg-white/70 p-3 text-[0.68rem] leading-relaxed text-stone-500 [&>svg]:mt-0.5 [&>svg]:size-3.5 [&>svg]:shrink-0 [&_strong]:font-bold [&_strong]:text-stone-700">
        <i className="mt-1 size-2 shrink-0 rounded-full bg-teal-500 shadow-[0_0_0_4px_rgba(20,184,166,0.1)]" />
        <p>
          <strong>42 friends</strong> have checked in today.
        </p>
      </div>
    </>
  );
}

function ThreadContext({ post }: { post: PostData }) {
  return (
    <>
      <ContextSection title="About this thread" eyebrow="Active">
        <dl className="grid grid-cols-3 gap-2 [&>div]:rounded-xl [&>div]:bg-stone-50 [&>div]:p-2 [&_dd]:text-base [&_dd]:font-bold [&_dt]:text-[0.6rem] [&_dt]:text-stone-500">
          <div>
            <dd>{post.comments}</dd>
            <dt>Replies</dt>
          </div>
          <div>
            <dd>{post.score}</dd>
            <dt>Points</dt>
          </div>
          <div>
            <dd>9</dd>
            <dt>People</dt>
          </div>
        </dl>
      </ContextSection>
      <div className="flex items-start gap-2 rounded-xl border border-stone-200 bg-white/70 p-3 text-[0.68rem] leading-relaxed text-stone-500 [&>svg]:mt-0.5 [&>svg]:size-3.5 [&>svg]:shrink-0 [&_strong]:font-bold [&_strong]:text-stone-700">
        <Sparkles />
        <p>
          <strong>Conversation is picking up.</strong> Four replies landed in
          the last ten minutes.
        </p>
      </div>
    </>
  );
}

function NotificationsContext() {
  return (
    <>
      <ContextSection title="This week" eyebrow="Activity">
        <dl className="grid grid-cols-2 gap-2 [&>div]:rounded-xl [&>div]:bg-stone-50 [&>div]:p-2 [&_dd]:text-base [&_dd]:font-bold [&_dt]:text-[0.6rem] [&_dt]:text-stone-500">
          <div>
            <dd>38</dd>
            <dt>Upvotes</dt>
          </div>
          <div>
            <dd>12</dd>
            <dt>Replies</dt>
          </div>
        </dl>
      </ContextSection>
      <div className="flex items-start gap-2 rounded-xl border border-stone-200 bg-white/70 p-3 text-[0.68rem] leading-relaxed text-stone-500 [&>svg]:mt-0.5 [&>svg]:size-3.5 [&>svg]:shrink-0 [&_strong]:font-bold [&_strong]:text-stone-700">
        <Info />
        <p>
          Anonymous identities change between posts, but remain stable inside
          each thread.
        </p>
      </div>
    </>
  );
}

function ProfileContext() {
  return (
    <>
      <ContextSection title="Your circle" eyebrow="42 friends">
        <div className="flex -space-x-2 [&>span]:size-8 [&>span]:border-2 [&>span]:border-white [&>span]:text-[0.58rem]">
          <Avatar label="🦊" anonymous />
          <Avatar label="🦦" anonymous />
          <Avatar label="🫎" anonymous />
          <Avatar label="+39" />
        </div>
        <p className="mt-3 text-xs leading-relaxed text-stone-600">
          A small feed, deliberately. Only people with an invitation can join.
        </p>
      </ContextSection>
      <div className="flex items-start gap-2 rounded-xl border border-stone-200 bg-white/70 p-3 text-[0.68rem] leading-relaxed text-stone-500 [&>svg]:mt-0.5 [&>svg]:size-3.5 [&>svg]:shrink-0 [&_strong]:font-bold [&_strong]:text-stone-700">
        <Check />
        <p>
          <strong>Profile complete.</strong> Your account is ready to post.
        </p>
      </div>
    </>
  );
}

function ComposeDialog({
  anonymous,
  draft,
  onAnonymousChange,
  onClose,
  onDraftChange,
  onSubmit,
}: {
  anonymous: boolean;
  draft: string;
  onAnonymousChange: () => void;
  onClose: () => void;
  onDraftChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const remaining = 280 - draft.length;
  return (
    <div className="fixed inset-0 z-[200] grid place-items-center bg-stone-950/40 p-4 backdrop-blur-sm motion-safe:animate-[backdrop-in_180ms_ease-out_both] max-md:block max-md:bg-white max-md:p-0 max-md:backdrop-blur-none">
      <section
        className="w-full max-w-xl overflow-hidden rounded-2xl border border-white/70 bg-white shadow-2xl motion-safe:animate-[dialog-in_220ms_ease-out_both] max-md:min-h-svh max-md:max-w-none max-md:rounded-none max-md:border-0 max-md:shadow-none [&>header]:grid [&>header]:min-h-14 [&>header]:grid-cols-[2.25rem_1fr_2.25rem] [&>header]:place-items-center [&>header]:border-b [&>header]:border-stone-200 [&>header]:px-3 [&>header]:max-md:pt-[env(safe-area-inset-top)] [&>header_h2]:text-sm [&>header_h2]:font-bold [&>form]:p-5 [&>form]:max-md:p-4 [&_textarea]:mt-4 [&_textarea]:min-h-36 [&_textarea]:w-full [&_textarea]:resize-none [&_textarea]:bg-transparent [&_textarea]:text-lg [&_textarea]:leading-relaxed [&_textarea]:outline-none [&_textarea]:placeholder:text-stone-400"
        role="dialog"
        aria-modal="true"
        aria-labelledby="compose-title"
      >
        <header>
          <button
            className="grid size-9 shrink-0 place-items-center rounded-full text-stone-500 transition hover:bg-stone-100 hover:text-stone-950 [&>svg]:size-4"
            aria-label="Close composer"
            onClick={onClose}
          >
            <X />
          </button>
          <h2 id="compose-title">Create a post</h2>
          <span />
        </header>
        <form onSubmit={onSubmit}>
          <div className="flex items-center gap-3 [&>div]:min-w-0 [&_strong]:block [&_strong]:text-sm [&_strong]:font-bold [&_span]:block [&_span]:text-xs [&_span]:text-stone-500">
            <Avatar label={anonymous ? "🦌" : "CB"} anonymous={anonymous} />
            <div>
              <strong>{anonymous ? "Cedar Deer" : "Campbell"}</strong>
              <span>{anonymous ? "Anonymous in this post" : "@campbell"}</span>
            </div>
          </div>
          <textarea
            autoFocus
            aria-label="Post text"
            maxLength={320}
            placeholder="What’s happening?"
            value={draft}
            onChange={(event) => onDraftChange(event.target.value)}
          />
          <div className="mt-3 flex items-center justify-between border-t border-stone-200 pt-3 [&>div]:flex [&>div]:gap-2 [&_button]:flex [&_button]:h-9 [&_button]:items-center [&_button]:gap-2 [&_button]:rounded-xl [&_button]:px-3 [&_button]:text-xs [&_button]:font-semibold [&_button]:text-stone-500 [&_button]:transition [&_button]:hover:bg-stone-100 [&_button]:data-[active=true]:bg-teal-50 [&_button]:data-[active=true]:text-teal-700 [&_button>svg]:size-4">
            <div>
              <button type="button" aria-label="Add image">
                <Image />
              </button>
              <button
                type="button"
                data-active={anonymous}
                aria-pressed={anonymous}
                onClick={onAnonymousChange}
              >
                <Users /> Anonymous
              </button>
            </div>
            <span
              className="text-xs tabular-nums text-stone-400 data-[invalid=true]:font-bold data-[invalid=true]:text-red-600"
              data-invalid={remaining < 0}
            >
              {remaining}
            </span>
          </div>
          <footer className="mt-4 flex items-center justify-between gap-4">
            <p className="max-w-sm text-xs leading-relaxed text-stone-500">
              {anonymous
                ? "Your identity stays consistent in this thread."
                : "Your profile will be shown with this post."}
            </p>
            <button
              className="rounded-xl bg-teal-600 px-5 py-2.5 text-xs font-bold text-white transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-40"
              disabled={!draft.trim() || remaining < 0}
            >
              Post
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}
