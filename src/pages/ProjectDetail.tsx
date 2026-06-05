import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Dispatch, SetStateAction, ReactNode } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft, Pencil, Plus, Trash2, FileUp, ExternalLink, FileText, ReceiptText, Link2,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/components/toast/ToastProvider";
import {
  Button, Badge, Field, Input, Select, Stat, PageTransition, Skeleton, EmptyState,
} from "@/ui";
import {
  zar, zar0, effectiveInvoiceStatus, INVOICE_STATUS_TONE,
  type Client, type Invoice, type FinanceQuote,
} from "@/lib/finance";
import {
  PROJECT_STATUSES, PROJECT_STATUS_META, MILESTONE_STATUS_META, TASK_STATUS_META, DELIVERABLE_STATUS_META,
  type Project, type Milestone, type ProjectTask, type Deliverable,
  type ProjectStatus, type MilestoneStatus, type ProjectTaskStatus, type DeliverableStatus,
} from "@/lib/projects";
import ProjectForm from "@/components/projects/ProjectForm";

type Expense = { id: string; amount: number; category: string | null; vendor: string | null; incurred_on: string; note: string | null };

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { pushToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [project, setProject] = useState<Project | null>(null);
  const [client, setClient] = useState<Client | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [tasks, setTasks] = useState<ProjectTask[]>([]);
  const [deliverables, setDeliverables] = useState<Deliverable[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [quotes, setQuotes] = useState<FinanceQuote[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [editOpen, setEditOpen] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const proj = await supabase.from("projects").select("*").eq("id", id).maybeSingle();
      if (proj.error) throw proj.error;
      const p = (proj.data ?? null) as Project | null;
      setProject(p);
      if (!p) return;
      const [cl, cls, ms, tk, dv, inv, qt, ex] = await Promise.all([
        supabase.from("clients").select("*").eq("id", p.client_id).maybeSingle(),
        supabase.from("clients").select("*").order("business_name"),
        supabase.from("milestones").select("*").eq("project_id", id).order("sort_order"),
        supabase.from("project_tasks").select("*").eq("project_id", id).order("sort_order"),
        supabase.from("deliverables").select("*").eq("project_id", id).order("created_at"),
        supabase.from("invoices").select("*").eq("project_id", id).order("created_at", { ascending: false }),
        supabase.from("finance_quotes").select("*").eq("project_id", id).order("created_at", { ascending: false }),
        supabase.from("expenses").select("id,amount,category,vendor,incurred_on,note").eq("project_id", id),
      ]);
      setClient((cl.data ?? null) as Client | null);
      setClients((cls.data ?? []) as Client[]);
      setMilestones((ms.data ?? []) as Milestone[]);
      setTasks((tk.data ?? []) as ProjectTask[]);
      setDeliverables((dv.data ?? []) as Deliverable[]);
      setInvoices((inv.data ?? []) as Invoice[]);
      setQuotes((qt.data ?? []) as FinanceQuote[]);
      setExpenses((ex.data ?? []) as Expense[]);
    } catch (e) {
      pushToast({ type: "error", title: "Project", message: e instanceof Error ? e.message : "Failed" });
    } finally {
      setLoading(false);
    }
  }, [id, pushToast]);

  useEffect(() => { void load(); }, [load]);

  // ---- Per-project P&L ----
  const pnl = useMemo(() => {
    const billed = invoices.reduce((s, i) => s + Number(i.total), 0);
    const collected = invoices.reduce((s, i) => s + Number(i.amount_paid ?? 0), 0);
    const costs = expenses.reduce((s, e) => s + Number(e.amount), 0);
    return { billed, collected, costs, margin: collected - costs };
  }, [invoices, expenses]);

  async function setStatus(status: ProjectStatus) {
    if (!project) return;
    setProject({ ...project, status });
    const r = await supabase.from("projects").update({ status }).eq("id", project.id);
    if (r.error) pushToast({ type: "error", title: "Project", message: r.error.message });
  }

  // ---- Create invoice from a milestone ----
  async function invoiceMilestone(m: Milestone) {
    if (!project || !m.amount) return;
    try {
      const ins = await supabase.from("invoices").insert({
        client_id: project.client_id,
        project_id: project.id,
        status: "draft",
        vat_enabled: false,
        subtotal: m.amount,
        vat_amount: 0,
        total: m.amount,
        amount: m.amount, // legacy column
        notes: `Milestone: ${m.title}`,
      }).select("id").single();
      if (ins.error) throw ins.error;
      const invoiceId = (ins.data as { id: string }).id;
      const li = await supabase.from("invoice_line_items").insert({
        invoice_id: invoiceId,
        description: `${project.name} — ${m.title}`,
        qty: 1,
        unit_price: m.amount,
        line_total: m.amount,
        sort_order: 0,
      });
      if (li.error) throw li.error;
      await supabase.from("milestones").update({ invoiced: true }).eq("id", m.id);
      pushToast({ type: "success", title: "Invoice drafted", message: zar(m.amount) });
      void load();
    } catch (e) {
      pushToast({ type: "error", title: "Invoice", message: e instanceof Error ? e.message : "Failed" });
    }
  }

  if (loading && !project) {
    return (
      <PageTransition>
        <Skeleton className="mb-3 h-8 w-48" />
        <Skeleton className="h-48 w-full" />
      </PageTransition>
    );
  }
  if (!project) {
    return (
      <PageTransition>
        <EmptyState title="Project not found" body="It may have been deleted." action={
          <Button onClick={() => navigate("/projects")}>Back to projects</Button>
        } />
      </PageTransition>
    );
  }

  const meta = PROJECT_STATUS_META[project.status];

  return (
    <PageTransition>
      <button onClick={() => navigate("/projects")} className="mb-3 inline-flex items-center gap-1.5 text-sm text-ink-muted active:scale-95">
        <ArrowLeft className="h-4 w-4" /> Projects
      </button>

      {/* Header */}
      <div className="rounded-2xl border border-line bg-surface p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-bold tracking-tight text-ink">{project.name}</h1>
            <button
              onClick={() => navigate(`/clients?client=${project.client_id}`)}
              className="mt-1 inline-flex items-center gap-1 text-sm text-ink-muted hover:text-ink"
            >
              {client?.business_name ?? "—"} <ExternalLink className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => setEditOpen(true)}>
              <Pencil className="h-4 w-4" /> Edit
            </Button>
          </div>
        </div>

        {project.description && <p className="mt-3 whitespace-pre-line text-sm text-ink-muted">{project.description}</p>}

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Badge tone={meta.tone}>{meta.label}</Badge>
          <Select
            value={project.status}
            onChange={(e) => void setStatus(e.target.value as ProjectStatus)}
            className="h-8 w-auto py-1 text-xs"
          >
            {PROJECT_STATUSES.map((s) => (
              <option key={s} value={s}>{PROJECT_STATUS_META[s].label}</option>
            ))}
          </Select>
          {project.lead_id && (
            <button onClick={() => navigate(`/leads?lead=${project.lead_id}`)} className="inline-flex items-center gap-1 rounded-full border border-line bg-surface px-2.5 py-1 text-xs text-ink-muted active:scale-95">
              <Link2 className="h-3.5 w-3.5" /> Linked lead
            </button>
          )}
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
          <HeaderInfo label="Start" value={project.start_date ?? "—"} />
          <HeaderInfo label="Due" value={project.due_date ?? "—"} />
          <HeaderInfo label="Budget" value={project.budget ? zar0(project.budget) : "—"} />
        </div>
      </div>

      {/* P&L */}
      <div className="mt-4">
        <SectionLabel>Profit &amp; loss</SectionLabel>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Billed" value={zar0(pnl.billed)} hint="sum of linked invoices" />
          <Stat label="Collected" value={zar0(pnl.collected)} tone="success" hint="payments received" />
          <Stat label="Costs" value={zar0(pnl.costs)} tone="warn" hint="expenses on project" />
          <Stat label="Margin" value={zar0(pnl.margin)} tone={pnl.margin >= 0 ? "brand" : "danger"} hint="collected − costs" />
        </div>
      </div>

      {/* Milestones */}
      <div className="mt-5">
        <SectionLabel>Milestones</SectionLabel>
        <div className="space-y-2">
          {milestones.map((m) => (
            <MilestoneRow
              key={m.id}
              m={m}
              onUpdate={(patch) => void updateMilestone(m.id, patch, setMilestones)}
              onDelete={() => void deleteRow("milestones", m.id, () => setMilestones((x) => x.filter((y) => y.id !== m.id)))}
              onInvoice={() => void invoiceMilestone(m)}
            />
          ))}
          {milestones.length === 0 && <Muted>No milestones yet.</Muted>}
          <AddMilestone projectId={project.id} nextOrder={milestones.length} onAdded={(row) => setMilestones((x) => [...x, row])} />
        </div>
      </div>

      {/* Tasks */}
      <div className="mt-5">
        <SectionLabel>Tasks</SectionLabel>
        <div className="space-y-2">
          {tasks.map((t) => (
            <TaskRow
              key={t.id}
              t={t}
              onCycle={() => void cycleTask(t, setTasks)}
              onDelete={() => void deleteRow("project_tasks", t.id, () => setTasks((x) => x.filter((y) => y.id !== t.id)))}
            />
          ))}
          {tasks.length === 0 && <Muted>No tasks yet.</Muted>}
          <AddTask projectId={project.id} nextOrder={tasks.length} onAdded={(row) => setTasks((x) => [...x, row])} />
        </div>
      </div>

      {/* Deliverables */}
      <div className="mt-5">
        <SectionLabel>Deliverables</SectionLabel>
        <div className="space-y-2">
          {deliverables.map((d) => (
            <DeliverableRow
              key={d.id}
              d={d}
              onUpdate={(patch) => void updateDeliverable(d.id, patch, setDeliverables)}
              onDelete={() => void deleteRow("deliverables", d.id, () => setDeliverables((x) => x.filter((y) => y.id !== d.id)))}
            />
          ))}
          {deliverables.length === 0 && <Muted>No deliverables yet.</Muted>}
          <AddDeliverable projectId={project.id} onAdded={(row) => setDeliverables((x) => [...x, row])} />
        </div>
      </div>

      {/* Linked quotes + invoices */}
      <div className="mt-5 grid gap-5 md:grid-cols-2">
        <div>
          <SectionLabel>Quotes</SectionLabel>
          <div className="space-y-2">
            {quotes.map((q) => (
              <div key={q.id} className="flex items-center justify-between rounded-xl border border-line bg-surface p-3">
                <div className="flex items-center gap-2 text-sm text-ink">
                  <FileText className="h-4 w-4 text-ink-faint" /> {q.quote_number ?? "Draft"}
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm tabular-nums text-ink">{zar0(q.total)}</span>
                  <Badge tone={q.status === "accepted" ? "success" : q.status === "declined" ? "danger" : q.status === "sent" ? "brand" : "neutral"}>{q.status}</Badge>
                </div>
              </div>
            ))}
            {quotes.length === 0 && <Muted>No quotes linked.</Muted>}
          </div>
        </div>
        <div>
          <SectionLabel>Invoices</SectionLabel>
          <div className="space-y-2">
            {invoices.map((i) => {
              const st = effectiveInvoiceStatus(i);
              return (
                <button
                  key={i.id}
                  onClick={() => window.open(`/invoice/${i.id}/print`, "_blank")}
                  className="flex w-full items-center justify-between rounded-xl border border-line bg-surface p-3 text-left active:scale-[0.99]"
                >
                  <div className="flex items-center gap-2 text-sm text-ink">
                    <ReceiptText className="h-4 w-4 text-ink-faint" /> {i.invoice_number ?? "Draft"}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm tabular-nums text-ink">{zar0(i.total)}</span>
                    <Badge tone={INVOICE_STATUS_TONE[st]}>{st}</Badge>
                  </div>
                </button>
              );
            })}
            {invoices.length === 0 && <Muted>No invoices linked. Invoice a milestone above, or attach one from Finance.</Muted>}
          </div>
        </div>
      </div>

      <ProjectForm
        open={editOpen}
        onClose={() => setEditOpen(false)}
        clients={clients}
        editing={project}
        onSaved={(p) => setProject(p)}
      />
    </PageTransition>
  );
}

