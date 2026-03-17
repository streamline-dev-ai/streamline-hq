import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Clipboard, Check, Pencil, Save, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/toast/ToastProvider";
import { useLeadContextStore } from "@/stores/leadContext";

type TemplateRow = {
  id: string;
  name: string;
  stage: string;
  language: string | null;
  text: string;
  send_count: number | null;
  reply_count: number | null;
};

function languageLabel(language: string | null) {
  const l = (language ?? "english").toLowerCase();
  if (l.startsWith("af")) return "Afrikaans";
  return "English";
}

function languageBadgeClass(language: string | null) {
  const l = (language ?? "english").toLowerCase();
  if (l.startsWith("af")) return "border-orange/30 bg-orange/15 text-orange";
  return "border-purple/30 bg-purple/15 text-purple";
}

function responseRate(sendCount: number, replyCount: number) {
  if (sendCount <= 0) return null;
  const pct = Math.round((replyCount / sendCount) * 100);
  return `${pct}%`;
}

function findVariables(text: string) {
  const set = new Set<string>();
  const re = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) set.add(m[1]);
  return Array.from(set);
}

function renderWithVariables(text: string) {
  const re = /\{\{\s*[a-zA-Z0-9_]+\s*\}\}/g;
  const parts: Array<{ type: "text" | "var"; value: string }> = [];
  let last = 0;
  for (const match of text.matchAll(re)) {
    const idx = match.index ?? 0;
    if (idx > last) parts.push({ type: "text", value: text.slice(last, idx) });
    parts.push({ type: "var", value: match[0] });
    last = idx + match[0].length;
  }
  if (last < text.length) parts.push({ type: "text", value: text.slice(last) });

  return (
    <div className="whitespace-pre-wrap text-sm text-zinc-200">
      {parts.map((p, i) =>
        p.type === "var" ? (
          <span key={i} className="rounded bg-purple/15 px-1 text-purple">
            {p.value}
          </span>
        ) : (
          <span key={i}>{p.value}</span>
        ),
      )}
    </div>
  );
}

function applyVariables(text: string, values: Record<string, string>) {
  return text.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, name: string) => values[name] ?? "");
}

function groupKey(stage: string) {
  const s = (stage ?? "").toLowerCase().trim();
  if (s === "new" || s === "openers" || s === "opener") return "new";
  if (s === "messaged" || s === "pitch") return "messaged";
  if (s === "replied" || s === "demo_sent" || s === "demo send" || s === "demo") return "replied";
  if (s.includes("follow")) return "follow_up";
  return "other";
}

const GROUPS: Array<{ key: string; title: string; subtitle: string }> = [
  { key: "new", title: "New", subtitle: "Openers" },
  { key: "messaged", title: "Messaged", subtitle: "Pitch" },
  { key: "replied", title: "Replied", subtitle: "Demo send" },
  { key: "follow_up", title: "Follow up", subtitle: "Nudges" },
  { key: "other", title: "Other", subtitle: "Unsorted" },
];

