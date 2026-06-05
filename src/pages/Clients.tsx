import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { formatZAPhone } from "@/lib/phone";
import {
  Mail,
  Phone,
  RefreshCcw,
  BriefcaseBusiness,
  Plus,
  ExternalLink,
  Save,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/components/toast/ToastProvider";
import {
  Button,
  Card,
  CardBody,
  Badge,
  Sheet,
  Modal,
  Field,
  Input,
  Textarea,
  Select,
  EmptyState,
  PageHeader,
  PageTransition,
  Skeleton,
  Stat,
} from "@/ui";
import {
  zar0,
  effectiveInvoiceStatus,
  INVOICE_STATUS_TONE,
  type Client,
  type Invoice,
  type Retainer,
} from "@/lib/finance";
import { PROJECT_STATUS_META, type Project } from "@/lib/projects";
import ProjectForm from "@/components/projects/ProjectForm";

type LinkedLead = { id: string; business_name: string; stage: string | null };

export default function Clients() {
  const { pushToast } = useToast();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [clients, setClients] = useState<Client[]>([]);
  const [detail, setDetail] = useState<Client | null>(null);
  const [detailInvoices, setDetailInvoices] = useState<Invoice[]>([]);
  const [detailRetainers, setDetailRetainers] = useState<Retainer[]>([]);
  const [detailProjects, setDetailProjects] = useState<Project[]>([]);
  const [projectFormOpen, setProjectFormOpen] = useState(false);
  const [linkedLead, setLinkedLead] = useState<LinkedLead | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState({
    business_name: "",
    contact_name: "",
    email: "",
    phone: "",
    niche: "",
  });
  const [edit, setEdit] = useState<Partial<Client> | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await supabase
        .from("clients")
        .select("*")
        .order("business_name", { ascending: true });
      if (res.error) throw res.error;
      setClients((res.data ?? []) as Client[]);
    } catch (e) {
      pushToast({ type: "error", title: "Clients", message: e instanceof Error ? e.message : "Failed to load" });
    } finally {
      setLoading(false);
    }
  }, [pushToast]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const channel = supabase
      .channel("clients-page")
      .on("postgres_changes", { event: "*", schema: "public", table: "clients" }, () => void load())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [load]);

  // Deep-link: /clients?client=<id> opens that client (used by project ↔ client cross-links).
  useEffect(() => {
    const cid = searchParams.get("client");
    if (!cid || detail) return;
    const c = clients.find((x) => x.id === cid);
    if (c) void openDetail(c);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, clients]);

  function closeDetail() {
    setDetail(null);
    if (searchParams.get("client")) {
      searchParams.delete("client");
      setSearchParams(searchParams, { replace: true });
    }
  }

  async function openDetail(c: Client) {
    setDetail(c);
    setEdit(null);
    setLinkedLead(null);
    setDetailInvoices([]);
    setDetailRetainers([]);
    setDetailProjects([]);
    const [inv, ret, prj, lead] = await Promise.all([
      supabase.from("invoices").select("*").eq("client_id", c.id).order("created_at", { ascending: false }),
      supabase.from("retainers").select("*").eq("client_id", c.id).order("created_at", { ascending: false }),
      supabase.from("projects").select("*").eq("client_id", c.id).order("created_at", { ascending: false }),
      c.lead_id
        ? supabase.from("leads").select("id, business_name, stage").eq("id", c.lead_id).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);
    setDetailInvoices((inv.data ?? []) as Invoice[]);
    setDetailRetainers((ret.data ?? []) as Retainer[]);
    setDetailProjects((prj.data ?? []) as Project[]);
    if (lead && "data" in lead && lead.data) setLinkedLead(lead.data as LinkedLead);
  }

  async function addClient() {
    const name = addForm.business_name.trim();
    if (!name) return pushToast({ type: "error", title: "Client", message: "Business name required" });
    const r = await supabase.from("clients").insert({
      business_name: name,
      contact_name: addForm.contact_name.trim() || null,
      email: addForm.email.trim() || null,
      phone: addForm.phone.trim() || null,
      niche: addForm.niche.trim() || null,
      status: "active",
    });
    if (r.error) return pushToast({ type: "error", title: "Client", message: r.error.message });
    pushToast({ type: "success", title: "Added", message: name });
    setAddOpen(false);
    setAddForm({ business_name: "", contact_name: "", email: "", phone: "", niche: "" });
    void load();
  }

  async function saveEdit() {
    if (!detail || !edit) return;
    setSavingEdit(true);
    const r = await supabase.from("clients").update(edit).eq("id", detail.id);
    setSavingEdit(false);
    if (r.error) return pushToast({ type: "error", title: "Client", message: r.error.message });
    pushToast({ type: "success", title: "Saved", message: detail.business_name });
    setDetail({ ...detail, ...edit } as Client);
    setEdit(null);
    void load();
  }

  const linkCls =
    "inline-flex min-h-[40px] items-center gap-2 rounded-xl border border-line bg-surface px-3 text-sm text-ink-muted active:scale-95";

  const active = clients.filter((c) => (c.status ?? "active") === "active");

  // Client lifetime value = total collected across all their invoices.
  const lifetimeValue = useMemo(
    () => detailInvoices.reduce((s, i) => s + Number(i.amount_paid ?? 0), 0),
    [detailInvoices],
  );
  const activeRetainers = useMemo(
    () => detailRetainers.filter((r) => r.status === "active"),
    [detailRetainers],
  );
  const mrr = useMemo(
    () => activeRetainers.filter((r) => r.frequency === "monthly").reduce((s, r) => s + Number(r.tier_amount), 0),
    [activeRetainers],
  );

  return (
    <PageTransition>
      <PageHeader
        title="Clients"
        subtitle={`${active.length} active`}
        action={
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => void load()}>
              <RefreshCcw className="h-4 w-4" />
            </Button>
            <Button size="sm" onClick={() => setAddOpen(true)}>
              <Plus className="h-4 w-4" /> Add
            </Button>
          </div>
        }
      />

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-40 w-full" />
          ))}
        </div>
      ) : clients.length === 0 ? (
        <EmptyState
          icon={<BriefcaseBusiness className="h-8 w-8" />}
          title="No clients yet"
          body="Open a lead and tap “Convert to client”, or add one manually."
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {clients.map((c) => {
            const phone = c.phone ? formatZAPhone(c.phone) : "";
            const wa = phone ? `https://wa.me/${phone}` : null;
            return (
              <Card key={c.id} className="cursor-pointer" onClick={() => void openDetail(c)}>
                <CardBody>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-base font-semibold text-ink">{c.business_name}</div>
                      {c.contact_name && <div className="mt-0.5 truncate text-sm text-ink-faint">{c.contact_name}</div>}
                    </div>
                    {(c.status ?? "active") !== "active" && <Badge>{c.status}</Badge>}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2" onClick={(e) => e.stopPropagation()}>
                    {wa && (
                      <a href={wa} target="_blank" rel="noreferrer" className={linkCls}>
                        <Phone className="h-4 w-4" /> WhatsApp
                      </a>
                    )}
                    {c.email && (
                      <a href={`mailto:${c.email}`} className={linkCls}>
                        <Mail className="h-4 w-4" /> Email
                      </a>
                    )}
                  </div>
                  {c.retainer_amount ? (
                    <div className="mt-3 text-sm text-ink-muted">{zar0(c.retainer_amount)}/mo retainer</div>
                  ) : null}
                </CardBody>
              </Card>
            );
          })}
        </div>
      )}

      {/* Detail */}
      <Sheet open={!!detail} onClose={closeDetail} title={detail?.business_name}>
        {detail && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Badge tone={(detail.status ?? "active") === "active" ? "success" : "neutral"}>{detail.status ?? "active"}</Badge>
              {detail.niche && <Badge tone="brand">{detail.niche}</Badge>}
              {detail.vat_enabled && <Badge tone="accent">VAT</Badge>}
            </div>

            <div className="grid grid-cols-2 gap-2 text-sm">
              <Info label="Contact" value={detail.contact_name ?? "—"} />
              <Info label="Phone" value={detail.phone ?? "—"} />
              <Info label="Email" value={detail.email ?? "—"} />
              <Info label="Address" value={detail.address ?? "—"} />
            </div>

            {/* Linked lead */}
            {linkedLead ? (
              <button
                onClick={() => navigate(`/leads?lead=${linkedLead.id}`)}
                className="flex w-full items-center justify-between rounded-xl border border-line bg-surface p-3 text-left active:scale-[0.99]"
              >
                <div>
                  <div className="text-xs text-ink-faint">Converted from lead</div>
                  <div className="text-sm font-semibold text-ink">{linkedLead.business_name}</div>
                </div>
                <ExternalLink className="h-4 w-4 text-ink-muted" />
              </button>
            ) : (
              <div className="rounded-xl border border-dashed border-line p-3 text-xs text-ink-faint">No linked lead</div>
            )}

            {/* Lifetime value + MRR */}
            <div className="grid grid-cols-3 gap-2">
              <Stat label="Lifetime value" value={zar0(lifetimeValue)} tone="success" />
              <Stat label="Active retainers" value={activeRetainers.length} />
              <Stat label="Retainer MRR" value={zar0(mrr)} tone="brand" />
            </div>

            {/* Projects */}
            <div>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-medium uppercase tracking-wide text-ink-faint">Projects</span>
                <Button size="sm" variant="secondary" onClick={() => setProjectFormOpen(true)}>
                  <Plus className="h-4 w-4" /> New project
                </Button>
              </div>
              <div className="space-y-2">
                {detailProjects.length === 0 && <div className="text-sm text-ink-faint">No projects.</div>}
                {detailProjects.map((p) => {
                  const meta = PROJECT_STATUS_META[p.status];
                  return (
                    <button
                      key={p.id}
                      onClick={() => navigate(`/projects/${p.id}`)}
                      className="flex w-full items-center justify-between rounded-xl border border-line bg-surface p-3 text-left active:scale-[0.99]"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-ink">{p.name}</div>
                        <div className="text-xs text-ink-faint">{p.due_date ? `Due ${p.due_date}` : "No due date"}</div>
                      </div>
                      <Badge tone={meta.tone}>{meta.label}</Badge>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Invoices */}
            <div>
              <div className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-faint">Invoices</div>
              <div className="space-y-2">
                {detailInvoices.length === 0 && <div className="text-sm text-ink-faint">No invoices.</div>}
                {detailInvoices.map((i) => {
                  const st = effectiveInvoiceStatus(i);
                  return (
                    <div key={i.id} className="flex items-center justify-between rounded-xl border border-line bg-surface p-3">
                      <div className="text-sm text-ink">{i.invoice_number ?? "Draft"}</div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm tabular-nums text-ink">{zar0(i.total)}</span>
                        <Badge tone={INVOICE_STATUS_TONE[st]}>{st}</Badge>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Retainers */}
            <div>
              <div className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-faint">Retainers</div>
              <div className="space-y-2">
                {detailRetainers.length === 0 && <div className="text-sm text-ink-faint">No retainers.</div>}
                {detailRetainers.map((r) => (
                  <div key={r.id} className="flex items-center justify-between rounded-xl border border-line bg-surface p-3">
                    <div className="text-sm text-ink">{r.name}</div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm tabular-nums text-ink">{zar0(r.tier_amount)}/mo</span>
                      <Badge tone={r.status === "active" ? "success" : "neutral"}>{r.status}</Badge>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Edit */}
            {edit ? (
              <div className="space-y-3 rounded-xl border border-line bg-base/40 p-3">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Contact name">
                    <Input value={edit.contact_name ?? ""} onChange={(e) => setEdit((f) => ({ ...f, contact_name: e.target.value }))} />
                  </Field>
                  <Field label="Phone">
                    <Input value={edit.phone ?? ""} onChange={(e) => setEdit((f) => ({ ...f, phone: e.target.value }))} />
                  </Field>
                </div>
                <Field label="Email">
                  <Input value={edit.email ?? ""} onChange={(e) => setEdit((f) => ({ ...f, email: e.target.value }))} />
                </Field>
                <Field label="Address">
                  <Input value={edit.address ?? ""} onChange={(e) => setEdit((f) => ({ ...f, address: e.target.value }))} />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Status">
                    <Select value={edit.status ?? "active"} onChange={(e) => setEdit((f) => ({ ...f, status: e.target.value }))}>
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                    </Select>
                  </Field>
                  <Field label="VAT number">
                    <Input value={edit.vat_number ?? ""} onChange={(e) => setEdit((f) => ({ ...f, vat_number: e.target.value }))} />
                  </Field>
                </div>
                <button
                  type="button"
                  onClick={() => setEdit((f) => ({ ...f, vat_enabled: !f?.vat_enabled }))}
                  className="flex w-full items-center justify-between rounded-xl border border-line bg-surface p-3"
                >
                  <span className="text-sm text-ink">VAT-enabled client</span>
                  <span className={`flex h-6 w-11 items-center rounded-full px-0.5 transition ${edit.vat_enabled ? "bg-brand" : "bg-white/10"}`}>
                    <span className={`h-5 w-5 rounded-full bg-white transition ${edit.vat_enabled ? "translate-x-5" : ""}`} />
                  </span>
                </button>
                <Field label="Notes">
                  <Textarea rows={2} value={edit.notes ?? ""} onChange={(e) => setEdit((f) => ({ ...f, notes: e.target.value }))} />
                </Field>
                <div className="flex gap-2">
                  <Button size="md" loading={savingEdit} onClick={() => void saveEdit()}>
                    <Save className="h-4 w-4" /> Save
                  </Button>
                  <Button size="md" variant="ghost" onClick={() => setEdit(null)}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                variant="secondary"
                size="md"
                block
                onClick={() =>
                  setEdit({
                    contact_name: detail.contact_name,
                    phone: detail.phone,
                    email: detail.email,
                    address: detail.address,
                    status: detail.status ?? "active",
                    vat_enabled: detail.vat_enabled ?? false,
                    vat_number: detail.vat_number,
                    notes: detail.notes,
                  })
                }
              >
                Edit details
              </Button>
            )}

            {detail.notes && !edit && (
              <div className="whitespace-pre-wrap rounded-xl border border-line bg-surface p-3 text-sm text-ink-muted">
                {detail.notes}
              </div>
            )}
          </div>
        )}
      </Sheet>

      {/* New project for this client */}
      <ProjectForm
        open={projectFormOpen}
        onClose={() => setProjectFormOpen(false)}
        clients={clients}
        defaultClientId={detail?.id ?? null}
        onSaved={(p) => navigate(`/projects/${p.id}`)}
      />

      {/* Add client */}
      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Add client">
        <div className="space-y-3">
          <Field label="Business name">
            <Input value={addForm.business_name} onChange={(e) => setAddForm((f) => ({ ...f, business_name: e.target.value }))} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Contact name">
              <Input value={addForm.contact_name} onChange={(e) => setAddForm((f) => ({ ...f, contact_name: e.target.value }))} />
            </Field>
            <Field label="Phone">
              <Input value={addForm.phone} onChange={(e) => setAddForm((f) => ({ ...f, phone: e.target.value }))} />
            </Field>
          </div>
          <Field label="Email">
            <Input value={addForm.email} onChange={(e) => setAddForm((f) => ({ ...f, email: e.target.value }))} />
          </Field>
          <Field label="Niche">
            <Input value={addForm.niche} onChange={(e) => setAddForm((f) => ({ ...f, niche: e.target.value }))} />
          </Field>
          <Button block size="lg" onClick={() => void addClient()}>
            Add client
          </Button>
        </div>
      </Modal>
    </PageTransition>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-3">
      <div className="text-xs text-ink-faint">{label}</div>
      <div className="mt-0.5 break-words text-sm font-medium text-ink">{value}</div>
    </div>
  );
}
