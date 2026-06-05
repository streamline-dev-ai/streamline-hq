import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/components/toast/ToastProvider";
import { getSaDateString } from "@/utils/saDate";
import { Button, Sheet, Field, Select, Input } from "@/ui";
import { RETAINER_TIERS, zar, type Client } from "@/lib/finance";

// next_run_date = same day next month from start
function addMonths(ymd: string, months: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const base = new Date(Date.UTC(y, m - 1 + months, d));
  return base.toISOString().slice(0, 10);
}

export default function RetainerForm({
  open,
  onClose,
  clients,
  defaultClientId,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  clients: Client[];
  defaultClientId?: string | null;
  onSaved: () => void;
}) {
  const { pushToast } = useToast();
  const [clientId, setClientId] = useState("");
  const [tierKey, setTierKey] = useState<string>("growth");
  const [name, setName] = useState("Growth");
  const [amount, setAmount] = useState(1199);
  const [startDate, setStartDate] = useState(getSaDateString());
  const [rentToOwn, setRentToOwn] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setClientId(defaultClientId ?? "");
    setTierKey("growth");
    setName("Growth");
    setAmount(1199);
    setStartDate(getSaDateString());
    setRentToOwn(false);
  }, [open, defaultClientId]);

  function pickTier(key: string) {
    setTierKey(key);
    const t = RETAINER_TIERS.find((x) => x.key === key);
    if (t) {
      setName(t.name);
      setAmount(t.amount);
    }
  }

  async function save() {
    if (!clientId) return pushToast({ type: "error", title: "Retainer", message: "Pick a client" });
    setSaving(true);
    try {
      const r = await supabase.from("retainers").insert({
        client_id: clientId,
        name: rentToOwn ? `${name} (18-mo rent-to-own)` : name,
        tier_amount: amount,
        frequency: "monthly",
        status: "active",
        start_date: startDate,
        next_run_date: addMonths(startDate, 1),
        contract_months: rentToOwn ? 18 : null,
      });
      if (r.error) throw r.error;
      // keep the denormalised marker on clients in sync for quick reads
      await supabase.from("clients").update({ retainer_amount: amount }).eq("id", clientId);
      pushToast({ type: "success", title: "Retainer created", message: name });
      onSaved();
      onClose();
    } catch (e) {
      pushToast({ type: "error", title: "Retainer", message: e instanceof Error ? e.message : "Failed" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title="New retainer">
      <div className="space-y-4">
        <Field label="Client">
          <Select value={clientId} onChange={(e) => setClientId(e.target.value)}>
            <option value="">Select a client…</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.business_name}
              </option>
            ))}
          </Select>
        </Field>

        <div>
          <div className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-faint">Tier</div>
          <div className="grid grid-cols-3 gap-2">
            {RETAINER_TIERS.map((t) => {
              const active = tierKey === t.key;
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => pickTier(t.key)}
                  className={`rounded-xl border p-3 text-left transition active:scale-[0.98] ${
                    active ? "border-brand/40 bg-brand-soft" : "border-line bg-surface"
                  }`}
                >
                  <div className={`text-sm font-semibold ${active ? "text-brand" : "text-ink"}`}>{t.name}</div>
                  <div className="mt-0.5 text-xs text-ink-faint">{zar(t.amount)}/mo</div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Name">
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Monthly amount (R)">
            <Input type="number" value={amount} onChange={(e) => setAmount(Number(e.target.value))} />
          </Field>
        </div>

        <Field label="Start date">
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-full rounded-xl border border-line bg-surface px-3 py-3 text-base text-ink outline-none focus:border-brand"
          />
        </Field>

        <button
          type="button"
          onClick={() => setRentToOwn((v) => !v)}
          className="flex w-full items-center justify-between rounded-xl border border-line bg-surface p-3"
        >
          <span className="text-left text-sm text-ink">
            18-month rent-to-own contract
            <span className="mt-0.5 block text-xs text-ink-faint">Locks a 18-month term</span>
          </span>
          <span
            className={`flex h-6 w-11 shrink-0 items-center rounded-full px-0.5 transition ${
              rentToOwn ? "bg-brand" : "bg-white/10"
            }`}
          >
            <span className={`h-5 w-5 rounded-full bg-white transition ${rentToOwn ? "translate-x-5" : ""}`} />
          </span>
        </button>

        <div className="rounded-xl border border-line bg-base/40 p-3 text-xs text-ink-faint">
          First run: <span className="text-ink">{addMonths(startDate, 1)}</span>
          {rentToOwn && <> · ends {addMonths(startDate, 18)}</>}
        </div>

        <Button block size="lg" loading={saving} onClick={() => void save()}>
          Create retainer
        </Button>
      </div>
    </Sheet>
  );
}
