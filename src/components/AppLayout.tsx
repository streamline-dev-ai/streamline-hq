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
  Calendar,
  PlusCircle,
  Lightbulb,
  BarChart3,
  ChevronDown
} from "lucide-react";
import { useEffect, useMemo, useState, type ComponentType } from "react";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";

type NavItem = {
  to: string;
  label: string;
  Icon: ComponentType<{ className?: string }>;
  subItems?: { to: string; label: string; Icon: ComponentType<{ className?: string }> }[];
};

const NAV: NavItem[] = [
  { to: "/today", label: "Today", Icon: CalendarDays },
  { to: "/leads", label: "Leads", Icon: Users },
  { to: "/messages", label: "Messages", Icon: MessageSquareText },
  { to: "/clients", label: "Clients", Icon: BriefcaseBusiness },
  { to: "/finance", label: "Finance", Icon: Wallet },
  {
    to: "/content",
    label: "Content",
    Icon: Megaphone,
    subItems: [
      { to: "/content?tab=calendar", label: "Calendar", Icon: Calendar },
      { to: "/content?tab=create", label: "Create", Icon: PlusCircle },
      { to: "/content?tab=ideas", label: "Ideas", Icon: Lightbulb },
      { to: "/content?tab=analytics", label: "Analytics", Icon: BarChart3 },
    ],
  },
  { to: "/settings", label: "Settings", Icon: SettingsIcon },
];

function useRealtimeHealth() {
  const [status, setStatus] = useState<"idle" | "connecting" | "connected" | "disconnected">("idle");

  useEffect(() => {
    const channel = supabase.channel("realtime-health");
    setStatus("connecting");
    channel.subscribe((s) => {
      if (s === "SUBSCRIBED") setStatus("connected");
      if (s === "CHANNEL_ERROR" || s === "TIMED_OUT") setStatus("disconnected");
      if (s === "CLOSED") setStatus("disconnected");
    });
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return status;
}

function titleFromPath(pathname: string) {
  const item = NAV.find((n) => n.to === pathname);
  return item?.label ?? "Streamline HQ";
}

export default function AppLayout() {
  const location = useLocation();
  const title = useMemo(() => titleFromPath(location.pathname), [location.pathname]);
  const health = useRealtimeHealth();

  return (
    <div className="min-h-dvh bg-base text-zinc-100">
      <div className="mx-auto flex min-h-dvh w-full max-w-[1400px] md:gap-4">
        <aside className="hidden md:sticky md:top-0 md:flex md:h-dvh md:flex-col md:border-r md:border-border md:bg-base">
          <div className="flex h-14 items-center gap-2 px-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-purple/15 text-purple">
              <Radio className="h-5 w-5" />
            </div>
            <div className="hidden lg:block">
              <div className="text-sm font-semibold leading-none">Streamline HQ</div>
              <div className="text-xs text-zinc-400">Agency dashboard</div>
            </div>
          </div>
          <nav className="flex flex-1 flex-col gap-1 px-2 pb-4">
            {NAV.map(({ to, label, Icon, subItems }) => {
              const isActive = location.pathname.startsWith(to);
              return (
                <div key={to} className="flex flex-col gap-1">
                  <NavLink
                    to={to}
                    className={({ isActive: isExactActive }) =>
                      cn(
                        "group flex items-center gap-3 rounded-xl px-3 py-2 text-sm text-zinc-300 transition",
                        "hover:bg-white/5 hover:text-white",
                        (isExactActive || isActive) && "bg-purple/15 text-purple hover:text-purple",
                      )
                    }
                  >
                    <Icon className="h-5 w-5" />
                    <span className="hidden lg:block flex-1">{label}</span>
                    {subItems && isActive && (
                      <ChevronDown className="hidden lg:block h-3.5 w-3.5 opacity-50" />
                    )}
                  </NavLink>
                  {subItems && isActive && (
                    <div className="hidden lg:flex flex-col gap-1 ml-9 pb-2">
                      {subItems.map((sub) => (
                        <NavLink
                          key={sub.to}
                          to={sub.to}
                          className={({ isActive: isSubActive }) =>
                            cn(
                              "px-3 py-1.5 text-xs rounded-lg transition",
                              isSubActive
                                ? "text-purple bg-purple/5 font-medium"
                                : "text-zinc-500 hover:text-zinc-300 hover:bg-white/5",
                            )
                          }
                        >
                          {sub.label}
                        </NavLink>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </nav>
          <div className="px-4 pb-4">
            <div className="flex items-center gap-2 rounded-xl border border-border bg-panel px-3 py-2">
              <span
                className={cn(
                  "h-2 w-2 rounded-full",
                  health === "connected" && "bg-emerald-400",
                  (health === "connecting" || health === "idle") && "bg-zinc-500",
                  health === "disconnected" && "bg-orange",
                )}
              />
              <div className="hidden lg:block">
                <div className="text-xs font-medium">Realtime</div>
                <div className="text-xs text-zinc-400">{health}</div>
              </div>
            </div>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-10 border-b border-border bg-base/80 px-4 py-3 backdrop-blur md:px-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-sm font-semibold leading-none">{title}</div>
                <div className="text-xs text-zinc-400">South Africa (SAST)</div>
              </div>
              <div className="flex items-center gap-2">
                <div className="hidden sm:flex items-center gap-2 rounded-xl border border-border bg-panel px-3 py-2 text-xs text-zinc-300">
                  <span
                    className={cn(
                      "h-2 w-2 rounded-full",
                      health === "connected" && "bg-emerald-400",
                      (health === "connecting" || health === "idle") && "bg-zinc-500",
                      health === "disconnected" && "bg-orange",
                    )}
                  />
                  <span>{health === "connected" ? "Live" : "Offline"}</span>
                </div>
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-xs font-semibold">
                  SA
                </div>
              </div>
            </div>
          </header>

          <main className="min-w-0 flex-1 px-4 pb-24 pt-4 md:px-6 md:pb-6">
            <Outlet />
          </main>
        </div>
      </div>

      <nav className="fixed bottom-0 left-0 right-0 z-20 border-t border-border bg-base/95 px-2 pb-[max(env(safe-area-inset-bottom),0px)] pt-2 backdrop-blur md:hidden">
        <div className="mx-auto grid max-w-md grid-cols-5 gap-1">
          {NAV.slice(0, 5).map(({ to, label, Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                cn(
                  "flex flex-col items-center gap-1 rounded-xl px-2 py-2 text-[11px] text-zinc-400 transition",
                  "hover:bg-white/5 hover:text-white",
                  isActive && "bg-purple/15 text-purple",
                )
              }
            >
              <Icon className="h-5 w-5" />
              <span className="leading-none">{label}</span>
            </NavLink>
          ))}
        </div>
        <div className="mx-auto mt-1 grid max-w-md grid-cols-2 gap-1">
          {NAV.slice(5).map(({ to, label, Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                cn(
                  "flex items-center justify-center gap-2 rounded-xl px-2 py-2 text-xs text-zinc-400 transition",
                  "hover:bg-white/5 hover:text-white",
                  isActive && "bg-purple/15 text-purple",
                )
              }
            >
              <Icon className="h-4 w-4" />
              <span className="leading-none">{label}</span>
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}

