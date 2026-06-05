import { supabase } from "./supabase";
import { getSaDateString } from "@/utils/saDate";

// ---- Money (South African Rand) ----------------------------------
export function zar(n: number | string | null | undefined): string {
  const v = Number(n ?? 0) || 0;
  return "R" + v.toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
export function zar0(n: number | string | null | undefined): string {
  const v = Math.round(Number(n ?? 0) || 0);
  return "R" + v.toLocaleString("en-ZA");
}

// ---- Types (mirror the live schema) ------------------------------
export type Client = {
  id: string;
  lead_id: string | null;
  business_name: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  niche: string | null;
  tier: number | null;
  status: string | null;
  project_status: string | null;
  vat_enabled: boolean | null;
  vat_number: string | null;
  notes: string | null;
  retainer_amount: number | null;
  created_at: string | null;
};

export type LineItem = {
  id?: string;
  description: string;
  qty: number;
  unit_price: number;
  line_total: number;
  sort_order: number;
};

export type InvoiceStatus = "draft" | "sent" | "paid" | "partial" | "overdue" | "void";

export type Invoice = {
  id: string;
  client_id: string | null;
  project_id: string | null;
  invoice_number: string | null;
  status: InvoiceStatus;
  issued_date: string | null;
  due_date: string | null;
  subtotal: number;
  vat_enabled: boolean;
  vat_rate: number | null;
  vat_amount: number;
  total: number;
  amount_paid: number;
  paid_date: string | null;
  retainer_id: string | null;
  public_token: string | null;
  notes: string | null;
  created_at: string | null;
};

export type PaymentMethod = "eft" | "payfast" | "cash";
export type Payment = {
  id: string;
  invoice_id: string;
  amount: number;
  method: PaymentMethod;
  paid_at: string;
  note: string | null;
  created_at?: string | null;
};

export const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: "eft", label: "EFT" },
  { value: "payfast", label: "PayFast" },
  { value: "cash", label: "Cash" },
];

// Outstanding balance on an invoice (total minus everything paid so far).
export function invoiceBalance(inv: Pick<Invoice, "total" | "amount_paid">): number {
  return Math.round((Number(inv.total) - Number(inv.amount_paid ?? 0)) * 100) / 100;
}

export type QuoteStatus = "draft" | "sent" | "accepted" | "declined";
export type FinanceQuote = {
  id: string;
  client_id: string | null;
  project_id: string | null;
  quote_number: string | null;
  status: QuoteStatus;
  subtotal: number;
  vat_enabled: boolean;
  vat_rate: number | null;
  vat_amount: number;
  total: number;
  valid_until: string | null;
  notes: string | null;
  created_at: string | null;
};

export type Retainer = {
  id: string;
  client_id: string;
  name: string;
  tier_amount: number;
  frequency: string;
  status: "active" | "paused" | "cancelled";
  next_run_date: string | null;
  start_date: string | null;
  end_date: string | null;
  contract_months: number | null;
  created_at: string | null;
};

export type Expense = {
  id: string;
  category: string | null;
  vendor: string | null;
  amount: number;
  incurred_on: string;
  receipt_url: string | null;
  note: string | null;
  recurring: boolean;
  frequency: "once" | "monthly" | "annual";
  next_due: string | null;
};

export type CompanySettings = {
  id: string;
  trading_name: string;
  contact_email: string;
  contact_phone: string | null;
  address: string | null;
  bank_name: string | null;
  bank_account_name: string | null;
  bank_account_type: string | null;
  bank_account_number: string | null;
  bank_branch_code: string | null;
  vat_registered: boolean;
  vat_number: string | null;
  payment_terms: string | null;
  invoice_footer_terms: string;
  logo_url: string | null;
};

// ---- Retainer tier presets --------------------------------------
export const RETAINER_TIERS = [
  { key: "essential", name: "Essential", amount: 499 },
  { key: "growth", name: "Growth", amount: 1199 },
  { key: "partner", name: "Partner", amount: 2499 },
] as const;

export const DEFAULT_VAT_RATE = 15;

// ---- Totals -----------------------------------------------------
export function lineTotal(qty: number, unitPrice: number): number {
  return Math.round((Number(qty) || 0) * (Number(unitPrice) || 0) * 100) / 100;
}

export function computeTotals(
  items: { qty: number; unit_price: number }[],
  vatEnabled: boolean,
  vatRate: number | null,
): { subtotal: number; vat_amount: number; total: number } {
  const subtotal =
    Math.round(items.reduce((s, i) => s + lineTotal(i.qty, i.unit_price), 0) * 100) / 100;
  const rate = vatEnabled ? Number(vatRate ?? DEFAULT_VAT_RATE) : 0;
  const vat_amount = Math.round(subtotal * (rate / 100) * 100) / 100;
  const total = Math.round((subtotal + vat_amount) * 100) / 100;
  return { subtotal, vat_amount, total };
}

// Display status: derive "overdue" at read-time (a sent/partial invoice past
// its due date with a balance) without depending on a background job.
export function effectiveInvoiceStatus(inv: Invoice, today = getSaDateString()): InvoiceStatus {
  if (inv.status === "void" || inv.status === "paid" || inv.status === "draft") return inv.status;
  // A sent/partial invoice past its due date reads as overdue.
  if (inv.due_date && inv.due_date < today) return "overdue";
  return inv.status;
}

// Gapless, per-year, human-readable number from the DB (INV-2026-0001 / QT-2026-0001)
export async function nextDocumentNumber(
  docType: "invoice" | "quote",
  prefix: "INV" | "QT",
): Promise<string> {
  const { data, error } = await supabase.rpc("next_document_number", {
    p_doc_type: docType,
    p_prefix: prefix,
  });
  if (error) throw error;
  return data as string;
}

export const INVOICE_STATUS_TONE: Record<InvoiceStatus, "neutral" | "brand" | "success" | "danger" | "warn" | "accent"> = {
  draft: "neutral",
  sent: "brand",
  partial: "warn",
  paid: "success",
  overdue: "danger",
  void: "neutral",
};
