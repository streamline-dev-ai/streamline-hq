import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Printer } from "lucide-react";
import { supabase } from "@/lib/supabase";
import {
  zar,
  invoiceBalance,
  type Invoice,
  type Client,
  type CompanySettings,
  type LineItem,
} from "@/lib/finance";

function fmtDate(ymd: string | null): string {
  if (!ymd) return "—";
  return ymd.replace(/-/g, "/");
}

export default function InvoicePrint() {
  const { id } = useParams<{ id: string }>();
  const [loading, setLoading] = useState(true);
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [client, setClient] = useState<Client | null>(null);
  const [items, setItems] = useState<LineItem[]>([]);
  const [company, setCompany] = useState<CompanySettings | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      if (!id) return;
      try {
        const inv = await supabase.from("invoices").select("*").eq("id", id).maybeSingle();
        if (inv.error) throw inv.error;
        if (!inv.data) {
          setError("Invoice not found");
          return;
        }
        const invoiceRow = inv.data as Invoice;
        setInvoice(invoiceRow);
        const [li, co, cl] = await Promise.all([
          supabase.from("invoice_line_items").select("*").eq("invoice_id", id).order("sort_order"),
          supabase.from("company_settings").select("*").limit(1).maybeSingle(),
          invoiceRow.client_id
            ? supabase.from("clients").select("*").eq("id", invoiceRow.client_id).maybeSingle()
            : Promise.resolve({ data: null, error: null }),
        ]);
        setItems((li.data ?? []) as LineItem[]);
        setCompany((co.data ?? null) as CompanySettings | null);
        if (cl && "data" in cl) setClient((cl.data ?? null) as Client | null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load invoice");
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (invoice) {
      document.title = `${invoice.invoice_number ?? "Invoice"} — ${company?.trading_name ?? "Streamline Automations"}`;
    }
  }, [invoice, company]);

  if (loading) return <div className="p-10 text-center text-zinc-500">Loading…</div>;
  if (error || !invoice)
    return <div className="p-10 text-center text-zinc-500">{error ?? "Not found"}</div>;

  // VAT-registered (and this invoice has VAT on) → legally a "Tax Invoice".
  const isTax = invoice.vat_enabled && (company?.vat_registered ?? false);
  const docTitle = isTax ? "TAX INVOICE" : "INVOICE";
  const amountPaid = Number(invoice.amount_paid ?? 0);
  const balanceDue = invoice.status === "void" ? 0 : invoiceBalance(invoice);

  return (
    <div className="min-h-screen bg-zinc-100 py-6 print:bg-white print:py-0">
      <style>{`@media print { @page { margin: 14mm; } .no-print { display: none !important; } body { background: #fff; } }`}</style>

      <div className="mx-auto max-w-[820px] px-4 print:px-0">
        <button
          onClick={() => window.print()}
          className="no-print mb-4 inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white"
        >
          <Printer className="h-4 w-4" /> Print / Save as PDF
        </button>

        <div className="bg-white p-10 text-zinc-800 shadow-sm print:p-0 print:shadow-none">
          {/* Header: title block (left) + logo & company (right) */}
          <div className="flex items-start justify-between gap-8">
            <div>
              <h1 className="text-4xl font-light tracking-tight text-zinc-800">{docTitle}</h1>
              <div className="mt-1 text-sm font-semibold text-zinc-600">
                Invoice# {invoice.invoice_number ?? "DRAFT"}
              </div>
              {invoice.status !== "void" && (
                <div className="mt-6">
                  <div className="text-xs font-semibold text-zinc-500">Balance Due</div>
                  <div className="text-lg font-bold text-zinc-800">{zar(balanceDue)}</div>
                </div>
              )}
            </div>
            <div className="text-right">
              {company?.logo_url && (
                <img src={company.logo_url} alt="" className="mb-3 ml-auto h-20 w-auto object-contain" />
              )}
              <div className="text-base font-bold text-zinc-800">
                {company?.trading_name ?? "Streamline Automations"}
              </div>
              {company?.address && (
                <div className="mt-0.5 whitespace-pre-line text-sm text-zinc-600">{company.address}</div>
              )}
              <div className="mt-0.5 text-sm text-zinc-600">
                {company?.contact_email ?? "christian@streamline-automations.agency"}
              </div>
              {company?.contact_phone && <div className="text-sm text-zinc-600">{company.contact_phone}</div>}
              {isTax && company?.vat_number && (
                <div className="mt-0.5 text-sm text-zinc-600">VAT No: {company.vat_number}</div>
              )}
            </div>
          </div>

          {/* Meta + bill to */}
          <div className="mt-10 flex items-start justify-between gap-8">
            <table className="text-sm">
              <tbody>
                <tr>
                  <td className="pr-8 text-zinc-500">Invoice Date :</td>
                  <td className="text-zinc-700">{fmtDate(invoice.issued_date)}</td>
                </tr>
                <tr>
                  <td className="pr-8 text-zinc-500">Terms :</td>
                  <td className="text-zinc-700">{company?.payment_terms ?? "Due on Receipt"}</td>
                </tr>
                <tr>
                  <td className="pr-8 text-zinc-500">Due Date :</td>
                  <td className="text-zinc-700">{fmtDate(invoice.due_date)}</td>
                </tr>
              </tbody>
            </table>
            <div className="min-w-[200px]">
              <div className="text-sm text-zinc-500">Bill To</div>
              <div className="text-sm font-bold text-zinc-800">{client?.business_name ?? "—"}</div>
              {client?.contact_name && <div className="text-sm text-zinc-600">{client.contact_name}</div>}
              {client?.address && <div className="whitespace-pre-line text-sm text-zinc-600">{client.address}</div>}
              {isTax && client?.vat_number && <div className="text-sm text-zinc-600">VAT No: {client.vat_number}</div>}
            </div>
          </div>

          {/* Line items */}
          <table className="mt-8 w-full text-sm">
            <thead>
              <tr className="bg-zinc-700 text-left text-white">
                <th className="rounded-l px-3 py-2 font-medium">#</th>
                <th className="px-3 py-2 font-medium">Item &amp; Description</th>
                <th className="px-3 py-2 text-right font-medium">Qty</th>
                <th className="px-3 py-2 text-right font-medium">Rate</th>
                <th className="rounded-r px-3 py-2 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it, i) => (
                <tr key={i} className="border-b border-zinc-100">
                  <td className="px-3 py-3 align-top text-zinc-500">{i + 1}</td>
                  <td className="px-3 py-3 align-top text-zinc-800">{it.description}</td>
                  <td className="px-3 py-3 text-right align-top tabular-nums">{Number(it.qty).toFixed(2)}</td>
                  <td className="px-3 py-3 text-right align-top tabular-nums">{Number(it.unit_price).toFixed(2)}</td>
                  <td className="px-3 py-3 text-right align-top tabular-nums">{Number(it.line_total).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Totals */}
          <div className="mt-2 flex justify-end">
            <table className="w-72 text-sm">
              <tbody>
                <tr>
                  <td className="px-3 py-2 text-right text-zinc-600">Sub Total</td>
                  <td className="px-3 py-2 text-right tabular-nums text-zinc-700">{Number(invoice.subtotal).toFixed(2)}</td>
                </tr>
                {isTax && (
                  <tr>
                    <td className="px-3 py-2 text-right text-zinc-600">VAT ({invoice.vat_rate ?? 15}%)</td>
                    <td className="px-3 py-2 text-right tabular-nums text-zinc-700">{Number(invoice.vat_amount).toFixed(2)}</td>
                  </tr>
                )}
                <tr className="font-bold text-zinc-800">
                  <td className="px-3 py-2 text-right">Total</td>
                  <td className="px-3 py-2 text-right tabular-nums">{zar(invoice.total)}</td>
                </tr>
                {amountPaid > 0 && (
                  <tr className="text-zinc-600">
                    <td className="px-3 py-2 text-right">Amount Paid</td>
                    <td className="px-3 py-2 text-right tabular-nums">−{zar(amountPaid)}</td>
                  </tr>
                )}
                <tr className="bg-zinc-100 font-bold text-zinc-800">
                  <td className="px-3 py-2 text-right">Balance Due</td>
                  <td className="px-3 py-2 text-right tabular-nums">{zar(balanceDue)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Notes */}
          <div className="mt-10 text-sm">
            <div className="text-zinc-500">Notes</div>
            <div className="mt-1 whitespace-pre-line text-zinc-700">
              {invoice.notes?.trim() || "Thank you for your business!"}
            </div>
          </div>

          {/* Banking details */}
          {(company?.bank_name || company?.bank_account_number) && (
            <div className="mt-6 text-sm">
              <div className="font-bold text-zinc-800 underline">Banking Details:</div>
              <div className="mt-1 space-y-0.5 text-zinc-700">
                {company?.bank_account_name && (
                  <div><span className="font-semibold">Account Holder:</span> {company.bank_account_name}</div>
                )}
                {company?.bank_name && (
                  <div><span className="font-semibold">Bank Name:</span> {company.bank_name}</div>
                )}
                {company?.bank_account_type && (
                  <div><span className="font-semibold">Account Type:</span> {company.bank_account_type}</div>
                )}
                {company?.bank_account_number && (
                  <div><span className="font-semibold">Account Number:</span> {company.bank_account_number}</div>
                )}
                {company?.bank_branch_code && (
                  <div><span className="font-semibold">Branch Code:</span> {company.bank_branch_code}</div>
                )}
              </div>
            </div>
          )}

          {/* Terms footer */}
          {company?.invoice_footer_terms && (
            <div className="mt-6 whitespace-pre-line border-t border-zinc-200 pt-4 text-xs text-zinc-500">
              {company.invoice_footer_terms}
            </div>
          )}

          {!isTax && (
            <div className="mt-3 text-[11px] text-zinc-400">
              Not registered for VAT — no VAT charged on this invoice.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
