import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/components/toast/ToastProvider";
import { getSaDateString, addDaysToSaYmd } from "@/utils/saDate";
import {
  Button,
  Sheet,
  Field,
  Select,
  Textarea,
} from "@/ui";
import LineItemsEditor from "./LineItemsEditor";
import {
  computeTotals,
  zar,
  DEFAULT_VAT_RATE,
  type Client,
  type Invoice,
  type LineItem,
} from "@/lib/finance";
import type { Project } from "@/lib/projects";

export default function InvoiceForm({
  open,
  onClose,
  clients,
  projects = [],
  editing,
  defaultClientId,
  defaultProjectId,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  clients: Client[];
  projects?: Project[];
  editing?: { invoice: Invoice; items: LineItem[] } | null;
  defaultClientId?: string | null;
  defaultProjectId?: string | null;
  onSaved: () => void;
}) {
  const { pushToast } = useToast();
  const [clientId, setClientId] = useState<string>("");
  const [projectId, setProjectId] = useState<string>("");
  const [issueDate, setIssueDate] = useState(getSaDateString());
  const [dueDate, setDueDate] = useState(addDaysToSaYmd(getSaDateString(), 7));
  const [vatEnabled, setVatEnabled] = useState(false);
  const [vatRate, setVatRate] = useState(DEFAULT_VAT_RATE);
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<LineItem[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setClientId(editing.invoice.client_id ?? "");
      setProjectId(editing.invoice.project_id ?? "");
      setIssueDate(editing.invoice.issued_date ?? getSaDateString());
      setDueDate(editing.invoice.due_date ?? addDaysToSaYmd(getSaDateString(), 7));
      setVatEnabled(editing.invoice.vat_enabled);
      setVatRate(editing.invoice.vat_rate ?? DEFAULT_VAT_RATE);
      setNotes(editing.invoice.notes ?? "");
      setItems(editing.items.length ? editing.items : []);
    } else {
      setClientId(defaultClientId ?? "");
      setProjectId(defaultProjectId ?? "");
      setIssueDate(getSaDateString());
      setDueDate(addDaysToSaYmd(getSaDateString(), 7));
      setVatEnabled(false);
      setVatRate(DEFAULT_VAT_RATE);
      setNotes("");
      setItems([{ description: "", qty: 1, unit_price: 0, line_total: 0, sort_order: 0 }]);
    }
  }, [open, editing, defaultClientId, defaultProjectId]);

  const clientProjects = projects.filter((p) => p.client_id === clientId);

  const totals = useMemo(
    () => computeTotals(items, vatEnabled, vatRate),
    [items, vatEnabled, vatRate],
  );

  async function save() {
    if (!clientId) return pushToast({ type: "error", title: "Invoice", message: "Pick a client" });
    const clean = items.filter((i) => i.description.trim() || i.unit_price);
    if (clean.length === 0)
      return pushToast({ type: "error", title: "Invoice", message: "Add at least one line item" });
    setSaving(true);
    try {
      const head = {
        client_id: clientId,
        issued_date: issueDate || null,
        due_date: dueDate || null,
        vat_enabled: vatEnabled,
        vat_rate: vatEnabled ? vatRate : null,
        subtotal: totals.subtotal,
        vat_amount: totals.vat_amount,
        total: totals.total,
        amount: totals.total, // keep legacy column populated
        project_id: projectId || null,
        notes: notes.trim() || null,
      };

      let invoiceId: string;
      if (editing) {
        invoiceId = editing.invoice.id;
        const up = await supabase.from("invoices").update(head).eq("id", invoiceId);
        if (up.error) throw up.error;
        await supabase.from("invoice_line_items").delete().eq("invoice_id", invoiceId);
      } else {
        const ins = await supabase
          .from("invoices")
          .insert({ ...head, status: "draft" })
          .select("id")
          .single();
        if (ins.error) throw ins.error;
        invoiceId = (ins.data as { id: string }).id;
      }

      const rows = clean.map((it, i) => ({
        invoice_id: invoiceId,
        description: it.description.trim(),
        qty: it.qty,
        unit_price: it.unit_price,
        line_total: it.line_total,
        sort_order: i,
      }));
      const li = await supabase.from("invoice_line_items").insert(rows);
      if (li.error) throw li.error;

      pushToast({ type: "success", title: editing ? "Saved" : "Draft created", message: "Invoice" });
      onSaved();
      onClose();
    } catch (e) {
      pushToast({ type: "error", title: "Invoice", message: e instanceof Error ? e.message : "Failed" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title={editing ? "Edit invoice" : "New invoice"}>
      <div className="space-y-4">
        <Field label="Client">
          <Select
            value={clientId}
            onChange={(e) => {
              setClientId(e.target.value);
              setProjectId("");
            }}
          >
            <option value="">Select a client…</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.business_name}
              </option>
            ))}
          </Select>
        </Field>

        {clientProjects.length > 0 && (
          <Field label="Project (optional)">
            <Select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">No project</option>
              {clientProjects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Field label="Issue date">
            <input
              type="date"
              value={issueDate}
              onChange={(e) => setIssueDate(e.target.value)}
              className="w-full rounded-xl border border-line bg-surface px-3 py-3 text-base text-ink outline-none focus:border-brand"
            />
          </Field>
          <Field label="Due date">
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="w-full rounded-xl border border-line bg-surface px-3 py-3 text-base text-ink outline-none focus:border-brand"
            />
          </Field>
        </div>

        <div>
          <div className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-faint">
            Line items
          </div>
          <LineItemsEditor items={items} onChange={setItems} />
        </div>

        <div className="rounded-xl border border-line bg-surface p-3">
          <button
            type="button"
            onClick={() => setVatEnabled((v) => !v)}
            className="flex w-full items-center justify-between"
          >
            <span className="text-sm text-ink">Add VAT (only if VAT-registered)</span>
            <span
              className={`flex h-6 w-11 items-center rounded-full px-0.5 transition ${
                vatEnabled ? "bg-brand" : "bg-white/10"
              }`}
            >
              <span
                className={`h-5 w-5 rounded-full bg-white transition ${
                  vatEnabled ? "translate-x-5" : ""
                }`}
              />
            </span>
          </button>
          {vatEnabled && (
            <div className="mt-3">
              <Field label="VAT rate %">
                <input
                  type="number"
                  value={vatRate}
                  onChange={(e) => setVatRate(Number(e.target.value))}
                  className="w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-base text-ink outline-none focus:border-brand"
                />
              </Field>
            </div>
          )}
        </div>

        <Field label="Notes (optional)">
          <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>

        <div className="space-y-1 rounded-xl border border-line bg-base/40 p-3 text-sm">
          <Row label="Subtotal" value={zar(totals.subtotal)} />
          {vatEnabled && <Row label={`VAT (${vatRate}%)`} value={zar(totals.vat_amount)} />}
          <div className="mt-1 flex justify-between border-t border-line pt-2 text-base font-bold text-ink">
            <span>Total</span>
            <span className="font-mono tabular-nums">{zar(totals.total)}</span>
          </div>
        </div>

        <Button block size="lg" loading={saving} onClick={() => void save()}>
          {editing ? "Save invoice" : "Save as draft"}
        </Button>
      </div>
    </Sheet>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-ink-muted">
      <span>{label}</span>
      <span className="font-mono tabular-nums">{value}</span>
    </div>
  );
}
