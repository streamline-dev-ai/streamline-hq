import { Outlet, NavLink, useLocation } from "react-router-dom";
import {
  CalendarDays,
  Users,
  MessageSquareText,
  BriefcaseBusiness,
  Wallet,
  Megaphone,
  Settings as SettingsIcon,
  Radio,
  MoreHorizontal,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { Sheet } from "@/ui";

type NavItem = { to: string; label: string; Icon: LucideIcon };

const PRIMARY: NavItem[] = [
  { to: "/today", label: "Today", Icon: CalendarDays },
  { to: "/leads", label: "Leads", Icon: Users },
  { to: "/messages", label: "Messages", Icon: MessageSquareText },
  { to: "/clients", label: "Clients", Icon: BriefcaseBusiness },
];
const SECONDARY: NavItem[] = [
  { to: "/finance", label: "Finance", Icon: Wallet },
  { to: "/content", label: "Content", Icon: Megaphone },
  { to: "/settings", label: "Settings", Icon: SettingsIcon },
];
const ALL = [...PRIMARY, ...SECONDARY];

function useRealtimeHealth() {
  const [status, setStatus] = useState<"connecting" | "connected" | "disconnected">(
    "connecting",
  );
  useEffect(() => {
    const channel = supabase.channel("realtime-health");
    channel.subscribe((s) => {
      if (s === "SUBSCRIBED") setStatus("connected");
      else if (s === "CHANNEL_ERROR" || s === "TIMED_OUT" || s === "CLOSED")
        setStatus("disconnected");
    });
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);
  return status;
}

function navClass(active: boolean) {
  return cn(
    "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition",
    active
      ? "bg-brand-soft text-brand"
      : "text-ink-muted hover:bg-surface hover:text-ink",
  );
}

export default function AppLayout() {
  const location = useLocation();
  const health = useRealtimeHealth();
  const [moreOpen, setMoreOpen] = useState(false);
  const title = useMemo(
    () => ALL.find((n) => location.pathname.startsWith(n.to))?.label ?? "Streamline HQ",
    [location.pathname],
  );

  useEffect(() => setMoreOpen(false), [location.pathname]);

  const dot = (
    <span
      className={cn(
        "h-2 w-2 rounded-full",
        health === "connected" && "bg-success",
        health === "connecting" && "bg-ink-faint",
        health === "disconnected" && "bg-accent",
      )}
    />
  );

  return (
    <div className="min-h-dvh bg-base text-ink">
      <div className="mx-auto flex min-h-dvh w-full max-w-[1400px]">
        {/* Desktop sidebar */}
        <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-line bg-panel/60 md:flex">
          <div className="flex h-16 items-center gap-2.5 px-5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-soft text-brand">
              <Radio className="h-5 w-5" />
            </div>
            <div>
              <div className="text-sm font-bold leading-none">Streamline HQ</div>
              <div className="mt-1 text-xs text-ink-faint">Agency control</div>
            </div>
          </div>
          <nav className="flex flex-1 flex-col gap-1 px-3 py-3">
            {ALL.map(({ to, label, Icon }) => (
              <NavLink key={to} to={to} className={({ isActive }) => navClass(isActive)}>
                <Icon className="h-5 w-5" />
                {label}
              </NavLink>
            ))}
          </nav>
          <div className="m-3 flex items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2.5">
            {dot}
            <div className="text-xs text-ink-muted">
              Realtime <span className="text-ink-faint">· {health}</span>
            </div>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-20 border-b border-line bg-base/80 backdrop-blur safe-top">
            <div className="flex h-14 items-center justify-between gap-4 px-4 md:px-6">
              <div>
                <div className="text-sm font-semibold leading-none">{title}</div>
                <div className="mt-1 text-xs text-ink-faint">South Africa · SAST</div>
              </div>
              <div className="flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5 text-xs text-ink-muted">
                {dot}
                <span className="hidden sm:inline">
                  {health === "connected" ? "Live" : health}
                </span>
              </div>
            </div>
          </header>

          <main className="min-w-0 flex-1 px-4 pt-4 md:px-6 md:pb-8 pb-safe-nav">
            <Outlet />
          </main>
        </div>
      </div>

      {/* Mobile bottom nav */}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-base/90 backdrop-blur-xl md:hidden">
        <div className="safe-bottom mx-auto grid max-w-md grid-cols-5">
          {PRIMARY.map(({ to, label, Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                cn(
                  "flex min-h-[58px] flex-col items-center justify-center gap-1 text-[11px] font-medium transition active:scale-95",
                  isActive ? "text-brand" : "text-ink-faint",
                )
              }
            >
              <Icon className="h-5 w-5" />
              {label}
            </NavLink>
          ))}
          <button
            onClick={() => setMoreOpen(true)}
            className={cn(
              "flex min-h-[58px] flex-col items-center justify-center gap-1 text-[11px] font-medium transition active:scale-95",
              SECONDARY.some((s) => location.pathname.startsWith(s.to))
                ? "text-brand"
                : "text-ink-faint",
            )}
          >
            <MoreHorizontal className="h-5 w-5" />
            More
          </button>
        </div>
      </nav>

      <Sheet open={moreOpen} onClose={() => setMoreOpen(false)} title="More">
        <div className="grid grid-cols-3 gap-3">
          {SECONDARY.map(({ to, label, Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                cn(
                  "flex aspect-square flex-col items-center justify-center gap-2 rounded-2xl border text-sm font-medium transition active:scale-95",
                  isActive
                    ? "border-brand/40 bg-brand-soft text-brand"
                    : "border-line bg-surface text-ink-muted",
                )
              }
            >
              <Icon className="h-6 w-6" />
              {label}
            </NavLink>
          ))}
        </div>
      </Sheet>
    </div>
  );
}
