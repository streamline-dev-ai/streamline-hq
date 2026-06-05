import { useCallback, useEffect, useMemo, useState } from "react";
import {
  RefreshCcw,
  Plus,
  Trash2,
  Wallet,
  FileText,
  ArrowRight,
  Send,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/components/toast/ToastProvider";
import { getSaDateString } from "@/utils/saDate";
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Badge,
  Stat,
  Modal,
  Sheet,
  Field,
  Input,
  Select,
  EmptyState,
  PageHeader,
  PageTransition,
  Segmented,
  Skeleton,
} from "@/ui";
import {
  zar,
  zar0,
  effectiveInvoiceStatus,
  invoiceBalance,
  nextDocumentNumber,
  INVOICE_STATUS_TONE,
  type Client,
  type Invoice,
  type FinanceQuote,
  type Retainer,
  type Expense,
  type Payment,
  type LineItem,
} from "@/lib/finance";
import type { Project } from "@/lib/projects";
import InvoiceForm from "@/components/finance/InvoiceForm";
import QuoteForm from "@/components/finance/QuoteForm";
import RetainerForm from "@/components/finance/RetainerForm";
import InvoiceDetail from "@/components/finance/InvoiceDetail";

type Tab = "overview" | "invoices" | "quotes" | "retainers" | "expenses";

