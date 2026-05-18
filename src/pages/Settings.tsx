import { useCallback, useEffect, useMemo, useState } from "react";
import { Save, RotateCcw, Plus, Trash2, Tags } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/components/toast/ToastProvider";
import {
  loadOutreachTemplates,
  saveOutreachTemplates,
  resetOutreachTemplates,
  OUTREACH_TEMPLATE_META,
  type OutreachTemplateKey,
} from "@/lib/outreach";
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Badge,
  Field,
  Input,
  Textarea,
  Segmented,
  EmptyState,
  PageHeader,
  PageTransition,
} from "@/ui";

type Niche = {
  id: string;
  name: string;
  description: string | null;
  status: string | null;
  target_per_day: number | null;
};

export default function Settings() {
  const { pushToast } = useToast();
  const [section, setSection] = useState<"templates" | "niches">("templates");

  // ---- Outreach templates ----
  const [draft, setDraft] = useState<Record<OutreachTemplateKey, string>>(() =>
    loadOutreachTemplates(),
  );
  const [dirty, setDirty] = useState(false);

  function saveTemplates() {
    saveOutreachTemplates(draft);
    setDirty(false);
    pushToast({ type: "success", title: "Saved", message: "Outreach templates updated" });
  }
  function resetTemplates() {
    resetOutreachTemplates();
    setDraft(loadOutreachTemplates());
    setDirty(false);
    pushToast({ type: "info", title: "Reset", message: "Templates back to defaults" });
  }

  // ---- Niches ----
  const [niches, setNiches] = useState<Niche[]>([]);
  const [nicheForm, setNicheForm] = useState({ name: "", target: "10" });

  const loadNiches = useCallback(async () => {
    const r = await supabase
      .from("niches")
      .select("id, name, description, status, target_per_day")
      .order("name");
    if (!r.error) setNiches((r.data ?? []) as Niche[]);
  }, []);

  useEffect(() => {
    void loadNiches();
  }, [loadNiches]);

  async function addNiche() {
    const name = nicheForm.name.trim();
    if (!name) return;
    const payload = {
      name,
      target_per_day: Number(nicheForm.target) || 10,
      status: "active",
    };
    const r = await supabase.from("niches").insert(payload).select("*").single();
    if (r.error) return pushToast({ type: "error", title: "Niche", message: r.error.message });
    setNiches((p) => [...p, r.data as Niche].sort((a, b) => a.name.localeCompare(b.name)));
    setNicheForm({ name: "", target: "10" });
  }
  async function toggleNiche(n: Niche) {
    const status = n.status === "active" ? "paused" : "active";
    setNiches((p) => p.map((x) => (x.id === n.id ? { ...x, status } : x)));
    const r = await supabase.from("niches").update({ status }).eq("id", n.id);
    if (r.error) {
      pushToast({ type: "error", title: "Niche", message: r.error.message });
      void loadNiches();
    }
  }
  async function delNiche(id: string) {
    setNiches((p) => p.filter((n) => n.id !== id));
    const r = await supabase.from("niches").delete().eq("id", id);
    if (r.error) {
      pushToast({ type: "error", title: "Niche", message: r.error.message });
      void loadNiches();
    }
  }

  const grouped = useMemo(() => {
    const groups: { title: string; items: typeof OUTREACH_TEMPLATE_META }[] = [];
    let cur: { title: string; items: typeof OUTREACH_TEMPLATE_META } | null = null;
    for (const m of OUTREACH_TEMPLATE_META) {
      const title = m.label.includes("—") ? m.label.split("—")[0].trim() : "General";
      if (!cur || cur.title !== title) {
        cur = { title, items: [] };
        groups.push(cur);
      }
      cur.items.push(m);
    }
    return groups;
  }, []);

  return (
    <PageTransition>
      <PageHeader title="Settings" subtitle="Outreach templates & niches" />

      <Segmented
        value={section}
        onChange={(v) => setSection(v as "templates" | "niches")}
        options={[
          { value: "templates", label: "Outreach templates" },
          { value: "niches", label: "Niches", count: niches.length },
        ]}
        className="mb-4"
      />

      {section === "templates" && (
        <>
          <div className="mb-3 flex gap-2">
            <Button onClick={saveTemplates} disabled={!dirty} size="md">
              <Save className="h-4 w-4" />
              Save changes
            </Button>
            <Button variant="secondary" size="md" onClick={resetTemplates}>
              <RotateCcw className="h-4 w-4" />
              Reset to defaults
            </Button>
          </div>
          <div className="space-y-4">
            {grouped.map((g) => (
              <Card key={g.title}>
                <CardHeader title={g.title} subtitle={`${g.items.length} templates`} />
                <CardBody className="space-y-4">
                  {g.items.map((m) => (
                    <Field key={m.key} label={m.label}>
                      <Textarea
                        rows={3}
                        value={draft[m.key] ?? ""}
                        onChange={(e) => {
                          setDraft((d) => ({ ...d, [m.key]: e.target.value }));
                          setDirty(true);
                        }}
                      />
                    </Field>
                  ))}
                </CardBody>
              </Card>
            ))}
          </div>
        </>
      )}

      {section === "niches" && (
        <>
          <Card className="mb-3">
            <CardBody className="flex flex-col gap-2 sm:flex-row">
              <Input
                value={nicheForm.name}
                onChange={(e) => setNicheForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="New niche name"
                className="flex-1"
              />
              <Input
                type="number"
                inputMode="numeric"
                value={nicheForm.target}
                onChange={(e) => setNicheForm((f) => ({ ...f, target: e.target.value }))}
                placeholder="Target/day"
                className="sm:w-32"
              />
              <Button onClick={() => void addNiche()} size="md">
                <Plus className="h-4 w-4" />
                Add
              </Button>
            </CardBody>
          </Card>
          {niches.length === 0 ? (
            <EmptyState
              icon={<Tags className="h-7 w-7" />}
              title="No niches yet"
              body="Add the industries you target for outreach."
            />
          ) : (
            <div className="space-y-2">
              {niches.map((n) => (
                <div
                  key={n.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface p-3"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-ink capitalize">
                      {n.name}
                    </div>
                    <div className="text-xs text-ink-faint">
                      Target {n.target_per_day ?? 10}/day
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => void toggleNiche(n)} className="active:scale-95">
                      <Badge tone={n.status === "active" ? "success" : "neutral"}>
                        {n.status ?? "active"}
                      </Badge>
                    </button>
                    <button
                      onClick={() => void delNiche(n.id)}
                      className="text-ink-faint active:scale-90"
                      aria-label="Delete niche"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </PageTransition>
  );
}
