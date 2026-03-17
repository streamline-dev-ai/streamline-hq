import { useEffect, useMemo, useState } from "react";
import { Check, RefreshCcw, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { requestGeminiSuggestion } from "@/lib/gemini";
import { useToast } from "@/components/toast/ToastProvider";

type LeadRow = {
  id: string;
  business_name: string;
  owner_name: string | null;
  stage: string | null;
  notes: string | null;
};

export default function SuggestReplyModal({ lead, open, onClose }: { lead: LeadRow | null; open: boolean; onClose: () => void }) {
  const { pushToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState("");
  const [copied, setCopied] = useState(false);
  const [lastMessage, setLastMessage] = useState<string | null>(null);

  const languageHint = useMemo(() => {
    if (!lastMessage) return null;
    const t = lastMessage.toLowerCase();
    if (t.includes("dankie") || t.includes("asseblief") || t.includes("goed") || t.includes("môre") || t.includes("more")) return "Afrikaans";
    return "English";
  }, [lastMessage]);

  const regenerate = async () => {
    if (!lead) return;
    setLoading(true);
    try {
      const suggestion = await requestGeminiSuggestion({
        lead: {
          business_name: lead.business_name,
          owner_name: lead.owner_name,
          stage: lead.stage,
          notes: lead.notes,
        },
        last_message: lastMessage,
        conversation_language_hint: languageHint,
      });
      setText(suggestion.trim());
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to generate suggestion";
      pushToast({ type: "error", title: "Suggest reply", message: msg });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open || !lead) return;
    setCopied(false);
    setText("");
    setLastMessage(null);

    (async () => {
      try {
        const r = await supabase
          .from("outreach_messages")
          .select("message_text")
          .eq("lead_id", lead.id)
          .eq("direction", "sent")
          .order("sent_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (r.data?.message_text) setLastMessage(r.data.message_text);
      } finally {
        await regenerate();
      }
    })();
  }, [lead, open]);

  async function copyAndUse() {
    const final = text.trim();
    if (!lead || !final) return;
    try {
      await navigator.clipboard.writeText(final);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      pushToast({ type: "error", title: "Copy", message: "Clipboard access was blocked" });
      return;
    }

    try {
      await supabase.from("leads").update({ opener_used: "ai_suggest" }).eq("id", lead.id);
    } catch {
      return;
    }
  }

  return (
    <div className={cn("fixed inset-0 z-50", open ? "pointer-events-auto" : "pointer-events-none")}> 
      <div onClick={onClose} className={cn("absolute inset-0 bg-black/60 transition-opacity", open ? "opacity-100" : "opacity-0")} />
      <div
        className={cn(
          "absolute bottom-0 left-0 right-0 mx-auto w-full max-w-2xl rounded-t-3xl border border-border bg-panel p-4 transition-transform",
          "pb-[calc(env(safe-area-inset-bottom)+16px)]",
          open ? "translate-y-0" : "translate-y-full",
        )}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-base font-semibold">Suggest reply</div>
            <div className="mt-1 text-sm text-zinc-400">{lead ? lead.business_name : ""}</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-base/40 text-zinc-200 hover:bg-white/5"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="mt-4 min-h-[140px] w-full rounded-2xl border border-border bg-base/40 p-3 text-sm text-zinc-100 outline-none focus:border-purple/40"
          placeholder={loading ? "Generating…" : ""}
        />

        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
          <button
            type="button"
            disabled={loading}
            onClick={() => void regenerate()}
            className={cn(
              "inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-base/40 px-3 py-2 text-sm font-semibold text-zinc-200 hover:bg-white/5",
              loading && "opacity-60",
            )}
          >
            <RefreshCcw className="h-4 w-4" />
            Regenerate
          </button>
          <button
            type="button"
            onClick={() => void copyAndUse()}
            className={cn(
              "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition",
              copied ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30" : "bg-purple text-black hover:brightness-110",
            )}
          >
            <Check className="h-4 w-4" />
            {copied ? "Copied!" : "Copy & Use"}
          </button>
        </div>
      </div>
    </div>
  );
}
