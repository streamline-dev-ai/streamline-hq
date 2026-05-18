import { useCallback, useEffect, useState } from "react";
import { formatZAPhone } from "@/lib/phone";
import { ExternalLink, Mail, Phone, RefreshCcw, BriefcaseBusiness } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/components/toast/ToastProvider";
import {
  Button,
  Card,
  CardBody,
  EmptyState,
  PageHeader,
  PageTransition,
  Skeleton,
} from "@/ui";

type LeadRow = {
  id: string;
  business_name: string;
  owner_name: string | null;
  phone: string | null;
  email: string | null;
  niche: string | null;
  demo_url: string | null;
  notes: string | null;
};

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
      pushToast({
        type: "error",
        title: "Clients",
        message: e instanceof Error ? e.message : "Failed to load clients",
      });
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
      .on("postgres_changes", { event: "*", schema: "public", table: "leads" }, () => void load())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [load]);

  const linkCls =
    "inline-flex min-h-[40px] items-center gap-2 rounded-xl border border-line bg-surface px-3 text-sm text-ink-muted active:scale-95";

  return (
    <PageTransition>
      <PageHeader
        title="Clients"
        subtitle={`${clients.length} active`}
        action={
          <Button variant="secondary" size="sm" onClick={() => void load()}>
            <RefreshCcw className="h-4 w-4" />
          </Button>
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
          body="Open a lead and mark it as a client to see it here."
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {clients.map((c) => {
            const phone = c.phone ? formatZAPhone(c.phone) : "";
            const wa = phone ? `https://wa.me/${phone}` : null;
            return (
              <Card key={c.id}>
                <CardBody>
                  <div className="text-base font-semibold text-ink">{c.business_name}</div>
                  {c.owner_name && (
                    <div className="mt-0.5 text-sm text-ink-faint">{c.owner_name}</div>
                  )}
                  <div className="mt-3 flex flex-wrap gap-2">
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
                    {c.demo_url && (
                      <a href={c.demo_url} target="_blank" rel="noreferrer" className={linkCls}>
                        <ExternalLink className="h-4 w-4" /> Demo
                      </a>
                    )}
                  </div>
                  <div className="mt-3 whitespace-pre-wrap text-sm text-ink-muted">
                    {c.notes?.trim() || <span className="text-ink-faint">No notes</span>}
                  </div>
                </CardBody>
              </Card>
            );
          })}
        </div>
      )}
    </PageTransition>
  );
}
