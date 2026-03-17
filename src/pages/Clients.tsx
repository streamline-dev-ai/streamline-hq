import { useCallback, useEffect, useMemo, useState } from "react";
import { ExternalLink, Mail, Phone, RefreshCcw } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/toast/ToastProvider";

type LeadRow = {
  id: string;
  business_name: string;
  owner_name: string | null;
  phone: string | null;
  email: string | null;
  niche: string | null;
  demo_url: string | null;
  notes: string | null;
  is_client: boolean | null;
};

function normalizePhoneNumber(raw: string) {
  return raw.replace(/[^0-9]/g, "");
}

export default function Clients() {
  const { pushToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [clients, setClients] = useState<LeadRow[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await supabase
        .from("leads")
        .select("id, business_name, owner_name, phone, email, niche, demo_url, notes, is_client")
        .eq("is_client", true)
        .order("business_name", { ascending: true });
      if (res.error) throw res.error;
      setClients((res.data ?? []) as LeadRow[]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to load clients";
      pushToast({ type: "error", title: "Clients", message: msg });
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
      .on("postgres_changes", { event: "*", schema: "public", table: "leads" }, () => {
        void load();
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [load]);

  const count = useMemo(() => clients.length, [clients.length]);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border bg-panel p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-lg font-semibold leading-none">Clients</div>
            <div className="mt-1 text-sm text-zinc-400">Leads marked as `is_client = true`</div>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center gap-2 rounded-xl border border-border bg-base/40 px-3 py-2 text-sm text-zinc-200 hover:bg-white/5"
          >
            <RefreshCcw className="h-4 w-4" />
            Refresh
          </button>
        </div>
        <div className="mt-3 text-sm text-zinc-300">Total: {count}</div>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-border bg-panel p-4 text-sm text-zinc-400">Loading…</div>
      ) : clients.length === 0 ? (
        <div className="rounded-2xl border border-border bg-panel p-6 text-center">
          <div className="text-sm font-semibold">No clients yet</div>
          <div className="mt-1 text-sm text-zinc-400">Open a lead and tap “Mark as client”.</div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {clients.map((c) => {
            const phone = c.phone ? normalizePhoneNumber(c.phone) : "";
            const wa = phone ? `https://wa.me/${phone}` : null;
            return (
              <div key={c.id} className="rounded-2xl border border-border bg-panel p-4">
                <div className="text-base font-semibold text-zinc-100">{c.business_name}</div>
                {c.owner_name ? <div className="mt-0.5 text-sm text-zinc-400">{c.owner_name}</div> : null}
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {wa ? (
                    <a
                      href={wa}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-2 rounded-xl border border-border bg-base/40 px-3 py-2 text-sm text-zinc-200 hover:bg-white/5"
                    >
                      <Phone className="h-4 w-4" />
                      WhatsApp
                    </a>
                  ) : null}
                  {c.email ? (
                    <a
                      href={`mailto:${c.email}`}
                      className="inline-flex items-center gap-2 rounded-xl border border-border bg-base/40 px-3 py-2 text-sm text-zinc-200 hover:bg-white/5"
                    >
                      <Mail className="h-4 w-4" />
                      Email
                    </a>
                  ) : null}
                  {c.demo_url ? (
                    <a
                      href={c.demo_url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-2 rounded-xl border border-border bg-base/40 px-3 py-2 text-sm text-zinc-200 hover:bg-white/5"
                    >
                      <ExternalLink className="h-4 w-4" />
                      Demo
                    </a>
                  ) : null}
                </div>
                {c.notes ? <div className="mt-3 whitespace-pre-wrap text-sm text-zinc-300">{c.notes}</div> : <div className="mt-3 text-sm text-zinc-500">No notes</div>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