// ---- helpers (module-level so rows stay lean) ----
async function updateMilestone(id: string, patch: Partial<Milestone>, set: Dispatch<SetStateAction<Milestone[]>>) {
  set((x) => x.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  await supabase.from("milestones").update(patch).eq("id", id);
}
async function updateDeliverable(id: string, patch: Partial<Deliverable>, set: Dispatch<SetStateAction<Deliverable[]>>) {
  set((x) => x.map((d) => (d.id === id ? { ...d, ...patch } : d)));
  await supabase.from("deliverables").update(patch).eq("id", id);
}
async function cycleTask(t: ProjectTask, set: Dispatch<SetStateAction<ProjectTask[]>>) {
  const next: ProjectTaskStatus = t.status === "todo" ? "doing" : t.status === "doing" ? "done" : "todo";
  set((x) => x.map((y) => (y.id === t.id ? { ...y, status: next } : y)));
  await supabase.from("project_tasks").update({ status: next }).eq("id", t.id);
}
async function deleteRow(table: string, id: string, optimistic: () => void) {
  optimistic();
  await supabase.from(table).delete().eq("id", id);
}

function SectionLabel({ children }: { children: ReactNode }) {
  return <div className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-faint">{children}</div>;
}
function Muted({ children }: { children: ReactNode }) {
  return <div className="text-sm text-ink-faint">{children}</div>;
}
function HeaderInfo({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line bg-base/40 p-2.5">
      <div className="text-[11px] text-ink-faint">{label}</div>
      <div className="mt-0.5 text-sm font-medium text-ink">{value}</div>
    </div>
  );
}

function MilestoneRow({ m, onUpdate, onDelete, onInvoice }: {
  m: Milestone; onUpdate: (p: Partial<Milestone>) => void; onDelete: () => void; onInvoice: () => void;
}) {
  const meta = MILESTONE_STATUS_META[m.status];
  return (
    <div className="rounded-xl border border-line bg-surface p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-ink">{m.title}</div>
          <div className="mt-0.5 text-xs text-ink-faint">
            {m.due_date ? `Due ${m.due_date}` : "No due date"}
            {m.amount ? ` · ${zar(m.amount)}` : ""}
          </div>
        </div>
        <button onClick={onDelete} className="shrink-0 text-ink-faint active:scale-90" aria-label="Delete milestone">
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Select
          value={m.status}
          onChange={(e) => onUpdate({ status: e.target.value as MilestoneStatus })}
          className="h-8 w-auto py-1 text-xs"
        >
          {(Object.keys(MILESTONE_STATUS_META) as MilestoneStatus[]).map((s) => (
            <option key={s} value={s}>{MILESTONE_STATUS_META[s].label}</option>
          ))}
        </Select>
        <Badge tone={meta.tone}>{meta.label}</Badge>
        {m.invoiced ? (
          <Badge tone="success">Invoiced</Badge>
        ) : m.amount ? (
          <Button size="sm" variant="subtle" onClick={onInvoice}>
            <ReceiptText className="h-3.5 w-3.5" /> Create invoice
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function TaskRow({ t, onCycle, onDelete }: { t: ProjectTask; onCycle: () => void; onDelete: () => void }) {
  const meta = TASK_STATUS_META[t.status];
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface p-3">
      <button onClick={onCycle} className="flex min-w-0 items-center gap-2 text-left active:scale-[0.99]">
        <Badge tone={meta.tone}>{meta.label}</Badge>
        <span className={`truncate text-sm ${t.status === "done" ? "text-ink-faint line-through" : "text-ink"}`}>{t.title}</span>
      </button>
      <div className="flex items-center gap-2">
        {t.due_date && <span className="text-xs text-ink-faint">{t.due_date}</span>}
        <button onClick={onDelete} className="text-ink-faint active:scale-90" aria-label="Delete task">
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function DeliverableRow({ d, onUpdate, onDelete }: {
  d: Deliverable; onUpdate: (p: Partial<Deliverable>) => void; onDelete: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const { pushToast } = useToast();
  const [uploading, setUploading] = useState(false);

  async function upload(file: File) {
    setUploading(true);
    try {
      const path = `${d.project_id}/${crypto.randomUUID()}-${file.name}`;
      const up = await supabase.storage.from("deliverables").upload(path, file);
      if (up.error) throw up.error;
      const { data } = supabase.storage.from("deliverables").getPublicUrl(path);
      onUpdate({ file_url: data.publicUrl, status: "delivered", delivered_at: new Date().toISOString() });
      pushToast({ type: "success", title: "Uploaded", message: file.name });
    } catch (e) {
      pushToast({ type: "error", title: "Upload", message: e instanceof Error ? e.message : "Failed" });
    } finally {
      setUploading(false);
    }
  }

  const meta = DELIVERABLE_STATUS_META[d.status];
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface p-3">
      <div className="min-w-0">
        <div className="truncate text-sm text-ink">{d.title}</div>
        {d.file_url ? (
          <a href={d.file_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-brand">
            <ExternalLink className="h-3 w-3" /> View file
          </a>
        ) : (
          <div className="text-xs text-ink-faint">No file</div>
        )}
      </div>
      <div className="flex items-center gap-2">
        <Select
          value={d.status}
          onChange={(e) => onUpdate({ status: e.target.value as DeliverableStatus })}
          className="h-8 w-auto py-1 text-xs"
        >
          {(Object.keys(DELIVERABLE_STATUS_META) as DeliverableStatus[]).map((s) => (
            <option key={s} value={s}>{DELIVERABLE_STATUS_META[s].label}</option>
          ))}
        </Select>
        <Badge tone={meta.tone}>{meta.label}</Badge>
        <input
          ref={fileRef}
          type="file"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); }}
        />
        <button onClick={() => fileRef.current?.click()} disabled={uploading} className="text-ink-faint active:scale-90 disabled:opacity-50" aria-label="Upload file">
          <FileUp className="h-4 w-4" />
        </button>
        <button onClick={onDelete} className="text-ink-faint active:scale-90" aria-label="Delete deliverable">
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function AddMilestone({ projectId, nextOrder, onAdded }: { projectId: string; nextOrder: number; onAdded: (m: Milestone) => void }) {
  const { pushToast } = useToast();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [saving, setSaving] = useState(false);

  async function add() {
    if (!title.trim()) return;
    setSaving(true);
    const ins = await supabase.from("milestones").insert({
      project_id: projectId,
      title: title.trim(),
      amount: amount.trim() ? Number(amount) : null,
      due_date: dueDate || null,
      sort_order: nextOrder,
    }).select("*").single();
    setSaving(false);
    if (ins.error) return pushToast({ type: "error", title: "Milestone", message: ins.error.message });
    onAdded(ins.data as Milestone);
    setTitle(""); setAmount(""); setDueDate(""); setOpen(false);
  }

  if (!open) {
    return (
      <Button variant="secondary" size="md" block onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" /> Add milestone
      </Button>
    );
  }
  return (
    <div className="space-y-3 rounded-xl border border-line bg-base/40 p-3">
      <Field label="Title">
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. 50% deposit" autoFocus />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Amount (R, optional)">
          <Input type="number" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Field label="Due date">
          <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-base text-ink outline-none focus:border-brand" />
        </Field>
      </div>
      <div className="flex gap-2">
        <Button size="md" loading={saving} onClick={() => void add()}>Add</Button>
        <Button size="md" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
      </div>
    </div>
  );
}

function AddTask({ projectId, nextOrder, onAdded }: { projectId: string; nextOrder: number; onAdded: (t: ProjectTask) => void }) {
  const { pushToast } = useToast();
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);

  async function add() {
    if (!title.trim()) return;
    setSaving(true);
    const ins = await supabase.from("project_tasks").insert({
      project_id: projectId, title: title.trim(), sort_order: nextOrder,
    }).select("*").single();
    setSaving(false);
    if (ins.error) return pushToast({ type: "error", title: "Task", message: ins.error.message });
    onAdded(ins.data as ProjectTask);
    setTitle("");
  }

  return (
    <div className="flex gap-2">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") void add(); }}
        placeholder="Add a task…"
        className="min-w-0 flex-1 rounded-xl border border-line bg-surface px-3 py-2.5 text-base text-ink placeholder:text-ink-faint outline-none focus:border-brand"
      />
      <Button size="md" loading={saving} onClick={() => void add()}>
        <Plus className="h-4 w-4" />
      </Button>
    </div>
  );
}

function AddDeliverable({ projectId, onAdded }: { projectId: string; onAdded: (d: Deliverable) => void }) {
  const { pushToast } = useToast();
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);

  async function add() {
    if (!title.trim()) return;
    setSaving(true);
    const ins = await supabase.from("deliverables").insert({
      project_id: projectId, title: title.trim(),
    }).select("*").single();
    setSaving(false);
    if (ins.error) return pushToast({ type: "error", title: "Deliverable", message: ins.error.message });
    onAdded(ins.data as Deliverable);
    setTitle("");
  }

  return (
    <div className="flex gap-2">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") void add(); }}
        placeholder="Add a deliverable…"
        className="min-w-0 flex-1 rounded-xl border border-line bg-surface px-3 py-2.5 text-base text-ink placeholder:text-ink-faint outline-none focus:border-brand"
      />
      <Button size="md" loading={saving} onClick={() => void add()}>
        <Plus className="h-4 w-4" />
      </Button>
    </div>
  );
}