export default function Finance() {
  const { pushToast } = useToast();
  const saMonth = useMemo(() => getSaDateString().slice(0, 7), []);
  const [tab, setTab] = useState<Tab>("overview");
  const [loading, setLoading] = useState(true);

  const [clients, setClients] = useState<Client[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [quotes, setQuotes] = useState<FinanceQuote[]>([]);
  const [retainers, setRetainers] = useState<Retainer[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);

  // modals / panels
  const [invoiceForm, setInvoiceForm] = useState<{ editing: { invoice: Invoice; items: LineItem[] } | null } | null>(null);
  const [quoteFormOpen, setQuoteFormOpen] = useState(false);
  const [retainerFormOpen, setRetainerFormOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [selectedQuote, setSelectedQuote] = useState<FinanceQuote | null>(null);
  const [quoteItems, setQuoteItems] = useState<LineItem[]>([]);
  const [expenseModal, setExpenseModal] = useState(false);
  const [expenseForm, setExpenseForm] = useState({
    category: "",
    vendor: "",
    amount: "",
    incurred_on: getSaDateString(),
    note: "",
    recurring: false,
    frequency: "once" as Expense["frequency"],
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [cl, inv, qt, ret, exp, pay, prj] = await Promise.all([
        supabase.from("clients").select("*").order("business_name"),
        supabase.from("invoices").select("*").order("created_at", { ascending: false }),
        supabase.from("finance_quotes").select("*").order("created_at", { ascending: false }),
        supabase.from("retainers").select("*").order("created_at", { ascending: false }),
        supabase.from("expenses").select("*").order("incurred_on", { ascending: false }),
        supabase.from("payments").select("*").order("paid_at", { ascending: false }),
        supabase.from("projects").select("*").order("created_at", { ascending: false }),
      ]);
      if (cl.error) throw cl.error;
      setClients((cl.data ?? []) as Client[]);
      setInvoices((inv.data ?? []) as Invoice[]);
      setQuotes((qt.data ?? []) as FinanceQuote[]);
      setRetainers((ret.data ?? []) as Retainer[]);
      setExpenses((exp.data ?? []) as Expense[]);
      setPayments((pay.data ?? []) as Payment[]);
      setProjects((prj.data ?? []) as Project[]);
    } catch (e) {
      pushToast({ type: "error", title: "Finance", message: e instanceof Error ? e.message : "Failed to load" });
    } finally {
      setLoading(false);
    }
  }, [pushToast, saMonth]);

  useEffect(() => {
    void load();
  }, [load]);

  const clientName = useCallback(
    (id: string | null) => clients.find((c) => c.id === id)?.business_name ?? "—",
    [clients],
  );

  const summary = useMemo(() => {
    let outstanding = 0;
    let overdue = 0;
    // Cash actually received this month (counts partial/deposit payments too).
    const paidThisMonth = payments
      .filter((p) => (p.paid_at ?? "").slice(0, 7) === saMonth)
      .reduce((s, p) => s + Number(p.amount), 0);
    for (const i of invoices) {
      const st = effectiveInvoiceStatus(i);
      if (st === "paid" || st === "draft" || st === "void") continue;
      const bal = invoiceBalance(i);
      outstanding += bal;
      if (st === "overdue") overdue += bal;
    }
    const recurringIn = retainers
      .filter((r) => r.status === "active" && r.frequency === "monthly")
      .reduce((s, r) => s + Number(r.tier_amount), 0);
    const recurringOut = expenses
      .filter((e) => e.recurring && e.frequency === "monthly")
      .reduce((s, e) => s + Number(e.amount), 0);
    return { outstanding, overdue, paidThisMonth, recurringIn, recurringOut };
  }, [invoices, retainers, expenses, payments, saMonth]);

  // ---- Quote actions ----
  async function openQuote(q: FinanceQuote) {
    setSelectedQuote(q);
    const li = await supabase
      .from("finance_quote_line_items")
      .select("*")
      .eq("quote_id", q.id)
      .order("sort_order");
    setQuoteItems((li.data ?? []) as LineItem[]);
  }

  async function sendQuote(q: FinanceQuote) {
    try {
      const number = q.quote_number ?? (await nextDocumentNumber("quote", "QT"));
      const r = await supabase
        .from("finance_quotes")
        .update({ status: "sent", quote_number: number })
        .eq("id", q.id);
      if (r.error) throw r.error;
      pushToast({ type: "success", title: "Quote sent", message: number });
      setSelectedQuote(null);
      void load();
    } catch (e) {
      pushToast({ type: "error", title: "Quote", message: e instanceof Error ? e.message : "Failed" });
    }
  }

  async function convertQuoteToInvoice(q: FinanceQuote) {
    try {
      const li = await supabase
        .from("finance_quote_line_items")
        .select("*")
        .eq("quote_id", q.id)
        .order("sort_order");
      if (li.error) throw li.error;
      const ins = await supabase
        .from("invoices")
        .insert({
          client_id: q.client_id,
          project_id: q.project_id,
          status: "draft",
          vat_enabled: q.vat_enabled,
          vat_rate: q.vat_rate,
          subtotal: q.subtotal,
          vat_amount: q.vat_amount,
          total: q.total,
          amount: q.total,
          notes: q.notes,
        })
        .select("id")
        .single();
      if (ins.error) throw ins.error;
      const invoiceId = (ins.data as { id: string }).id;
      const rows = ((li.data ?? []) as LineItem[]).map((it, i) => ({
        invoice_id: invoiceId,
        description: it.description,
        qty: it.qty,
        unit_price: it.unit_price,
        line_total: it.line_total,
        sort_order: i,
      }));
      if (rows.length) {
        const r2 = await supabase.from("invoice_line_items").insert(rows);
        if (r2.error) throw r2.error;
      }
      await supabase.from("finance_quotes").update({ status: "accepted" }).eq("id", q.id);
      pushToast({ type: "success", title: "Converted", message: "Draft invoice created" });
      setSelectedQuote(null);
      setTab("invoices");
      void load();
    } catch (e) {
      pushToast({ type: "error", title: "Convert", message: e instanceof Error ? e.message : "Failed" });
    }
  }

  // ---- Expense actions ----
  async function addExpense() {
    const amount = Number(expenseForm.amount);
    if (!amount) return pushToast({ type: "error", title: "Expense", message: "Enter an amount" });
    const r = await supabase.from("expenses").insert({
      category: expenseForm.category.trim() || null,
      vendor: expenseForm.vendor.trim() || null,
      amount,
      incurred_on: expenseForm.incurred_on,
      note: expenseForm.note.trim() || null,
      recurring: expenseForm.recurring,
      frequency: expenseForm.frequency,
    });
    if (r.error) return pushToast({ type: "error", title: "Expense", message: r.error.message });
    setExpenseModal(false);
    setExpenseForm({ category: "", vendor: "", amount: "", incurred_on: getSaDateString(), note: "", recurring: false, frequency: "once" });
    void load();
  }
  async function delExpense(id: string) {
    setExpenses((p) => p.filter((e) => e.id !== id));
    const r = await supabase.from("expenses").delete().eq("id", id);
    if (r.error) {
      pushToast({ type: "error", title: "Expense", message: r.error.message });
      void load();
    }
  }
  async function setRetainerStatus(r: Retainer, status: Retainer["status"]) {
    setRetainers((p) => p.map((x) => (x.id === r.id ? { ...x, status } : x)));
    const res = await supabase.from("retainers").update({ status }).eq("id", r.id);
    if (res.error) {
      pushToast({ type: "error", title: "Retainer", message: res.error.message });
      void load();
    }
  }

  const quoteTone = (s: string) =>
    s === "accepted" ? "success" : s === "declined" ? "danger" : s === "sent" ? "brand" : "neutral";

  return (
    <PageTransition>
      <PageHeader
        title="Finance"
        subtitle="Quotes, invoices & retainers"
        action={
          <Button variant="secondary" size="sm" onClick={() => void load()}>
            <RefreshCcw className="h-4 w-4" />
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Paid this month" value={zar0(summary.paidThisMonth)} tone="success" />
        <Stat label="Outstanding" value={zar0(summary.outstanding)} tone="warn" />
        <Stat label="Overdue" value={zar0(summary.overdue)} tone="danger" />
        <Stat
          label="Monthly recurring"
          value={zar0(summary.recurringIn - summary.recurringOut)}
          hint={`${zar0(summary.recurringIn)} in · ${zar0(summary.recurringOut)} out`}
        />
      </div>

      <Segmented
        className="my-4"
        value={tab}
        onChange={(v) => setTab(v as Tab)}
        options={[
          { value: "overview", label: "Overview" },
          { value: "invoices", label: "Invoices", count: invoices.length },
          { value: "quotes", label: "Quotes", count: quotes.length },
          { value: "retainers", label: "Retainers", count: retainers.length },
          { value: "expenses", label: "Expenses", count: expenses.length },
        ]}
      />

      {loading ? (
        <Skeleton className="h-40 w-full" />
      ) : clients.length === 0 && tab !== "expenses" ? (
        <EmptyState
          icon={<Wallet className="h-7 w-7" />}
          title="No clients yet"
          body="Convert a lead to a client (Leads → open a lead → Convert to client) before raising quotes or invoices."
        />
      ) : (
        <>
          {/* OVERVIEW */}
          {tab === "overview" && (
            <div className="space-y-4">
              <Card>
                <CardHeader title="Recent invoices" subtitle={`${invoices.length} total`} />
                <CardBody className="space-y-2">
                  {invoices.slice(0, 5).map((i) => (
                    <InvoiceRow key={i.id} inv={i} name={clientName(i.client_id)} onOpen={() => setSelectedInvoice(i)} />
                  ))}
                  {invoices.length === 0 && <div className="text-sm text-ink-faint">No invoices yet.</div>}
                </CardBody>
              </Card>
              <Card>
                <CardHeader title="Active retainers" subtitle={`${zar0(summary.recurringIn)}/mo recurring`} />
                <CardBody className="space-y-2">
                  {retainers.filter((r) => r.status === "active").map((r) => (
                    <div key={r.id} className="flex items-center justify-between rounded-xl border border-line bg-surface p-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-ink">{clientName(r.client_id)}</div>
                        <div className="text-xs text-ink-faint">{r.name} · next {r.next_run_date ?? "—"}</div>
                      </div>
                      <span className="font-mono text-sm font-bold tabular-nums text-ink">{zar0(r.tier_amount)}</span>
                    </div>
                  ))}
                  {retainers.filter((r) => r.status === "active").length === 0 && (
                    <div className="text-sm text-ink-faint">No active retainers.</div>
                  )}
                </CardBody>
              </Card>
            </div>
          )}

          {/* INVOICES */}
          {tab === "invoices" && (
            <div className="space-y-2">
              <Button onClick={() => setInvoiceForm({ editing: null })} className="mb-1">
                <Plus className="h-4 w-4" /> New invoice
              </Button>
              {invoices.length === 0 ? (
                <EmptyState icon={<FileText className="h-7 w-7" />} title="No invoices" body="Create your first invoice." />
              ) : (
                invoices.map((i) => (
                  <InvoiceRow key={i.id} inv={i} name={clientName(i.client_id)} onOpen={() => setSelectedInvoice(i)} />
                ))
              )}
            </div>
          )}

          {/* QUOTES */}
          {tab === "quotes" && (
            <div className="space-y-2">
              <Button onClick={() => setQuoteFormOpen(true)} className="mb-1">
                <Plus className="h-4 w-4" /> New quote
              </Button>
              {quotes.length === 0 ? (
                <EmptyState icon={<FileText className="h-7 w-7" />} title="No quotes" body="Create a quote, then convert it to an invoice." />
              ) : (
                quotes.map((q) => (
                  <button
                    key={q.id}
                    onClick={() => void openQuote(q)}
                    className="flex w-full items-center justify-between gap-3 rounded-xl border border-line bg-surface p-3 text-left active:scale-[0.99]"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-ink">{clientName(q.client_id)}</div>
                      <div className="text-xs text-ink-faint">{q.quote_number ?? "Draft"} · valid {q.valid_until ?? "—"}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-bold tabular-nums">{zar0(q.total)}</span>
                      <Badge tone={quoteTone(q.status)}>{q.status}</Badge>
                    </div>
                  </button>
                ))
              )}
            </div>
          )}

          {/* RETAINERS */}
          {tab === "retainers" && (
            <div className="space-y-2">
              <Button onClick={() => setRetainerFormOpen(true)} className="mb-1">
                <Plus className="h-4 w-4" /> New retainer
              </Button>
              {retainers.length === 0 ? (
                <EmptyState title="No retainers" body="Add a monthly retainer for a client." />
              ) : (
                retainers.map((r) => (
                  <div key={r.id} className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface p-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-ink">{clientName(r.client_id)}</div>
                      <div className="text-xs text-ink-faint">
                        {r.name} · {zar0(r.tier_amount)}/mo · next {r.next_run_date ?? "—"}
                        {r.contract_months ? ` · ${r.contract_months}mo` : ""}
                      </div>
                    </div>
                    <button onClick={() => void setRetainerStatus(r, r.status === "active" ? "paused" : "active")}>
                      <Badge tone={r.status === "active" ? "success" : r.status === "cancelled" ? "danger" : "neutral"}>
                        {r.status}
                      </Badge>
                    </button>
                  </div>
                ))
              )}
            </div>
          )}

          {/* EXPENSES */}
          {tab === "expenses" && (
            <div className="space-y-2">
              <Button onClick={() => setExpenseModal(true)} className="mb-1">
                <Plus className="h-4 w-4" /> Add expense
              </Button>
              {expenses.length === 0 ? (
                <EmptyState icon={<Wallet className="h-7 w-7" />} title="No expenses" body="Track tools and recurring costs." />
              ) : (
                expenses.map((e) => (
                  <div key={e.id} className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface p-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-ink">{e.vendor || e.category || "Expense"}</div>
                      <div className="text-xs text-ink-faint">
                        {e.category ?? "—"} · {e.incurred_on}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {e.recurring && <Badge>{e.frequency}</Badge>}
                      <span className="font-mono text-sm font-bold tabular-nums">{zar0(e.amount)}</span>
                      <button onClick={() => void delExpense(e.id)} className="text-ink-faint active:scale-90" aria-label="Delete">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </>
      )}

      {/* ---- Forms / panels ---- */}
      {invoiceForm && (
        <InvoiceForm
          open={!!invoiceForm}
          onClose={() => setInvoiceForm(null)}
          clients={clients}
          projects={projects}
          editing={invoiceForm.editing}
          onSaved={() => void load()}
        />
      )}
      <QuoteForm open={quoteFormOpen} onClose={() => setQuoteFormOpen(false)} clients={clients} projects={projects} onSaved={() => void load()} />
      <RetainerForm open={retainerFormOpen} onClose={() => setRetainerFormOpen(false)} clients={clients} onSaved={() => void load()} />

      <InvoiceDetail
        invoice={selectedInvoice}
        clientName={clientName(selectedInvoice?.client_id ?? null)}
        onClose={() => setSelectedInvoice(null)}
        onChanged={() => void load()}
        onEdit={(inv, items) => {
          setSelectedInvoice(null);
          setInvoiceForm({ editing: { invoice: inv, items } });
        }}
      />

      {/* Quote detail */}
      <Sheet open={!!selectedQuote} onClose={() => setSelectedQuote(null)} title={selectedQuote?.quote_number ?? "Draft quote"}>
        {selectedQuote && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Badge tone={quoteTone(selectedQuote.status)}>{selectedQuote.status}</Badge>
              <span className="text-sm text-ink-muted">{clientName(selectedQuote.client_id)}</span>
            </div>
            <div className="rounded-xl border border-line bg-surface">
              {quoteItems.map((it, i) => (
                <div key={i} className="flex justify-between border-b border-line px-3 py-2.5 text-sm last:border-0">
                  <span className="text-ink">{it.description}</span>
                  <span className="font-mono tabular-nums text-ink">{zar(it.line_total)}</span>
                </div>
              ))}
              <div className="flex justify-between px-3 py-2.5 font-bold text-ink">
                <span>Total</span>
                <span className="font-mono tabular-nums">{zar(selectedQuote.total)}</span>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {selectedQuote.status === "draft" && (
                <Button size="md" onClick={() => void sendQuote(selectedQuote)}>
                  <Send className="h-4 w-4" /> Send quote
                </Button>
              )}
              <Button size="md" variant="secondary" onClick={() => void convertQuoteToInvoice(selectedQuote)}>
                <ArrowRight className="h-4 w-4" /> Convert to invoice
              </Button>
            </div>
          </div>
        )}
      </Sheet>

      {/* Expense modal */}
      <Modal open={expenseModal} onClose={() => setExpenseModal(false)} title="Add expense">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Vendor">
              <Input value={expenseForm.vendor} onChange={(e) => setExpenseForm((f) => ({ ...f, vendor: e.target.value }))} placeholder="e.g. Supabase" />
            </Field>
            <Field label="Category">
              <Input value={expenseForm.category} onChange={(e) => setExpenseForm((f) => ({ ...f, category: e.target.value }))} placeholder="Software" />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Amount (R)">
              <Input type="number" inputMode="decimal" value={expenseForm.amount} onChange={(e) => setExpenseForm((f) => ({ ...f, amount: e.target.value }))} />
            </Field>
            <Field label="Date">
              <input
                type="date"
                value={expenseForm.incurred_on}
                onChange={(e) => setExpenseForm((f) => ({ ...f, incurred_on: e.target.value }))}
                className="w-full rounded-xl border border-line bg-surface px-3 py-3 text-base text-ink outline-none focus:border-brand"
              />
            </Field>
          </div>
          <button
            type="button"
            onClick={() => setExpenseForm((f) => ({ ...f, recurring: !f.recurring }))}
            className="flex w-full items-center justify-between rounded-xl border border-line bg-surface p-3"
          >
            <span className="text-sm text-ink">Recurring cost</span>
            <span className={`flex h-6 w-11 items-center rounded-full px-0.5 transition ${expenseForm.recurring ? "bg-brand" : "bg-white/10"}`}>
              <span className={`h-5 w-5 rounded-full bg-white transition ${expenseForm.recurring ? "translate-x-5" : ""}`} />
            </span>
          </button>
          {expenseForm.recurring && (
            <Field label="Frequency">
              <Select value={expenseForm.frequency} onChange={(e) => setExpenseForm((f) => ({ ...f, frequency: e.target.value as Expense["frequency"] }))}>
                <option value="monthly">Monthly</option>
                <option value="annual">Annual</option>
              </Select>
            </Field>
          )}
          <Field label="Note">
            <Input value={expenseForm.note} onChange={(e) => setExpenseForm((f) => ({ ...f, note: e.target.value }))} />
          </Field>
          <Button block size="lg" onClick={() => void addExpense()}>
            Add expense
          </Button>
        </div>
      </Modal>
    </PageTransition>
  );
}

function InvoiceRow({ inv, name, onOpen }: { inv: Invoice; name: string; onOpen: () => void }) {
  const st = effectiveInvoiceStatus(inv);
  return (
    <button
      onClick={onOpen}
      className="flex w-full items-center justify-between gap-3 rounded-xl border border-line bg-surface p-3 text-left active:scale-[0.99]"
    >
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold text-ink">{name}</div>
        <div className="text-xs text-ink-faint">
          {inv.invoice_number ?? "Draft"} · {inv.issued_date ?? "—"}
        </div>
      </div>
      <div className="flex items-center gap-3">
        <span className="font-mono text-sm font-bold tabular-nums">{zar0(inv.total)}</span>
        <Badge tone={INVOICE_STATUS_TONE[st]}>{st}</Badge>
      </div>
    </button>
  );
}
