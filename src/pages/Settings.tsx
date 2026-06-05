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

import type { CompanySettings } from "@/lib/finance";

export default function Settings() {
  const { pushToast } = useToast();
  const [section, setSection] = useState<"templates" | "niches" | "business">("templates");

  // ---- Business / invoicing profile (company_settings) ----
  const [company, setCompany] = useState<CompanySettings | null>(null);
  const [companyDirty, setCompanyDirty] = useState(false);
  const [savingCompany, setSavingCompany] = useState(false);

  const loadCompany = useCallback(async () => {
    const r = await supabase.from("company_settings").select("*").limit(1).maybeSingle();
    if (!r.error && r.data) setCompany(r.data as CompanySettings);
  }, []);

  useEffect(() => {
    void loadCompany();
  }, [loadCompany]);

  function setCompanyField<K extends keyof CompanySettings>(key: K, value: CompanySettings[K]) {
    setCompany((c) => (c ? { ...c, [key]: value } : c));
    setCompanyDirty(true);
  }

  async function saveCompany() {
    if (!company) return;
    setSavingCompany(true);
    const { id, ...patch } = company;
    const r = await supabase
      .from("company_settings")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", id);
    setSavingCompany(false);
    if (r.error) return pushToast({ type: "error", title: "Business", message: r.error.message });
    setCompanyDirty(false);
    pushToast({ type: "success", title: "Saved", message: "Business details updated" });
  }

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
        onChange={(v) => setSection(v as "templates" | "niches" | "business")}
        options={[
          { value: "templates", label: "Outreach templates" },
          { value: "niches", label: "Niches", count: niches.length },
          { value: "business", label: "Business" },
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

      {section === "business" && (
        <>
          <div className="mb-3 flex gap-2">
            <Button onClick={() => void saveCompany()} disabled={!companyDirty} loading={savingCompany} size="md">
              <Save className="h-4 w-4" />
              Save changes
            </Button>
          </div>
          {!company ? (
            <Card>
              <CardBody className="text-sm text-ink-faint">Loading business profile…</CardBody>
            </Card>
          ) : (
            <div className="space-y-4">
              <Card>
                <CardHeader title="Identity" subtitle="Shown on every invoice" />
                <CardBody className="space-y-3">
                  <Field label="Trading name">
                    <Input value={company.trading_name ?? ""} onChange={(e) => setCompanyField("trading_name", e.target.value)} />
                  </Field>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <Field label="Contact email">
                      <Input value={company.contact_email ?? ""} onChange={(e) => setCompanyField("contact_email", e.target.value)} />
                    </Field>
                    <Field label="Contact phone">
                      <Input value={company.contact_phone ?? ""} onChange={(e) => setCompanyField("contact_phone", e.target.value)} />
                    </Field>
                  </div>
                  <Field label="Business address">
                    <Textarea rows={2} value={company.address ?? ""} onChange={(e) => setCompanyField("address", e.target.value)} />
                  </Field>
                </CardBody>
              </Card>

              <Card>
                <CardHeader title="Banking details" subtitle="Pulled onto the printed invoice" />
                <CardBody className="space-y-3">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <Field label="Account name">
                      <Input value={company.bank_account_name ?? ""} onChange={(e) => setCompanyField("bank_account_name", e.target.value)} />
                    </Field>
                    <Field label="Bank">
                      <Input value={company.bank_name ?? ""} onChange={(e) => setCompanyField("bank_name", e.target.value)} />
                    </Field>
                    <Field label="Account number">
                      <Input value={company.bank_account_number ?? ""} onChange={(e) => setCompanyField("bank_account_number", e.target.value)} />
                    </Field>
                    <Field label="Branch code">
                      <Input value={company.bank_branch_code ?? ""} onChange={(e) => setCompanyField("bank_branch_code", e.target.value)} />
                    </Field>
                    <Field label="Account type">
                      <Input value={company.bank_account_type ?? ""} onChange={(e) => setCompanyField("bank_account_type", e.target.value)} />
                    </Field>
                  </div>
                </CardBody>
              </Card>

              <Card>
                <CardHeader title="Terms & VAT" subtitle="VAT stays off until you register" />
                <CardBody className="space-y-3">
                  <Field label="Payment terms (short — shown in the invoice header)">
                    <Input value={company.payment_terms ?? ""} onChange={(e) => setCompanyField("payment_terms", e.target.value)} placeholder="Due on Receipt" />
                  </Field>
                  <Field label="Invoice footer / fine print">
                    <Textarea rows={3} value={company.invoice_footer_terms ?? ""} onChange={(e) => setCompanyField("invoice_footer_terms", e.target.value)} />
                  </Field>
                  <button
                    type="button"
                    onClick={() => setCompanyField("vat_registered", !company.vat_registered)}
                    className="flex w-full items-center justify-between rounded-xl border border-line bg-surface p-3"
                  >
                    <span className="text-left text-sm text-ink">
                      VAT registered
                      <span className="mt-0.5 block text-xs text-ink-faint">
                        Off → invoices say “INVOICE”, no VAT. On → “TAX INVOICE” + 15%.
                      </span>
                    </span>
                    <span className={`flex h-6 w-11 shrink-0 items-center rounded-full px-0.5 transition ${company.vat_registered ? "bg-brand" : "bg-white/10"}`}>
                      <span className={`h-5 w-5 rounded-full bg-white transition ${company.vat_registered ? "translate-x-5" : ""}`} />
                    </span>
                  </button>
                  {company.vat_registered && (
                    <Field label="VAT number">
                      <Input value={company.vat_number ?? ""} onChange={(e) => setCompanyField("vat_number", e.target.value)} />
                    </Field>
                  )}
                </CardBody>
              </Card>
            </div>
          )}
        </>
      )}
    </PageTransition>
  );
}
