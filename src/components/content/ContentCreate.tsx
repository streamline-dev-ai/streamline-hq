import { useState, useEffect } from "react";
import { 
  Sparkles, 
  Layers, 
  PlayCircle, 
  Image as ImageIcon, 
  Layout, 
  Instagram, 
  Facebook, 
  Linkedin, 
  Upload, 
  X, 
  Loader2, 
  Save,
  Send,
  CheckCircle2,
  PlusCircle,
  AlertTriangle,
  Zap
} from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { ContentType, ContentPillar, Platform, ContentIdea, ContentPost } from "@/types/content";
import { isBufferConfigured, scheduleToAllPlatforms, postNow } from "@/services/bufferService";
import { generateCaptions as generateCaptionsFromAI } from "@/services/captionService";

const PILLARS: ContentPillar[] = [
  "Build in Public",
  "Before/After",
  "Problem/Solution",
  "Featured Build",
  "Offer",
  "Tip",
  "Social Proof"
];

const CONTENT_TYPES: { id: ContentType; label: string; Icon: any }[] = [
  { id: "carousel", label: "Carousel", Icon: Layers },
  { id: "reel", label: "Reel", Icon: PlayCircle },
  { id: "static", label: "Static", Icon: ImageIcon },
  { id: "story", label: "Story", Icon: Layout },
];

const PLATFORMS: { id: Platform; label: string; Icon: any; color: string }[] = [
  { id: "instagram", label: "Instagram", Icon: Instagram, color: "text-[#E1306C]" },
  { id: "facebook", label: "Facebook", Icon: Facebook, color: "text-[#1877F2]" },
  { id: "linkedin", label: "LinkedIn", Icon: Linkedin, color: "text-[#0A66C2]" },
];

interface ContentCreateProps {
  initialData?: Partial<ContentIdea> | null;
  editingPost?: Partial<ContentPost> | null;
}

