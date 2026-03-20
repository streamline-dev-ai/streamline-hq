import { useState, useEffect, useMemo } from "react";
import { ChevronLeft, ChevronRight, Plus, Layers, PlayCircle, Image as ImageIcon, Layout, List } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { ContentPost, ContentStatus } from "@/types/content";
import Badge from "@/components/Badge";
import Modal from "@/components/Modal";
import { getSaDateString, addDaysToSaYmd } from "@/utils/saDate";

const STATUS_FILTERS: (ContentStatus | "all")[] = ["all", "idea", "ready", "scheduled", "posted"];

interface ContentCalendarProps {
  onNewPost: (date?: string) => void;
}

export default function ContentCalendar({ onNewPost }: ContentCalendarProps) {
  const [currentWeekStart, setCurrentWeekStart] = useState(() => {
    const now = new Date();
    const day = now.getDay();
    const diff = now.getDate() - day + (day === 0 ? -6 : 1); // Adjust for Monday start
    return getSaDateString(new Date(now.setDate(diff)));
  });

  const [posts, setPosts] = useState<ContentPost[]>([]);
  const [filter, setFilter] = useState<ContentStatus | "all">("all");
  const [isLoading, setIsLoading] = useState(true);
  const [selectedPost, setSelectedPost] = useState<ContentPost | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const weekDays = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => addDaysToSaYmd(currentWeekStart, i));
  }, [currentWeekStart]);

  useEffect(() => {
    async function fetchPosts() {
      setIsLoading(true);
      const { data, error } = await supabase
        .from("content_posts")
        .select("*")
        .gte("scheduled_for", `${currentWeekStart}T00:00:00Z`)
        .lte("scheduled_for", `${weekDays[6]}T23:59:59Z`);

      if (error) {
        console.error("Error fetching posts:", error);
      } else {
        setPosts(data || []);
      }
      setIsLoading(false);
    }
    fetchPosts();
  }, [currentWeekStart, weekDays]);

  const filteredPosts = useMemo(() => {
    if (filter === "all") return posts;
    return posts.filter((p) => p.status === filter);
  }, [posts, filter]);

  const upcomingPosts = useMemo(() => {
    return posts
      .filter((p) => p.status === "scheduled" || p.status === "ready")
      .sort((a, b) => new Date(a.scheduled_for!).getTime() - new Date(b.scheduled_for!).getTime())
      .slice(0, 7);
  }, [posts]);

  const navigateWeek = (direction: "prev" | "next") => {
    const days = direction === "prev" ? -7 : 7;
    setCurrentWeekStart((prev) => addDaysToSaYmd(prev, days));
  };

  const getPostsForDay = (dateYmd: string) => {
    return filteredPosts.filter((p) => p.scheduled_for?.startsWith(dateYmd));
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1 rounded-xl bg-panel p-1 border border-border">
            <button
              onClick={() => navigateWeek("prev")}
              className="p-2 text-zinc-400 hover:text-white transition rounded-lg hover:bg-white/5"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="px-2 text-sm font-medium text-zinc-200">
              Week of {new Date(currentWeekStart).toLocaleDateString("en-ZA", { month: "short", day: "numeric" })}
            </span>
            <button
              onClick={() => navigateWeek("next")}
              className="p-2 text-zinc-400 hover:text-white transition rounded-lg hover:bg-white/5"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <button
            onClick={() => {
              setCurrentWeekStart(() => {
                const now = new Date();
                const day = now.getDay();
                const diff = now.getDate() - day + (day === 0 ? -6 : 1);
                return getSaDateString(new Date(now.setDate(diff)));
              });
            }}
            className="text-xs font-medium text-purple hover:underline"
          >
            Today
          </button>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1 rounded-xl bg-panel p-1 border border-border">
            {STATUS_FILTERS.map((s) => (
              <button
                key={s}
                onClick={() => setFilter(s)}
                className={cn(
                  "px-3 py-1.5 text-xs font-medium rounded-lg transition capitalize",
                  filter === s ? "bg-white/10 text-white" : "text-zinc-500 hover:text-zinc-300"
                )}
              >
                {s}
              </button>
            ))}
          </div>
          <button 
            onClick={() => onNewPost()}
            className="flex items-center gap-2 px-4 py-2 bg-purple text-white rounded-xl text-sm font-medium hover:bg-purple/90 transition shadow-lg shadow-purple/20"
          >
            <Plus className="h-4 w-4" />
            New Post
          </button>
        </div>
      </div>

      {/* Calendar Grid */}
      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-2xl border border-border bg-border">
        {weekDays.map((dateYmd, idx) => {
          const dayPosts = getPostsForDay(dateYmd);
          const isToday = dateYmd === getSaDateString();
          const date = new Date(dateYmd);

          return (
            <div key={dateYmd} className="min-h-[200px] bg-panel p-3">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-xs font-bold text-zinc-500 uppercase tracking-wider">
                  {date.toLocaleDateString("en-ZA", { weekday: "short" })}
                </span>
                <span
                  className={cn(
                    "flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold",
                    isToday ? "bg-purple text-white" : "text-zinc-400"
                  )}
                >
                  {date.getDate()}
                </span>
              </div>

              <div className="flex flex-col gap-2">
                {dayPosts.map((post) => (
                  <button
                    key={post.id}
                    onClick={() => {
                      setSelectedPost(post);
                      setIsModalOpen(true);
                    }}
                    className="group flex flex-col gap-2 rounded-xl border border-border bg-base/50 p-2.5 text-left transition hover:border-purple/50 hover:bg-purple/5"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        {post.content_type === "carousel" && <Layers className="h-3 w-3 text-purple" />}
                        {post.content_type === "reel" && <PlayCircle className="h-3 w-3 text-orange" />}
                        {post.content_type === "static" && <ImageIcon className="h-3 w-3 text-zinc-400" />}
                        {post.content_type === "story" && <Layout className="h-3 w-3 text-teal-400" />}
                      </div>
                      <div className="flex gap-1">
                        {post.platforms.map((p) => (
                          <span
                            key={p}
                            className={cn(
                              "h-1.5 w-1.5 rounded-full",
                              p === "instagram" && "bg-[#E1306C]",
                              p === "facebook" && "bg-[#1877F2]",
                              p === "linkedin" && "bg-[#0A66C2]"
                            )}
                          />
                        ))}
                      </div>
                    </div>
                    <div className="truncate text-xs font-medium text-zinc-200">{post.title}</div>
                    <Badge
                      variant={
                        post.status === "posted"
                          ? "emerald"
                          : post.status === "scheduled"
                          ? "purple"
                          : post.status === "ready"
                          ? "blue"
                          : "zinc"
                      }
                      className="w-fit"
                    >
                      {post.status}
                    </Badge>
                  </button>
                ))}
                <button
                  onClick={() => onNewPost(dateYmd)}
                  className="flex items-center justify-center rounded-xl border border-dashed border-border py-2 text-zinc-500 hover:border-zinc-400 hover:text-zinc-400 transition"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Upcoming List */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2 text-zinc-400">
          <List className="h-4 w-4" />
          <h3 className="text-sm font-semibold uppercase tracking-wider">Upcoming</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {upcomingPosts.length > 0 ? (
            upcomingPosts.map((post) => (
              <div
                key={post.id}
                className="flex items-center gap-4 rounded-2xl border border-border bg-panel p-4"
              >
                <div
                  className={cn(
                    "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
                    post.content_type === "carousel" && "bg-purple/15 text-purple",
                    post.content_type === "reel" && "bg-orange/15 text-orange",
                    post.content_type === "static" && "bg-white/10 text-zinc-400",
                    post.content_type === "story" && "bg-teal-400/15 text-teal-400"
                  )}
                >
                  {post.content_type === "carousel" && <Layers className="h-5 w-5" />}
                  {post.content_type === "reel" && <PlayCircle className="h-5 w-5" />}
                  {post.content_type === "static" && <ImageIcon className="h-5 w-5" />}
                  {post.content_type === "story" && <Layout className="h-5 w-5" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-zinc-200">{post.title}</div>
                  <div className="text-xs text-zinc-500">
                    {new Date(post.scheduled_for!).toLocaleDateString("en-ZA", {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                    })}
                  </div>
                </div>
                <div className="flex gap-1">
                  {post.platforms.map((p) => (
                    <Badge
                      key={p}
                      variant={p === "instagram" ? "orange" : p === "facebook" ? "blue" : "blue"}
                      className="uppercase"
                    >
                      {p === "instagram" ? "IG" : p === "facebook" ? "FB" : "LI"}
                    </Badge>
                  ))}
                </div>
              </div>
            ))
          ) : (
            <div className="col-span-full py-8 text-center text-zinc-500 bg-panel rounded-2xl border border-dashed border-border">
              No upcoming posts scheduled.
            </div>
          )}
        </div>
      </div>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={selectedPost ? "Post Details" : "Schedule Post"}
      >
        {selectedPost && (
          <div className="flex flex-col gap-6">
            <div>
              <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Title</label>
              <div className="mt-1 text-lg font-bold text-white">{selectedPost.title}</div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Type</label>
                <div className="mt-1 flex items-center gap-2 text-zinc-300 capitalize">
                  {selectedPost.content_type}
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Status</label>
                <div className="mt-1">
                  <Badge
                    variant={
                      selectedPost.status === "posted"
                        ? "emerald"
                        : selectedPost.status === "scheduled"
                        ? "purple"
                        : "zinc"
                    }
                  >
                    {selectedPost.status}
                  </Badge>
                </div>
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Platforms</label>
              <div className="mt-2 flex gap-2">
                {selectedPost.platforms.map((p) => (
                  <Badge key={p} className="uppercase">
                    {p}
                  </Badge>
                ))}
              </div>
            </div>
            {selectedPost.notes && (
              <div>
                <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Notes</label>
                <div className="mt-1 text-sm text-zinc-400">{selectedPost.notes}</div>
              </div>
            )}
            <div className="flex gap-3 pt-4 border-t border-border">
              <button
                className="flex-1 px-4 py-2.5 bg-purple text-white rounded-xl text-sm font-semibold hover:bg-purple/90 transition"
                onClick={() => {
                  onNewPost(selectedPost.scheduled_for?.split("T")[0]);
                  // Note: This only pre-fills the date for now, 
                  // but we could extend handleNewPost to accept full post data.
                  setIsModalOpen(false);
                }}
              >
                Edit Post
              </button>
              <button
                className="px-4 py-2.5 bg-white/5 text-zinc-400 rounded-xl text-sm font-semibold hover:bg-white/10 hover:text-white transition"
                onClick={() => setIsModalOpen(false)}
              >
                Close
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
