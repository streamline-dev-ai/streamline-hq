import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Printer, Pencil, Ban, Send, Trash2, FolderKanban } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/components/toast/ToastProvider";
import { Button, Sheet, Badge, Field, Input, Select } from "@/ui";
import {
  zar,
  effectiveInvoiceStatus,
  nextDocumentNumber,
  invoiceBalance,
  INVOICE_STATUS_TONE,
  PAYMENT_METHODS,
  type Invoice,
  type LineItem,
  type Payment,
  type PaymentMethod,
} from "@/lib/finance";

/**
 * Invoice status is DERIVED from payments by a DB trigger (sent → partial → paid).
 * We never set a paid flag by hand here — we record payments and the balance/
 * status update automatically. Overdue is layered on at read-time from due_date.
 */
export default function InvoiceDetail({
  invoice,
  clientName,
  onClose,
  onChanged,
  onEdit,
}: {
  invoice: Invoice | null;
  clientName: string;
  onClose: () => void;
  onChanged: () => void;
  onEdit: (inv: Invoice, items: LineItem[]) => void;
}) {
  const { pushToast } = useToast();
  const navigate = useNavigate();
  const [inv, setInv] = useState<Invoice | null>(invoice);
  const [items, setItems] = useState<LineItem[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [busy, setBusy] = useState(false);
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState<PaymentMethod>("eft");

  const load = useCallback(async () => {
    if (!invoice) return;
    const [li, pay, fresh] = await Promise.all([
      supabase.from("invoice_line_items").select("*").eq("invoice_id", invoice.id).order("sort_order"),
      supabase.from("payments").select("*").eq("invoice_id", invoice.id).order("paid_at", { ascending: false }),
      supabase.from("invoices").select("*").eq("id", invoice.id).maybeSingle(),
    ]);
    setItems((li.data ?? []) as LineItem[]);
    setPayments((pay.data ?? []) as Payment[]);
    setInv(((fresh.data as Invoice) ?? invoice) as Invoice);
  }, [invoice]);

  useEffect(() => {
    setInv(invoice);
    setPayAmount("");
    setPayMethod("eft");
    void load();
  }, [invoice, load]);

  if (!inv) return null;
  const status = effectiveInvoiceStatus(inv);
  const isDraft = inv.status === "draft";
  const isVoid = inv.status === "void";
  const balance = invoiceBalance(inv);

  async function sendInvoice() {
    if (!inv) return;
    setBusy(true);
    try {
      const number = inv.invoice_number ?? (await nextDocumentNumber("invoice", "INV"));
      const r = await supabase
        .from("invoices")
        .update({ status: "sent", invoice_number: number })
        .eq("id", inv.id);
      if (r.error) throw r.error;
      pushToast({ type: "success", title: "Sent", message: number });
      await load();
      onChanged();
    } catch (e) {
      pushToast({ type: "error", title: "Invoice", message: e instanceof Error ? e.message : "Failed" });
    } finally {
      setBusy(false);
    }
  }

  async function addPayment() {
    if (!inv) return;
    const amount = Math.round((Number(payAmount) || 0) * 100) / 100;
    if (!amount || amount <= 0) {
      pushToast({ type: "error", title: "Payment", message: "Enter an amount" });
      return;
    }
    setBusy(true);
    try {
      // Ensure the invoice is issued before it can take a payment.
      let number = inv.invoice_number;
      if (!number) {
        number = await nextDocumentNumber("invoice", "INV");
        const up = await supabase
          .from("invoices")
          .update({ status: "sent", invoice_number: number })
          .eq("id", inv.id);
        if (up.error) throw up.error;
      }
      const r = await supabase.from("payments").insert({ invoice_id: inv.id, amount, method: payMethod });
      if (r.error) throw r.error;
      pushToast({ type: "success", title: "Payment recorded", message: zar(amount) });
      setPayAmount("");
      await load();
      onChanged();
    } catch (e) {
      pushToast({ type: "error", title: "Payment", message: e instanceof Error ? e.message : "Failed" });
    } finally {
      setBusy(false);
    }
  }

  async function deletePayment(id: string) {
    setBusy(true);
    try {
      const r = await supabase.from("payments").delete().eq("id", id);
      if (r.error) throw r.error;
      await load();
      onChanged();
    } catch (e) {
      pushToast({ type: "error", title: "Payment", message: e instanceof Error ? e.message : "Failed" });
    } finally {
      setBusy(false);
    }
  }

  async function voidInvoice() {
    if (!inv) return;
    setBusy(true);
    try {
      const r = await supabase.from("invoices").update({ status: "void" }).eq("id", inv.id);
      if (r.error) throw r.error;
      pushToast({ type: "success", title: "Voided", message: inv.invoice_number ?? "Invoice" });
      onChanged();
      onClose();
    } catch (e) {
      pushToast({ type: "error", title: "Invoice", message: e instanceof Error ? e.message : "Failed" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={!!invoice} onClose={onClose} title={inv.invoice_number ?? "Draft invoice"}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={INVOICE_STATUS_TONE[status]}>{status}</Badge>
          <span className="text-sm text-ink-muted">{clientName}</span>
          {inv.due_date && <span className="text-sm text-ink-faint">· due {inv.due_date}</span>}
        </div>

        <div className="rounded-xl border border-line bg-surface">
          {items.map((it, i) => (
            <div
              key={i}
              className="flex items-start justify-between gap-3 border-b border-line px-3 py-2.5 last:border-0"
            >
              <div className="min-w-0">
                <div className="truncate text-sm text-ink">{it.description}</div>
                <div className="text-xs text-ink-faint">
                  {it.qty} × {zar(it.unit_price)}
                </div>
              </div>
              <div className="font-mono text-sm tabular-nums text-ink">{zar(it.line_total)}</div>
            </div>
          ))}
          <div className="space-y-1 px-3 py-2.5 text-sm">
            <div className="flex justify-between text-ink-muted">
              <span>Subtotal</span>
              <span className="font-mono tabular-nums">{zar(inv.subtotal)}</span>
            </div>
            {inv.vat_enabled && (
              <div className="flex justify-between text-ink-muted">
                <span>VAT ({inv.vat_rate ?? 15}%)</span>
                <span className="font-mono tabular-nums">{zar(inv.vat_amount)}</span>
              </div>
            )}
            <div className="flex justify-between border-t border-line pt-1 text-base font-bold text-ink">
              <span>Total</span>
              <span className="font-mono tabular-nums">{zar(inv.total)}</span>
            </div>
            {Number(inv.amount_paid) > 0 && (
              <>
                <div className="flex justify-between text-success">
                  <span>Paid</span>
                  <span className="font-mono tabular-nums">{zar(inv.amount_paid)}</span>
                </div>
                <div className="flex justify-between font-semibold text-ink">
                  <span>Balance</span>
                  <span className="font-mono tabular-nums">{zar(balance)}</span>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Payments */}
        {payments.length > 0 && (
          <div className="rounded-xl border border-line bg-surface">
            <div className="border-b border-line px-3 py-2 text-xs font-medium uppercase tracking-wide text-ink-faint">
              Payments
            </div>
            {payments.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-3 border-b border-line px-3 py-2.5 last:border-0">
                <div className="min-w-0">
                  <div className="text-sm text-ink">{zar(p.amount)}</div>
                  <div className="text-xs text-ink-faint">
                    {p.method.toUpperCase()} · {p.paid_at.slice(0, 10)}
                  </div>
                </div>
                {!isVoid && (
                  <button onClick={() => void deletePayment(p.id)} className="text-ink-faint active:scale-90" aria-label="Delete payment">
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Record a payment (deposit / partial / full) */}
        {!isVoid && inv.status !== "paid" && (
          <div className="space-y-3 rounded-xl border border-line bg-base/40 p-3">
            <div className="text-xs font-medium uppercase tracking-wide text-ink-faint">Record a payment</div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setPayAmount((Math.round((Number(inv.total) / 2) * 100) / 100).toString())}
                className="rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs text-ink active:scale-95"
              >
                50% deposit · {zar(Number(inv.total) / 2)}
              </button>
              <button
                type="button"
                onClick={() => setPayAmount(balance.toString())}
                className="rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs text-ink active:scale-95"
              >
                Full balance · {zar(balance)}
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Amount (R)">
                <Input type="number" inputMode="decimal" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} />
              </Field>
              <Field label="Method">
                <Select value={payMethod} onChange={(e) => setPayMethod(e.target.value as PaymentMethod)}>
                  {PAYMENT_METHODS.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <Button block size="md" loading={busy} onClick={() => void addPayment()}>
              Add payment
            </Button>
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-wrap gap-2">
          {isDraft ? (
            <>
              <Button size="md" loading={busy} onClick={() => void sendInvoice()}>
                <Send className="h-4 w-4" /> Send / issue
              </Button>
              <Button size="md" variant="secondary" onClick={() => onEdit(inv, items)}>
                <Pencil className="h-4 w-4" /> Edit
              </Button>
            </>
          ) : (
            <Button
              size="md"
              variant="secondary"
              onClick={() => window.open(`/invoice/${inv.id}/print`, "_blank")}
            >
              <Printer className="h-4 w-4" /> Printable invoice
            </Button>
          )}
          {inv.project_id && (
            <Button size="md" variant="ghost" onClick={() => navigate(`/projects/${inv.project_id}`)}>
              <FolderKanban className="h-4 w-4" /> Project
            </Button>
          )}
          {!isVoid && (
            <Button size="md" variant="ghost" loading={busy} onClick={() => void voidInvoice()}>
              <Ban className="h-4 w-4" /> Void
            </Button>
          )}
        </div>
      </div>
    </Sheet>
  );
}
