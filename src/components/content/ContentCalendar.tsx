import { useState, useEffect, useMemo } from "react";
import { ChevronLeft, ChevronRight, Plus, Layers, PlayCircle, Image as ImageIcon, Layout, List, Send, Trash2, Edit3, ExternalLink, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { ContentPost, PostStatus, POST_STATUSES, POST_STATUS_META, normalizeStatus } from "@/types/content";
import { pushToBuffer } from "@/services/bufferService";
import Badge from "@/components/Badge";
import Modal from "@/components/Modal";
import { getSaDateString, addDaysToSaYmd } from "@/utils/saDate";

const STATUS_FILTERS: (PostStatus | "all")[] = ["all", ...POST_STATUSES];

interface ContentCalendarProps {
  onNewPost: (date?: string) => void;
  onEditPost?: (post: ContentPost) => void;
}

export default function ContentCalendar({ onNewPost, onEditPost }: ContentCalendarProps) {
  const [currentWeekStart, setCurrentWeekStart] = useState(() => {
    const now = new Date();
    const day = now.getDay();
    const diff = now.getDate() - day + (day === 0 ? -6 : 1); // Adjust for Monday start
    return getSaDateString(new Date(now.setDate(diff)));
  });

  const [posts, setPosts] = useState<ContentPost[]>([]);
  const [filter, setFilter] = useState<PostStatus | "all">("all");
  const [isLoading, setIsLoading] = useState(true);
  const [selectedPost, setSelectedPost] = useState<ContentPost | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isPushing, setIsPushing] = useState(false);
  const [pushMsg, setPushMsg] = useState<string | null>(null);

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
    return posts.filter((p) => normalizeStatus(p.status) === filter);
  }, [posts, filter]);

  const upcomingPosts = useMemo(() => {
    return posts
      .filter((p) => ["scheduled", "queued", "manual"].includes(normalizeStatus(p.status)))
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

  // Check if a post has Buffer IDs (meaning it's queued in Buffer)
  const hasBufferIds = (post: ContentPost) => {
    return post.buffer_post_ids && Object.keys(post.buffer_post_ids).length > 0;
  };

  // Delete a post
  const handleDelete = async () => {
    if (!selectedPost || isDeleting) return;
    
    setIsDeleting(true);
    try {
      const { error } = await supabase
        .from("content_posts")
        .delete()
        .eq("id", selectedPost.id);
      
      if (error) {
        console.error("Error deleting post:", error);
        alert("Failed to delete post: " + error.message);
      } else {
        setIsModalOpen(false);
        // Refresh posts by triggering a re-fetch
        setPosts((prev) => prev.filter((p) => p.id !== selectedPost.id));
      }
    } catch (err) {
      console.error("Delete error:", err);
    } finally {
      setIsDeleting(false);
    }
  };

  // Push an existing row to Buffer (media-capable proxy reads the row server-side)
  const handlePush = async () => {
    if (!selectedPost || isPushing) return;
    setIsPushing(true);
    setPushMsg(null);
    try {
      const result = await pushToBuffer(selectedPost.id);
      const updated: ContentPost = {
        ...selectedPost,
        status: result.status as PostStatus,
        buffer_post_ids: result.buffer_post_ids,
      };
      setSelectedPost(updated);
      setPosts((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
      if (result.status === "scheduled") setPushMsg("Scheduled to Buffer ✓");
      else if (result.status === "manual") setPushMsg("Sent as Buffer reminder(s) — finish in the Buffer app");
      else setPushMsg(result.errors.join(" | ") || "Push failed");
    } catch (err) {
      setPushMsg(err instanceof Error ? err.message : "Push failed");
    } finally {
      setIsPushing(false);
    }
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
                      setPushMsg(null);
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
                    <div className="flex items-center gap-2">
                      <Badge variant={POST_STATUS_META[normalizeStatus(post.status)].badge} className="w-fit">
                        {POST_STATUS_META[normalizeStatus(post.status)].label}
                      </Badge>
                      {post.status === "scheduled" && hasBufferIds(post) && (
                        <div 
                          className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#168eea]/20 text-[#168eea] text-[10px] font-medium"
                          title="Scheduled via Buffer"
                        >
                          <Send className="h-2.5 w-2.5" />
                          Buffer
                        </div>
                      )}
                    </div>
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
                <div className="flex items-center gap-1">
                  {post.platforms.map((p) => (
                    <Badge
                      key={p}
                      variant={p === "instagram" ? "orange" : p === "facebook" ? "blue" : "blue"}
                      className="uppercase"
                    >
                      {p === "instagram" ? "IG" : p === "facebook" ? "FB" : "LI"}
                    </Badge>
                  ))}
                  {post.status === "scheduled" && hasBufferIds(post) && (
                    <div 
                      className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-[#168eea]/20 text-[#168eea] text-[9px] font-medium"
                      title="Scheduled via Buffer"
                    >
                      <Send className="h-2 w-2" />
                    </div>
                  )}
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
                  <Badge variant={POST_STATUS_META[normalizeStatus(selectedPost.status)].badge}>
                    {POST_STATUS_META[normalizeStatus(selectedPost.status)].label}
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
            {/* Caption Preview */}
            {selectedPost.captions && (
              <div>
                <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Captions</label>
                <div className="mt-2 flex flex-col gap-3">
                  {selectedPost.platforms.map((platform) => {
                    const caption = selectedPost.captions?.[platform as keyof typeof selectedPost.captions];
                    if (!caption) return null;
                    return (
                      <div key={platform} className="rounded-lg bg-base p-3 border border-border">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-xs font-medium uppercase text-zinc-500">{platform}</span>
                        </div>
                        <div className="text-sm text-zinc-300 whitespace-pre-wrap line-clamp-4">
                          {caption}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            {selectedPost.notes && (
              <div>
                <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Notes</label>
                <div className="mt-1 text-sm text-zinc-400">{selectedPost.notes}</div>
              </div>
            )}
            {selectedPost.error && (
              <div className="text-sm text-orange rounded-lg bg-orange/10 border border-orange/20 px-3 py-2">{selectedPost.error}</div>
            )}
            {pushMsg && (
              <div className="text-sm text-zinc-200 rounded-lg bg-base border border-border px-3 py-2">{pushMsg}</div>
            )}
            <div className="flex flex-wrap gap-3 pt-4 border-t border-border">
              {(selectedPost.media_urls?.length ?? 0) > 0 ? (
                <button
                  onClick={handlePush}
                  disabled={isPushing}
                  className="flex-1 min-w-[160px] px-4 py-2.5 bg-[#168eea] text-white rounded-xl text-sm font-semibold hover:bg-[#168eea]/90 transition flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isPushing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  {hasBufferIds(selectedPost) ? "Re-push to Buffer" : "Push to Buffer now"}
                </button>
              ) : (
                <a
                  href="https://buffer.com/app/posts/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 min-w-[160px] px-4 py-2.5 bg-white/5 text-zinc-400 rounded-xl text-sm font-semibold hover:bg-white/10 hover:text-white transition flex items-center justify-center gap-2"
                  title="This post has no media — add media (Create tab or ingest script) before pushing"
                >
                  <ExternalLink className="h-4 w-4" />
                  No media — open Buffer
                </a>
              )}
              <button
                className="flex-1 min-w-[120px] px-4 py-2.5 bg-purple text-white rounded-xl text-sm font-semibold hover:bg-purple/90 transition flex items-center justify-center gap-2"
                onClick={() => {
                  if (onEditPost) {
                    onEditPost(selectedPost);
                  } else {
                    onNewPost(selectedPost.scheduled_for?.split("T")[0]);
                  }
                  setIsModalOpen(false);
                }}
              >
                <Edit3 className="h-4 w-4" />
                Edit Post
              </button>
              <button
                className="px-4 py-2.5 bg-red-500/20 text-red-400 rounded-xl text-sm font-semibold hover:bg-red-500/30 transition flex items-center justify-center gap-2"
                onClick={handleDelete}
                disabled={isDeleting}
              >
                <Trash2 className="h-4 w-4" />
                {isDeleting ? "Deleting..." : "Delete"}
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
