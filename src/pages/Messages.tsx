import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Clipboard, Check, Pencil, Save } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/components/toast/ToastProvider";
import { useLeadContextStore } from "@/stores/leadContext";
import {
  Button,
  Card,
  CardBody,
  Badge,
  Modal,
  Field,
  Input,
  Textarea,
  EmptyState,
  PageHeader,
  PageTransition,
  Skeleton,
} from "@/ui";

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
  return (language ?? "english").toLowerCase().startsWith("af") ? "Afrikaans" : "English";
}
function responseRate(sendCount: number, replyCount: number) {
  if (sendCount <= 0) return null;
  return `${Math.round((replyCount / sendCount) * 100)}%`;
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
    <div className="whitespace-pre-wrap text-sm text-ink-muted">
      {parts.map((p, i) =>
        p.type === "var" ? (
          <span key={i} className="rounded bg-brand-soft px-1 text-brand">
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
const GROUPS = [
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
    let filteredTemplates = templates;
    if (activeLead) {
      const isRestaurant = (activeLead.niche ?? "").toLowerCase() === "restaurant";
      filteredTemplates = templates.filter((t) => {
        const isRestaurantTemplate = t.name.toLowerCase().startsWith("restaurant");
        return isRestaurant ? isRestaurantTemplate : !isRestaurantTemplate;
      });
      if (activeLead.stage) {
        const leadGroupKey = groupKey(activeLead.stage);
        filteredTemplates = filteredTemplates.filter((t) => groupKey(t.stage) === leadGroupKey);
      }
    }
    for (const t of filteredTemplates) {
      const key = groupKey(t.stage);
      map.set(key, [...(map.get(key) ?? []), t]);
    }
    for (const [k, arr] of map.entries())
      map.set(k, arr.slice().sort((a, b) => a.name.localeCompare(b.name)));
    return map;
  }, [templates, activeLead]);

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
      pushToast({
        type: "error",
        title: "Messages",
        message: e instanceof Error ? e.message : "Failed to load templates",
      });
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
      .on("postgres_changes", { event: "*", schema: "public", table: "message_templates" }, () =>
        void loadTemplates(),
      )
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
    setTemplates((prev) =>
      prev.map((t) => (t.id === template.id ? { ...t, send_count: nextSend } : t)),
    );
    try {
      const r = await supabase
        .from("message_templates")
        .update({ send_count: nextSend })
        .eq("id", template.id);
      if (r.error) throw r.error;
    } catch (e) {
      pushToast({
        type: "error",
        title: "Copy & Track",
        message: e instanceof Error ? e.message : "Failed to track send",
      });
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
    setTemplates((prev) =>
      prev.map((t) => (t.id === editModal.template.id ? { ...t, text: next } : t)),
    );
    try {
      const r = await supabase
        .from("message_templates")
        .update({ text: next })
        .eq("id", editModal.template.id);
      if (r.error) throw r.error;
      setEditModal(null);
      pushToast({ type: "success", title: "Saved", message: editModal.template.name });
    } catch (e) {
      pushToast({
        type: "error",
        title: "Edit",
        message: e instanceof Error ? e.message : "Failed to save template",
      });
      void loadTemplates();
    } finally {
      setSavingId(null);
    }
  }

  return (
    <PageTransition>
      <PageHeader
        title="Message bank"
        subtitle={
          activeLead ? `Active: ${activeLead.business_name}` : "One-tap copy with tracking"
        }
      />

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-44 w-full" />
          ))}
        </div>
      ) : templates.length === 0 ? (
        <EmptyState
          title="No templates"
          body="Add rows to the message_templates table in Supabase."
        />
      ) : (
        <div className="space-y-5">
          {GROUPS.map((g) => {
            const list = grouped.get(g.key) ?? [];
            if (list.length === 0) return null;
            return (
              <div key={g.key} className="space-y-2">
                <div className="flex items-end justify-between px-1">
                  <div>
                    <div className="text-sm font-semibold text-ink">{g.title}</div>
                    <div className="text-xs text-ink-faint">{g.subtitle}</div>
                  </div>
                  <div className="text-xs text-ink-faint">{list.length}</div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {list.map((t) => {
                    const rate = responseRate(t.send_count ?? 0, t.reply_count ?? 0);
                    const isCopied = copiedId === t.id;
                    return (
                      <Card key={t.id}>
                        <CardBody>
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="truncate text-sm font-semibold text-ink">
                                {t.name}
                              </div>
                              <div className="mt-1.5 flex flex-wrap gap-1.5">
                                <Badge
                                  tone={
                                    languageLabel(t.language) === "Afrikaans"
                                      ? "accent"
                                      : "brand"
                                  }
                                >
                                  {languageLabel(t.language)}
                                </Badge>
                                {rate ? (
                                  <Badge tone="success">{rate} reply</Badge>
                                ) : (
                                  <Badge>No data</Badge>
                                )}
                              </div>
                            </div>
                            <button
                              onClick={() => setEditModal({ template: t, text: t.text })}
                              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-line bg-surface text-ink-muted active:scale-95"
                              aria-label="Edit template"
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                          </div>
                          <div className="mt-3">{renderWithVariables(t.text)}</div>
                          <Button
                            block
                            size="md"
                            variant={isCopied ? "subtle" : "secondary"}
                            className="mt-4"
                            onClick={() => void onCopyClick(t)}
                          >
                            {isCopied ? (
                              <Check className="h-4 w-4" />
                            ) : (
                              <Clipboard className="h-4 w-4" />
                            )}
                            {isCopied ? "Copied!" : "Copy & Track"}
                          </Button>
                        </CardBody>
                      </Card>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal
        open={!!variableModal}
        onClose={() => setVariableModal(null)}
        title="Fill variables"
      >
        {variableModal && (
          <div className="space-y-3">
            {variableModal.vars.map((v) => (
              <Field key={v} label={`{{${v}}}`}>
                <Input
                  value={variableModal.values[v] ?? ""}
                  onChange={(e) =>
                    setVariableModal((p) =>
                      p ? { ...p, values: { ...p.values, [v]: e.target.value } } : p,
                    )
                  }
                />
              </Field>
            ))}
            <div className="rounded-xl border border-line bg-base/40 p-3">
              <div className="text-xs text-ink-faint">Preview</div>
              <div className="mt-2 whitespace-pre-wrap text-sm text-ink-muted">
                {applyVariables(variableModal.template.text, variableModal.values)}
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setVariableModal(null)}>
                Cancel
              </Button>
              <Button
                onClick={() => {
                  const finalText = applyVariables(
                    variableModal.template.text,
                    variableModal.values,
                  );
                  void copyAndTrack(variableModal.template, finalText);
                  setVariableModal(null);
                }}
              >
                Copy & Track
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={!!editModal} onClose={() => setEditModal(null)} title="Edit template">
        {editModal && (
          <div className="space-y-3">
            <div className="text-xs text-ink-faint">{editModal.template.name}</div>
            <Textarea
              rows={8}
              value={editModal.text}
              onChange={(e) =>
                setEditModal((p) => (p ? { ...p, text: e.target.value } : p))
              }
            />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setEditModal(null)}>
                Cancel
              </Button>
              <Button
                loading={savingId === editModal.template.id}
                onClick={() => void saveTemplateEdit()}
              >
                <Save className="h-4 w-4" />
                Save
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </PageTransition>
  );
}