export default function Messages() {
  const { pushToast } = useToast();
  const activeLead = useLeadContextStore((s) => s.activeLead);
  const [loading, setLoading] = useState(true);
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const copiedTimeoutRef = useRef<number | null>(null);

  const [variableModal, setVariableModal] = useState<{
    template: TemplateRow;
    vars: string[];
    values: Record<string, string>;
  } | null>(null);

  const [editModal, setEditModal] = useState<{ template: TemplateRow; text: string } | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  const grouped = useMemo(() => {
    const map = new Map<string, TemplateRow[]>();
    for (const t of templates) {
      const key = groupKey(t.stage);
      map.set(key, [...(map.get(key) ?? []), t]);
    }
    for (const [k, arr] of map.entries()) {
      map.set(
        k,
        arr.slice().sort((a, b) => a.name.localeCompare(b.name)),
      );
    }
    return map;
  }, [templates]);

  const loadTemplates = useCallback(async () => {
    setLoading(true);
    try {
      const res = await supabase
        .from("message_templates")
        .select("id, name, stage, language, text, send_count, reply_count")
        .order("stage", { ascending: true })
        .order("name", { ascending: true });
      if (res.error) throw res.error;
      setTemplates((res.data ?? []) as TemplateRow[]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to load templates";
      pushToast({ type: "error", title: "Messages", message: msg });
    } finally {
      setLoading(false);
    }
  }, [pushToast]);

  useEffect(() => {
    void loadTemplates();
  }, [loadTemplates]);

  useEffect(() => {
    const channel = supabase
      .channel("message-templates")
      .on("postgres_changes", { event: "*", schema: "public", table: "message_templates" }, () => {
        void loadTemplates();
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadTemplates]);

  useEffect(() => {
    return () => {
      if (copiedTimeoutRef.current) window.clearTimeout(copiedTimeoutRef.current);
    };
  }, []);

  function prefillValues(vars: string[]) {
    const values: Record<string, string> = {};
    for (const v of vars) values[v] = "";
    if (activeLead) {
      if (values.business_name !== undefined) values.business_name = activeLead.business_name;
      if (values.owner_name !== undefined) values.owner_name = activeLead.owner_name ?? "";
      if (values.demo_url !== undefined) values.demo_url = activeLead.demo_url ?? "";
    }
    return values;
  }

  async function copyAndTrack(template: TemplateRow, finalText: string) {
    try {
      await navigator.clipboard.writeText(finalText);
      setCopiedId(template.id);
      if (copiedTimeoutRef.current) window.clearTimeout(copiedTimeoutRef.current);
      copiedTimeoutRef.current = window.setTimeout(() => setCopiedId(null), 2000);
    } catch {
      pushToast({ type: "error", title: "Copy", message: "Clipboard access was blocked" });
      return;
    }

    const nextSend = (template.send_count ?? 0) + 1;
    setTemplates((prev) => prev.map((t) => (t.id === template.id ? { ...t, send_count: nextSend } : t)));

    try {
      const updateRes = await supabase.from("message_templates").update({ send_count: nextSend }).eq("id", template.id);
      if (updateRes.error) throw updateRes.error;

      if (activeLead) {
        const nowIso = new Date().toISOString();
        await supabase.from("outreach_messages").insert({
          lead_id: activeLead.id,
          direction: "sent",
          message_text: finalText,
          template_id: template.id,
          sent_at: nowIso,
          replied: false,
        });
        await supabase.from("leads").update({ last_contact_at: nowIso }).eq("id", activeLead.id);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to track send";
      pushToast({ type: "error", title: "Copy & Track", message: msg });
    }
  }

  async function onCopyClick(template: TemplateRow) {
    const vars = findVariables(template.text);
    if (vars.length) {
      setVariableModal({ template, vars, values: prefillValues(vars) });
      return;
    }
    await copyAndTrack(template, template.text);
  }

  async function saveTemplateEdit() {
    if (!editModal) return;
    const next = editModal.text.trim();
    if (!next) {
      pushToast({ type: "error", title: "Edit", message: "Template text cannot be empty" });
      return;
    }

    setSavingId(editModal.template.id);
    setTemplates((prev) => prev.map((t) => (t.id === editModal.template.id ? { ...t, text: next } : t)));
    try {
      const res = await supabase.from("message_templates").update({ text: next }).eq("id", editModal.template.id);
      if (res.error) throw res.error;
      setEditModal(null);
      pushToast({ type: "success", title: "Saved", message: editModal.template.name });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to save template";
      pushToast({ type: "error", title: "Edit", message: msg });
      void loadTemplates();
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border bg-panel p-4">
        <div className="text-lg font-semibold leading-none">Message bank</div>
        <div className="mt-1 text-sm text-zinc-400">
          One-tap copy with tracking. {activeLead ? `Active lead: ${activeLead.business_name}` : "Select a lead in /leads for smart variables."}
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-2xl border border-border bg-panel p-4">
              <div className="animate-pulse">
                <div className="h-4 w-2/3 rounded bg-white/10" />
                <div className="mt-3 h-3 w-full rounded bg-white/5" />
                <div className="mt-2 h-3 w-4/5 rounded bg-white/5" />
                <div className="mt-4 h-10 w-full rounded-xl bg-white/10" />
              </div>
            </div>
          ))}
        </div>
      ) : templates.length === 0 ? (
        <div className="rounded-2xl border border-border bg-panel p-6 text-center">
          <div className="text-sm font-semibold">No templates</div>
          <div className="mt-1 text-sm text-zinc-400">Add rows to the Supabase `message_templates` table.</div>
        </div>
      ) : (
        <div className="space-y-4">
          {GROUPS.map((g) => {
            const list = grouped.get(g.key) ?? [];
            if (list.length === 0) return null;
            return (
              <div key={g.key} className="space-y-2">
                <div className="flex items-end justify-between">
                  <div>
                    <div className="text-sm font-semibold">{g.title}</div>
                    <div className="text-xs text-zinc-400">{g.subtitle}</div>
                  </div>
                  <div className="text-xs text-zinc-400">{list.length} templates</div>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {list.map((t) => {
                    const send = t.send_count ?? 0;
                    const reply = t.reply_count ?? 0;
                    const rate = responseRate(send, reply);
                    return (
                      <div key={t.id} className="rounded-2xl border border-border bg-panel p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="truncate text-base font-semibold">{t.name}</div>
                            <div className="mt-1 flex flex-wrap items-center gap-2">
                              <div className={cn("inline-flex items-center rounded-full border px-2 py-1 text-xs font-semibold", languageBadgeClass(t.language))}>
                                {languageLabel(t.language)}
                              </div>
                              {rate ? (
                                <div className="inline-flex items-center rounded-full border border-emerald-500/30 bg-emerald-500/15 px-2 py-1 text-xs font-semibold text-emerald-300">
                                  {rate} response
                                </div>
                              ) : (
                                <div className="inline-flex items-center rounded-full border border-border bg-white/5 px-2 py-1 text-xs text-zinc-300">
                                  No data yet
                                </div>
                              )}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => setEditModal({ template: t, text: t.text })}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-base/40 text-zinc-200 hover:bg-white/5"
                            aria-label="Edit template"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                        </div>

                        <div className="mt-3">{renderWithVariables(t.text)}</div>

                        <button
                          type="button"
                          onClick={() => void onCopyClick(t)}
                          className={cn(
                            "mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold transition",
                            copiedId === t.id
                              ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-300"
                              : "border-border bg-base/40 text-zinc-200 hover:bg-white/5",
                          )}
                        >
                          {copiedId === t.id ? <Check className="h-4 w-4" /> : <Clipboard className="h-4 w-4" />}
                          {copiedId === t.id ? "Copied!" : "Copy & Track"}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {variableModal ? (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/60 p-4 sm:items-center">
          <div className="w-full max-w-lg rounded-3xl border border-border bg-panel p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-base font-semibold">Fill variables</div>
                <div className="mt-1 text-sm text-zinc-400">These placeholders will be replaced before copying.</div>
              </div>
              <button
                type="button"
                onClick={() => setVariableModal(null)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-base/40 text-zinc-200 hover:bg-white/5"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 grid gap-3">
              {variableModal.vars.map((v) => (
                <div key={v} className="grid gap-1">
                  <label className="text-xs text-zinc-400">{`{{${v}}}`}</label>
                  <input
                    value={variableModal.values[v] ?? ""}
                    onChange={(e) =>
                      setVariableModal((p) =>
                        p
                          ? {
                              ...p,
                              values: { ...p.values, [v]: e.target.value },
                            }
                          : p,
                      )
                    }
                    className="rounded-xl border border-border bg-base/40 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-purple/40"
                  />
                </div>
              ))}
            </div>

            <div className="mt-4 rounded-2xl border border-border bg-base/40 p-3">
              <div className="text-xs text-zinc-400">Preview</div>
              <div className="mt-2 whitespace-pre-wrap text-sm text-zinc-200">
                {applyVariables(variableModal.template.text, variableModal.values)}
              </div>
            </div>

            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setVariableModal(null)}
                className="rounded-xl border border-border bg-base/40 px-3 py-2 text-sm text-zinc-200 hover:bg-white/5"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const finalText = applyVariables(variableModal.template.text, variableModal.values);
                  void copyAndTrack(variableModal.template, finalText);
                  setVariableModal(null);
                }}
                className="rounded-xl bg-purple px-4 py-2 text-sm font-semibold text-black hover:brightness-110"
              >
                Copy & Track
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {editModal ? (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/60 p-4 sm:items-center">
          <div className="w-full max-w-2xl rounded-3xl border border-border bg-panel p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-base font-semibold">Edit template</div>
                <div className="mt-1 text-sm text-zinc-400">{editModal.template.name}</div>
              </div>
              <button
                type="button"
                onClick={() => setEditModal(null)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-base/40 text-zinc-200 hover:bg-white/5"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <textarea
              value={editModal.text}
              onChange={(e) => setEditModal((p) => (p ? { ...p, text: e.target.value } : p))}
              className="mt-4 min-h-[180px] w-full rounded-2xl border border-border bg-base/40 p-3 text-sm text-zinc-100 outline-none focus:border-purple/40"
            />

            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditModal(null)}
                className="rounded-xl border border-border bg-base/40 px-3 py-2 text-sm text-zinc-200 hover:bg-white/5"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void saveTemplateEdit()}
                disabled={savingId === editModal.template.id}
                className={cn(
                  "inline-flex items-center gap-2 rounded-xl bg-purple px-4 py-2 text-sm font-semibold text-black hover:brightness-110",
                  savingId === editModal.template.id && "opacity-60",
                )}
              >
                <Save className="h-4 w-4" />
                Save
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