export default function ContentCreate({ initialData, editingPost }: ContentCreateProps) {
  // Form State
  const [title, setTitle] = useState(initialData?.title || "");
  const [contentType, setContentType] = useState<ContentType>(initialData?.content_type || "static");
  const [pillar, setPillar] = useState<ContentPillar>(initialData?.pillar || "Build in Public");
  const [platforms, setPlatforms] = useState<Platform[]>(initialData?.platforms || ["instagram"]);
  const [brief, setBrief] = useState(initialData?.hook || "");
  const [mediaUrls, setMediaUrls] = useState<string[]>([]);
  const [hashtags, setHashtags] = useState("");
  const [firstComment, setFirstComment] = useState("");
  const [scheduledFor, setScheduledFor] = useState(initialData?.scheduled_for || "");
  const [notes, setNotes] = useState("");
  const [captions, setCaptions] = useState<{ [key in Platform]?: string }>({});

  useEffect(() => {
    if (initialData) {
      if (initialData.title) setTitle(initialData.title);
      if (initialData.content_type) setContentType(initialData.content_type);
      if (initialData.pillar) setPillar(initialData.pillar);
      if (initialData.platforms) setPlatforms(initialData.platforms);
      if (initialData.hook) setBrief(initialData.hook);
      if (initialData.scheduled_for) {
        // Handle both date-only (YYYY-MM-DD) and full ISO strings
        const date = initialData.scheduled_for;
        setScheduledFor(date.includes("T") ? date.slice(0, 16) : `${date}T09:00`);
      }
    }
  }, [initialData]);

  useEffect(() => {
    if (editingPost) {
      if (editingPost.title) setTitle(editingPost.title);
      if (editingPost.content_type) setContentType(editingPost.content_type);
      if (editingPost.content_pillar) setPillar(editingPost.content_pillar);
      if (editingPost.platforms) setPlatforms(editingPost.platforms);
      if (editingPost.brief) setBrief(editingPost.brief);
      if (editingPost.captions) setCaptions(editingPost.captions);
      if (editingPost.hashtags) setHashtags(editingPost.hashtags);
      if (editingPost.first_comment) setFirstComment(editingPost.first_comment);
      if (editingPost.media_urls) setMediaUrls(editingPost.media_urls);
      if (editingPost.notes) setNotes(editingPost.notes);
      if (editingPost.scheduled_for) {
        const date = editingPost.scheduled_for;
        setScheduledFor(date.includes("T") ? date.slice(0, 16) : `${date}T09:00`);
      }
    }
  }, [editingPost]);

  // UI State
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [activePreview, setActivePreview] = useState<Platform>("instagram");
  const [uploading, setUploading] = useState(false);
  const [captionsGenerated, setCaptionsGenerated] = useState(false);
  const [regeneratingPlatform, setRegeneratingPlatform] = useState<Platform | null>(null);
  
  // Buffer scheduling state
  const [isScheduling, setIsScheduling] = useState(false);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [scheduleSuccess, setScheduleSuccess] = useState<string | null>(null);
  
  // Buffer warning if not configured
  const bufferConfigured = isBufferConfigured();

  const handleGenerateCaptions = async () => {
    if (!brief || platforms.length === 0) return;
    setIsGenerating(true);
    setCaptionsGenerated(false);

    try {
      const result = await generateCaptionsFromAI(brief, contentType, pillar, platforms);

      setCaptions({
        instagram: result.instagram || "",
        facebook: result.facebook || "",
        linkedin: result.linkedin || "",
      });
      setHashtags(result.hashtags || "");
      setFirstComment(result.first_comment || "");
      setCaptionsGenerated(true);
    } catch (error: unknown) {
      console.error("Generation failed:", error);
      const message = error instanceof Error ? error.message : "Generation failed";
      alert(`Generation failed: ${message}`);
    } finally {
      setIsGenerating(false);
    }
  };

  // Regenerate caption for a single platform
  const handleRegenerateCaption = async (platform: Platform) => {
    if (!brief) return;
    setRegeneratingPlatform(platform);

    try {
      const result = await generateCaptionsFromAI(brief, contentType, pillar, [platform]);
      setCaptions((prev) => ({
        ...prev,
        [platform]: result[platform] || "",
      }));
    } catch (error: unknown) {
      console.error("Regeneration failed:", error);
      const message = error instanceof Error ? error.message : "Regeneration failed";
      alert(`Regeneration failed: ${message}`);
    } finally {
      setRegeneratingPlatform(null);
    }
  };

  const savePost = async (status: "idea" | "ready" | "scheduled" | "posted") => {
    if (!title) {
      alert("Please provide a title for the post");
      return;
    }
    setIsSaving(true);
    try {
      const { error } = await supabase.from("content_posts").insert({
        title,
        content_type: contentType,
        content_pillar: pillar,
        platforms,
        brief,
        captions,
        hashtags,
        first_comment: firstComment,
        media_urls: mediaUrls,
        scheduled_for: scheduledFor || null,
        notes,
        status,
        posted_at: status === "posted" ? new Date().toISOString() : null,
      });

      if (error) throw error;
      alert(`Post saved as ${status} successfully!`);
    } catch (error: unknown) {
      console.error("Save failed:", error);
      const message = error instanceof Error ? error.message : "Save failed";
      alert(`Save failed: ${message}`);
    } finally {
      setIsSaving(false);
    }
  };

  // Validate before scheduling
  const validateScheduling = (): string | null => {
    if (!bufferConfigured) {
      return "Buffer not configured — add VITE_BUFFER_API_KEY to .env";
    }
    if (platforms.length === 0) {
      return "Please select at least one platform";
    }
    if (!scheduledFor) {
      return "Please set a schedule date and time";
    }
    // Check if captions are generated for selected platforms
    for (const platform of platforms) {
      if (!captions[platform]) {
        return `Please generate captions first (missing for ${platform})`;
      }
    }
    return null;
  };

  // Schedule post via Buffer
  const handleSchedule = async () => {
    const validationError = validateScheduling();
    if (validationError) {
      setScheduleError(validationError);
      setScheduleSuccess(null);
      return;
    }

    setIsScheduling(true);
    setScheduleError(null);
    setScheduleSuccess(null);

    try {
      // First save the post to Supabase
      const { data: postData, error: insertError } = await supabase
        .from("content_posts")
        .insert({
          title,
          content_type: contentType,
          content_pillar: pillar,
          platforms,
          brief,
          captions,
          hashtags,
          first_comment: firstComment,
          media_urls: mediaUrls,
          scheduled_for: scheduledFor,
          notes,
          status: "scheduled",
        })
        .select("id")
        .single();

      if (insertError) throw insertError;

      // Schedule to Buffer
      const result = await scheduleToAllPlatforms(
        platforms,
        captions as { instagram?: string; facebook?: string; linkedin?: string },
        scheduledFor,
        mediaUrls
      );

      // Build buffer_post_ids object
      const bufferPostIds: Record<string, string> = {};
      result.success.forEach((s) => {
        bufferPostIds[s.platform] = s.bufferId;
      });

      // Update with Buffer post IDs
      await supabase
        .from("content_posts")
        .update({
          status: "scheduled",
          scheduled_for: scheduledFor,
          buffer_post_ids: bufferPostIds,
        })
        .eq("id", postData.id);

      if (result.failed.length === 0) {
        // All succeeded
        setScheduleSuccess(`Scheduled to ${platforms.join(", ")}`);
        clearForm();
      } else if (result.success.length > 0) {
        // Partial success
        const succeededPlatforms = result.success.map((s) => s.platform).join(", ");
        const failedPlatforms = result.failed.map((f) => f.platform).join(", ");
        setScheduleSuccess(`Scheduled to: ${succeededPlatforms}`);
        setScheduleError(`Failed for: ${failedPlatforms}`);
      } else {
        // Total failure
        setScheduleError(result.failed[0]?.error || "Failed to schedule to Buffer");
      }
    } catch (error: unknown) {
      console.error("Scheduling failed:", error);
      const message = error instanceof Error ? error.message : "Failed to schedule post";
      setScheduleError(message);
    } finally {
      setIsScheduling(false);
    }
  };

  // Post Now via Buffer
  const handlePostNow = async () => {
    const validationError = validateScheduling();
    if (validationError) {
      setScheduleError(validationError);
      setScheduleSuccess(null);
      return;
    }

    setIsScheduling(true);
    setScheduleError(null);
    setScheduleSuccess(null);

    try {
      // First save the post to Supabase
      const { data: postData, error: insertError } = await supabase
        .from("content_posts")
        .insert({
          title,
          content_type: contentType,
          content_pillar: pillar,
          platforms,
          brief,
          captions,
          hashtags,
          first_comment: firstComment,
          media_urls: mediaUrls,
          scheduled_for: new Date().toISOString(),
          notes,
          status: "scheduled",
        })
        .select("id")
        .single();

      if (insertError) throw insertError;

      // Schedule to Buffer immediately
      const result = await postNow(
        platforms,
        captions as { instagram?: string; facebook?: string; linkedin?: string },
        mediaUrls
      );

      // Build buffer_post_ids object
      const bufferPostIds: Record<string, string> = {};
      result.success.forEach((s) => {
        bufferPostIds[s.platform] = s.bufferId;
      });

      // Update with Buffer post IDs
      await supabase
        .from("content_posts")
        .update({
          status: "scheduled",
          buffer_post_ids: bufferPostIds,
        })
        .eq("id", postData.id);

      if (result.failed.length === 0) {
        setScheduleSuccess(`Posted to ${platforms.join(", ")} (will go live in ~2 mins)`);
        clearForm();
      } else if (result.success.length > 0) {
        const succeededPlatforms = result.success.map((s) => s.platform).join(", ");
        const failedPlatforms = result.failed.map((f) => f.platform).join(", ");
        setScheduleSuccess(`Posted to: ${succeededPlatforms}`);
        setScheduleError(`Failed for: ${failedPlatforms}`);
      } else {
        setScheduleError(result.failed[0]?.error || "Failed to post to Buffer");
      }
    } catch (error: unknown) {
      console.error("Post now failed:", error);
      const message = error instanceof Error ? error.message : "Failed to post now";
      setScheduleError(message);
    } finally {
      setIsScheduling(false);
    }
  };

  // Clear the form
  const clearForm = () => {
    setTitle("");
    setBrief("");
    setCaptions({});
    setHashtags("");
    setFirstComment("");
    setMediaUrls([]);
    setScheduledFor("");
    setNotes("");
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    setUploading(true);
    // Simulate upload for now as we don't have a storage hook
    setTimeout(() => {
      const urls = Array.from(files).map((f) => URL.createObjectURL(f));
      setMediaUrls((prev) => [...prev, ...urls]);
      setUploading(false);
    }, 1000);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Left Side: Post Builder */}
      <div className="flex flex-col gap-6 bg-panel p-6 rounded-2xl border border-border">
        <div className="flex flex-col gap-4">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <PlusCircle className="h-5 w-5 text-purple" />
            Post Builder
          </h2>

          <div className="space-y-4">
            {/* Title */}
            <div>
              <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Title</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="What is this post about?"
                className="mt-1.5 w-full bg-base border border-border rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple/50 transition"
              />
            </div>

            {/* Content Type */}
            <div>
              <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Content Type</label>
              <div className="mt-1.5 flex flex-wrap gap-2">
                {CONTENT_TYPES.map(({ id, label, Icon }) => (
                  <button
                    key={id}
                    onClick={() => setContentType(id)}
                    className={cn(
                      "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition border",
                      contentType === id
                        ? "bg-purple/20 border-purple text-purple"
                        : "bg-base border-border text-zinc-400 hover:text-zinc-200"
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Content Pillar */}
            <div>
              <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Content Pillar</label>
              <div className="mt-1.5 flex flex-wrap gap-2">
                {PILLARS.map((p) => (
                  <button
                    key={p}
                    onClick={() => setPillar(p)}
                    className={cn(
                      "px-3 py-1.5 rounded-full text-xs font-medium transition border",
                      pillar === p
                        ? "bg-orange/20 border-orange text-orange"
                        : "bg-base border-border text-zinc-500 hover:text-zinc-300"
                    )}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>

            {/* Platforms */}
            <div>
              <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Platforms</label>
              <div className="mt-1.5 flex gap-3">
                {PLATFORMS.map(({ id, label, Icon, color }) => (
                  <button
                    key={id}
                    onClick={() => {
                      setPlatforms((prev) =>
                        prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
                      );
                    }}
                    className={cn(
                      "flex flex-1 items-center justify-center gap-2 py-3 rounded-xl text-sm font-medium transition border",
                      platforms.includes(id)
                        ? "bg-white/5 border-white/20 text-white"
                        : "bg-base border-border text-zinc-500"
                    )}
                  >
                    <Icon className={cn("h-5 w-5", platforms.includes(id) ? color : "text-zinc-500")} />
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Media Upload */}
            <div>
              <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Media</label>
              <div className="mt-1.5 flex flex-wrap gap-2">
                {mediaUrls.map((url, idx) => (
                  <div key={idx} className="relative h-20 w-20 rounded-lg overflow-hidden border border-border group">
                    <img src={url} alt="Media" className="h-full w-full object-cover" />
                    <button
                      onClick={() => setMediaUrls((prev) => prev.filter((_, i) => i !== idx))}
                      className="absolute top-1 right-1 p-0.5 bg-black/60 text-white rounded-md opacity-0 group-hover:opacity-100 transition"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
                <label className="flex h-20 w-20 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-border bg-base text-zinc-500 hover:border-zinc-400 hover:text-zinc-400 transition">
                  {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Upload className="h-5 w-5" />}
                  <span className="mt-1 text-[10px]">Upload</span>
                  <input type="file" multiple onChange={handleFileUpload} className="hidden" />
                </label>
              </div>
            </div>

            {/* Brief */}
            <div>
              <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Post Brief</label>
              <textarea
                value={brief}
                onChange={(e) => setBrief(e.target.value)}
                rows={3}
                placeholder="Describe what this post is about in 1-2 sentences. Claude will generate platform-specific captions."
                className="mt-1.5 w-full bg-base border border-border rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple/50 transition resize-none"
              />
            </div>

            {/* Generate Button */}
            <button
              onClick={handleGenerateCaptions}
              disabled={isGenerating || !brief}
              className="w-full flex items-center justify-center gap-2 py-3 bg-purple text-white rounded-xl text-sm font-bold hover:bg-purple/90 transition shadow-lg shadow-purple/20 disabled:opacity-50"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Generating Captions...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  Generate Captions
                </>
              )}
            </button>

            {/* Hashtags & First Comment */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Hashtags</label>
                <textarea
                  value={hashtags}
                  onChange={(e) => setHashtags(e.target.value)}
                  className="mt-1.5 w-full bg-base border border-border rounded-xl px-4 py-2 text-xs text-zinc-300 focus:outline-none focus:ring-2 focus:ring-purple/50 transition resize-none"
                  rows={2}
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">First Comment</label>
                <textarea
                  value={firstComment}
                  onChange={(e) => setFirstComment(e.target.value)}
                  className="mt-1.5 w-full bg-base border border-border rounded-xl px-4 py-2 text-xs text-zinc-300 focus:outline-none focus:ring-2 focus:ring-purple/50 transition resize-none"
                  rows={2}
                />
              </div>
            </div>

            {/* Schedule & Notes */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Schedule Date</label>
                <input
                  type="datetime-local"
                  value={scheduledFor}
                  onChange={(e) => setScheduledFor(e.target.value)}
                  className="mt-1.5 w-full bg-base border border-border rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple/50 transition"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Internal Notes</label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="mt-1.5 w-full bg-base border border-border rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple/50 transition"
                />
              </div>
            </div>

            {/* Buffer Warning */}
            {!bufferConfigured && (
              <div className="flex items-center gap-2 p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-400 text-sm">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>Buffer not configured — add VITE_BUFFER_API_KEY to .env</span>
              </div>
            )}

            {/* Success/Error Messages */}
            {scheduleSuccess && (
              <div className="flex items-center gap-2 p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-400 text-sm">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <span>{scheduleSuccess}</span>
              </div>
            )}
            {scheduleError && (
              <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>{scheduleError}</span>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex flex-wrap gap-3 pt-4">
              <button
                onClick={() => savePost("idea")}
                disabled={isSaving || isScheduling}
                className="flex-1 min-w-[120px] flex items-center justify-center gap-2 py-2.5 bg-white/5 text-zinc-400 rounded-xl text-sm font-semibold hover:bg-white/10 hover:text-white transition disabled:opacity-50"
              >
                <Save className="h-4 w-4" />
                Save as Idea
              </button>
              <button
                onClick={() => savePost("ready")}
                disabled={isSaving || isScheduling}
                className="flex-1 min-w-[120px] flex items-center justify-center gap-2 py-2.5 bg-blue-500/10 text-blue-400 rounded-xl text-sm font-semibold hover:bg-blue-500/20 transition disabled:opacity-50"
              >
                <CheckCircle2 className="h-4 w-4" />
                Save as Ready
              </button>
              <button
                onClick={handleSchedule}
                disabled={isScheduling || !bufferConfigured}
                className="flex-1 min-w-[120px] flex items-center justify-center gap-2 py-2.5 bg-purple text-white rounded-xl text-sm font-semibold hover:bg-purple/90 transition shadow-lg shadow-purple/20 disabled:opacity-50"
              >
                {isScheduling ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Scheduling...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4" />
                    Schedule
                  </>
                )}
              </button>
              <button
                onClick={handlePostNow}
                disabled={isScheduling || !bufferConfigured}
                className="flex-1 min-w-[120px] flex items-center justify-center gap-2 py-2.5 bg-orange text-white rounded-xl text-sm font-semibold hover:bg-orange/90 transition shadow-lg shadow-orange/20 disabled:opacity-50"
              >
                {isScheduling ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Posting...
                  </>
                ) : (
                  <>
                    <Zap className="h-4 w-4" />
                    Post Now
                  </>
                )}
              </button>
              <button
                onClick={() => savePost("posted")}
                disabled={isSaving || isScheduling}
                className="flex-1 min-w-[120px] flex items-center justify-center gap-2 py-2.5 bg-emerald-500/10 text-emerald-400 rounded-xl text-sm font-semibold hover:bg-emerald-500/20 transition disabled:opacity-50"
              >
                <CheckCircle2 className="h-4 w-4" />
                Mark Posted
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Right Side: Live Preview */}
      <div className="flex flex-col gap-6">
        <div className="flex items-center gap-1 rounded-xl bg-panel p-1 border border-border w-fit">
          {PLATFORMS.map(({ id, Icon, color }) => (
            <button
              key={id}
              onClick={() => setActivePreview(id)}
              className={cn(
                "flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition",
                activePreview === id
                  ? "bg-white/10 text-white"
                  : "text-zinc-500 hover:text-zinc-300"
              )}
            >
              <Icon className={cn("h-4 w-4", activePreview === id ? color : "text-zinc-500")} />
              <span className="capitalize">{id}</span>
            </button>
          ))}
        </div>

        {/* Phone Mockup */}
        <div className="relative mx-auto w-[320px] h-[640px] bg-zinc-900 rounded-[3rem] border-[8px] border-zinc-800 shadow-2xl overflow-hidden flex flex-col">
          {/* Top Bar */}
          <div className="h-6 w-full flex justify-center items-end pb-1">
            <div className="h-1.5 w-16 bg-zinc-800 rounded-full" />
          </div>

          <div className="flex-1 overflow-y-auto bg-black p-4 scrollbar-hide">
            {/* Platform Header */}
            <div className="flex items-center gap-2 mb-4">
              <div className="h-8 w-8 rounded-full bg-gradient-to-tr from-purple to-orange flex items-center justify-center text-[10px] font-bold text-white">
                SA
              </div>
              <div>
                <div className="text-[10px] font-bold text-white leading-none">streamline.automations</div>
                <div className="text-[8px] text-zinc-500">Sponsored</div>
              </div>
            </div>

            {/* Content Preview */}
            <div className="aspect-square bg-zinc-800 rounded-lg overflow-hidden mb-4 flex items-center justify-center">
              {mediaUrls.length > 0 ? (
                <img src={mediaUrls[0]} alt="Preview" className="h-full w-full object-cover" />
              ) : (
                <ImageIcon className="h-10 w-10 text-zinc-700" />
              )}
            </div>

            {/* Interaction Icons */}
            <div className="flex gap-3 mb-3">
              <div className="h-4 w-4 rounded-full border border-zinc-500" />
              <div className="h-4 w-4 rounded-full border border-zinc-500" />
              <div className="h-4 w-4 rounded-full border border-zinc-500" />
            </div>

            {/* Caption */}
            <div className="space-y-2">
              <div className="text-[11px] text-white">
                <span className="font-bold mr-2">streamline.automations</span>
                {captions[activePreview] || (
                  <span className="text-zinc-600 italic">No caption generated yet...</span>
                )}
              </div>
              {hashtags && <div className="text-[11px] text-blue-400">{hashtags}</div>}
              {firstComment && (
                <div className="mt-4 pt-4 border-t border-zinc-800">
                  <div className="text-[9px] text-zinc-500 font-bold mb-1 uppercase">First Comment</div>
                  <div className="text-[10px] text-zinc-300 italic">{firstComment}</div>
                </div>
              )}
            </div>
          </div>

          {/* Character Count */}
          <div className="p-4 bg-zinc-900 border-t border-zinc-800">
            <div className="flex justify-between items-center text-[10px]">
              <span className="text-zinc-500">Character Count</span>
              <span className={cn(
                "font-bold",
                (captions[activePreview]?.length || 0) > 2200 ? "text-red-500" : "text-emerald-500"
              )}>
                {captions[activePreview]?.length || 0} / 2200
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
