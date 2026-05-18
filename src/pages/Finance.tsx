import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCcw, Plus, Trash2, Wallet } from "lucide-react";
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
  Field,
  Input,
  Select,
  EmptyState,
  PageHeader,
  PageTransition,
  Skeleton,
} from "@/ui";

type Invoice = {
  id: string;
  client_id: string | null;
  type: "deposit" | "balance" | "retainer";
  amount: number;
  status: "invoiced" | "paid" | "overdue";
  issued_date: string | null;
  paid_date: string | null;
  notes: string | null;
};
type ClientRow = {
  id: string;
  business_name: string;
  retainer_amount: number | null;
  project_status: string | null;
};
type Cost = {
  id: string;
  name: string;
  amount: number;
  frequency: "monthly" | "annual" | "once";
  category: string | null;
  next_due: string | null;
};

const rand = (n: number) => `R${Math.round(n).toLocaleString("en-ZA")}`;

export default function Finance() {
  const { pushToast } = useToast();
  const saMonth = useMemo(() => getSaDateString().slice(0, 7), []);
  const [loading, setLoading] = useState(true);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [costs, setCosts] = useState<Cost[]>([]);
  const [costModal, setCostModal] = useState(false);
  const [costForm, setCostForm] = useState({
    name: "",
    amount: "",
    frequency: "monthly" as Cost["frequency"],
    category: "",
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [inv, cl, co] = await Promise.all([
        supabase.from("invoices").select("*").order("issued_date", { ascending: false }),
        supabase.from("clients").select("id, business_name, retainer_amount, project_status"),
        supabase.from("business_costs").select("*").order("amount", { ascending: false }),
      ]);
      if (inv.error) throw inv.error;
      if (cl.error) throw cl.error;
      if (co.error) throw co.error;
      setInvoices((inv.data ?? []) as Invoice[]);
      setClients((cl.data ?? []) as ClientRow[]);
      setCosts((co.data ?? []) as Cost[]);
    } catch (e) {
      pushToast({
        type: "error",
        title: "Finance",
        message: e instanceof Error ? e.message : "Failed to load",
      });
    } finally {
      setLoading(false);
    }
  }, [pushToast]);

  useEffect(() => {
    void load();
  }, [load]);

  const summary = useMemo(() => {
    const paidThisMonth = invoices
      .filter((i) => i.status === "paid" && (i.paid_date ?? "").slice(0, 7) === saMonth)
      .reduce((s, i) => s + Number(i.amount), 0);
    const outstanding = invoices
      .filter((i) => i.status !== "paid")
      .reduce((s, i) => s + Number(i.amount), 0);
    const overdue = invoices
      .filter((i) => i.status === "overdue")
      .reduce((s, i) => s + Number(i.amount), 0);
    const monthlyCosts = costs
      .filter((c) => c.frequency === "monthly")
      .reduce((s, c) => s + Number(c.amount), 0);
    const retainers = clients.reduce((s, c) => s + Number(c.retainer_amount ?? 0), 0);
    return { paidThisMonth, outstanding, overdue, monthlyCosts, retainers };
  }, [invoices, costs, clients, saMonth]);

  async function cycleStatus(inv: Invoice) {
    const next: Invoice["status"] =
      inv.status === "invoiced" ? "paid" : inv.status === "paid" ? "overdue" : "invoiced";
    const patch: Partial<Invoice> = {
      status: next,
      paid_date: next === "paid" ? getSaDateString() : null,
    };
    setInvoices((p) => p.map((x) => (x.id === inv.id ? { ...x, ...patch } : x)));
    const r = await supabase.from("invoices").update(patch).eq("id", inv.id);
    if (r.error) {
      pushToast({ type: "error", title: "Invoice", message: r.error.message });
      void load();
    }
  }

  async function addCost() {
    const amount = Number(costForm.amount);
    if (!costForm.name.trim() || !amount) return;
    const payload = {
      name: costForm.name.trim(),
      amount,
      frequency: costForm.frequency,
      category: costForm.category.trim() || null,
    };
    const r = await supabase.from("business_costs").insert(payload).select("*").single();
    if (r.error) {
      pushToast({ type: "error", title: "Cost", message: r.error.message });
      return;
    }
    setCosts((p) => [r.data as Cost, ...p]);
    setCostModal(false);
    setCostForm({ name: "", amount: "", frequency: "monthly", category: "" });
  }

  async function delCost(id: string) {
    setCosts((p) => p.filter((c) => c.id !== id));
    const r = await supabase.from("business_costs").delete().eq("id", id);
    if (r.error) {
      pushToast({ type: "error", title: "Cost", message: r.error.message });
      void load();
    }
  }

  const clientName = (id: string | null) =>
    clients.find((c) => c.id === id)?.business_name ?? "—";
  const invTone = (s: Invoice["status"]) =>
    s === "paid" ? "success" : s === "overdue" ? "danger" : "warn";

  return (
    <PageTransition>
      <PageHeader
        title="Finance"
        subtitle="Invoices, retainers & costs"
        action={
          <Button variant="secondary" size="sm" onClick={() => void load()}>
            <RefreshCcw className="h-4 w-4" />
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Paid this month" value={rand(summary.paidThisMonth)} tone="success" />
        <Stat label="Outstanding" value={rand(summary.outstanding)} tone="warn" />
        <Stat label="Overdue" value={rand(summary.overdue)} tone="danger" />
        <Stat
          label="Monthly recurring"
          value={rand(summary.retainers - summary.monthlyCosts)}
          hint={`${rand(summary.retainers)} in · ${rand(summary.monthlyCosts)} out`}
        />
      </div>

      <Card className="mt-4">
        <CardHeader title="Invoices" subtitle="Tap status to cycle" />
        <CardBody className="space-y-2">
          {loading ? (
            <Skeleton className="h-16 w-full" />
          ) : invoices.length === 0 ? (
            <div className="text-sm text-ink-faint">No invoices yet.</div>
          ) : (
            invoices.map((i) => (
              <div
                key={i.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface p-3"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-ink">
                    {clientName(i.client_id)}
                  </div>
                  <div className="text-xs text-ink-faint capitalize">
                    {i.type} · {i.issued_date ?? "—"}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-mono text-sm font-bold tabular-nums">
                    {rand(Number(i.amount))}
                  </span>
                  <button onClick={() => void cycleStatus(i)} className="active:scale-95">
                    <Badge tone={invTone(i.status)}>{i.status}</Badge>
                  </button>
                </div>
              </div>
            ))
          )}
        </CardBody>
      </Card>

      <Card className="mt-4 mb-2">
        <CardHeader
          title="Business costs"
          action={
            <Button size="sm" onClick={() => setCostModal(true)}>
              <Plus className="h-4 w-4" />
              Add
            </Button>
          }
        />
        <CardBody className="space-y-2">
          {loading ? (
            <Skeleton className="h-16 w-full" />
          ) : costs.length === 0 ? (
            <EmptyState
              icon={<Wallet className="h-7 w-7" />}
              title="No costs tracked"
              body="Add your tools and recurring expenses."
            />
          ) : (
            costs.map((c) => (
              <div
                key={c.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface p-3"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-ink">{c.name}</div>
                  <div className="text-xs text-ink-faint">
                    {c.category ?? "Uncategorised"}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Badge>{c.frequency}</Badge>
                  <span className="font-mono text-sm font-bold tabular-nums">
                    {rand(Number(c.amount))}
                  </span>
                  <button
                    onClick={() => void delCost(c.id)}
                    className="text-ink-faint active:scale-90"
                    aria-label="Delete cost"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))
          )}
        </CardBody>
      </Card>

      <Modal open={costModal} onClose={() => setCostModal(false)} title="Add cost">
        <div className="space-y-3">
          <Field label="Name">
            <Input
              value={costForm.name}
              onChange={(e) => setCostForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Supabase Pro"
            />
          </Field>
          <Field label="Amount (R)">
            <Input
              type="number"
              inputMode="numeric"
              value={costForm.amount}
              onChange={(e) => setCostForm((f) => ({ ...f, amount: e.target.value }))}
            />
          </Field>
          <Field label="Frequency">
            <Select
              value={costForm.frequency}
              onChange={(e) =>
                setCostForm((f) => ({
                  ...f,
                  frequency: e.target.value as Cost["frequency"],
                }))
              }
            >
              <option value="monthly">Monthly</option>
              <option value="annual">Annual</option>
              <option value="once">Once</option>
            </Select>
          </Field>
          <Field label="Category">
            <Input
              value={costForm.category}
              onChange={(e) => setCostForm((f) => ({ ...f, category: e.target.value }))}
              placeholder="Software, hosting…"
            />
          </Field>
          <Button block size="lg" onClick={() => void addCost()}>
            Add cost
          </Button>
        </div>
      </Modal>
    </PageTransition>
  );
}
