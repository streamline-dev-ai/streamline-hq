import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, X, Pencil, Flame, Inbox as InboxIcon } from "lucide-react";
import { hq } from "@/lib/hq";
import { getSaDateString } from "@/utils/saDate";
import { useToast } from "@/components/toast/ToastProvider";
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Badge,
  Stat,
  Sheet,
  Field,
  Textarea,
  Segmented,
  EmptyState,
  PageHeader,
  PageTransition,
  Skeleton,
} from "@/ui";

type Tab = "dashboard" | "queue" | "pipeline" | "inbox" | "prospects";

type Prospect = {
  id: string;
  business_name: string;
  slug: string;
  niche: string;
  suburb: string | null;
  status: string;
  popia_optout: boolean;
  phone_e164: string | null;
  google_rating: number | null;
  instagram_followers: number | null;
  created_at: string;
};
type Message = {
  id: string;
  prospect_id: string;
  sequence_step: number;
  draft_text: string;
  final_text: string | null;
  status: string;
  scheduled_for: string | null;
  sent_at: string | null;
  created_at: string;
};
type Reply = {
  id: string;
  prospect_id: string;
  body: string;
  sentiment: string | null;
  ai_suggested_response: string | null;
  responded: boolean;
  received_at: string;
};
type Engagement = {
  prospect_id: string;
  business_name: string;
  slug: string;
  bookings_count: number;
  demo_views: number;
  last_booking_at: string | null;
  last_demo_view_at: string | null;
};

const sentimentTone = (s: string | null) =>
  s === "hot" ? "danger" : s === "warm" ? "accent" : s === "stop" ? "danger" : "neutral";

export default function LeadEngine() {
  const { pushToast } = useToast();
  const [tab, setTab] = useState<Tab>("dashboard");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [replies, setReplies] = useState<Reply[]>([]);
  const [engagement, setEngagement] = useState<Engagement[]>([]);
  const [detail, setDetail] = useState<Prospect | null>(null);
  const [editMsg, setEditMsg] = useState<{ m: Message; text: string } | null>(null);
  const today = useMemo(() => getSaDateString(), []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [p, m, r, e] = await Promise.all([
        hq().from("prospects").select("*").order("created_at", { ascending: false }).limit(500),
        hq().from("messages").select("*").order("created_at", { ascending: false }).limit(500),
        hq().from("replies").select("*").order("received_at", { ascending: false }).limit(300),
        hq().from("prospect_engagement").select("*"),
      ]);
      if (p.error) throw p.error;
      setProspects((p.data ?? []) as Prospect[]);
      setMessages((m.data ?? []) as Message[]);
      setReplies((r.data ?? []) as Reply[]);
      setEngagement((e.data ?? []) as Engagement[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load Lead Engine");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const pName = useCallback(
    (id: string) => prospects.find((x) => x.id === id)?.business_name ?? "—",
    [prospects],
  );

  const stats = useMemo(() => {
    const pending = messages.filter((m) => m.status === "pending_approval").length;
    const sentToday = messages.filter(
      (m) => m.sent_at && getSaDateString(new Date(m.sent_at)) === today,
    ).length;
    const awaiting = replies.filter((r) => !r.responded).length;
    const hot = engagement.filter((e) => (e.bookings_count ?? 0) > 0).length;
    return { pending, sentToday, awaiting, hot };
  }, [messages, replies, engagement, today]);

  const pipeline = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of prospects) map.set(p.status, (map.get(p.status) ?? 0) + 1);
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [prospects]);

  const queue = messages.filter((m) => m.status === "pending_approval");

  async function act(m: Message, action: "approve" | "kill", finalText?: string) {
    const patch =
      action === "approve"
        ? {
            status: "approved",
            approval_action: "approve",
            approved_at: new Date().toISOString(),
            ...(finalText != null ? { final_text: finalText } : {}),
          }
        : { status: "killed", approval_action: "kill" };
    setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, ...patch } : x)));
    const { error: e } = await hq().from("messages").update(patch).eq("id", m.id);
    if (e) {
      pushToast({ type: "error", title: "Queue", message: e.message });
      void load();
    } else {
      pushToast({ type: "success", title: action === "approve" ? "Approved" : "Killed", message: pName(m.prospect_id) });
    }
    setEditMsg(null);
  }

  const engOf = (id: string) => engagement.find((e) => e.prospect_id === id);

  return (
    <PageTransition>
      <PageHeader title="Lead Engine" subtitle="Prospect → demo → outreach → booking" />

      <Segmented
        value={tab}
        onChange={(v) => setTab(v as Tab)}
        options={[
          { value: "dashboard", label: "Dashboard" },
          { value: "queue", label: "Queue", count: stats.pending },
          { value: "pipeline", label: "Pipeline" },
          { value: "inbox", label: "Inbox", count: stats.awaiting },
          { value: "prospects", label: "Prospects", count: prospects.length },
        ]}
        className="mb-4"
      />

      {error && (
        <Card className="mb-4 border-danger/30">
          <CardBody>
            <div className="text-sm text-danger">{error}</div>
            <div className="mt-1 text-xs text-ink-faint">
              If this says the schema/relation isn't found, toggle “Exposed
              schemas” → add <code>streamline_hq</code> in Supabase API settings.
            </div>
          </CardBody>
        </Card>
      )}

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : tab === "dashboard" ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Pending approvals" value={stats.pending} tone="warn" />
            <Stat label="Sent today" value={stats.sentToday} tone="brand" />
            <Stat label="Replies awaiting" value={stats.awaiting} tone="accent" />
            <Stat label="Hot (has bookings)" value={stats.hot} tone="danger" />
          </div>
          <Card>
            <CardHeader title="Funnel" subtitle={`${prospects.length} prospects`} />
            <CardBody className="flex flex-wrap gap-2">
              {pipeline.length === 0 ? (
                <span className="text-sm text-ink-faint">No prospects yet.</span>
              ) : (
                pipeline.map(([s, n]) => (
                  <div key={s} className="flex items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2">
                    <Badge>{s}</Badge>
                    <span className="font-mono text-sm font-bold tabular-nums">{n}</span>
                  </div>
                ))
              )}
            </CardBody>
          </Card>
          {stats.hot > 0 && (
            <Card className="border-danger/30">
              <CardHeader title="🔥 Hot engagement" subtitle="Free page got real bookings" />
              <CardBody className="space-y-2">
                {engagement
                  .filter((e) => (e.bookings_count ?? 0) > 0)
                  .map((e) => (
                    <div key={e.prospect_id} className="flex items-center justify-between rounded-xl border border-line bg-surface p-3">
                      <span className="text-sm font-semibold text-ink">{e.business_name}</span>
                      <Badge tone="danger">
                        <Flame className="h-3 w-3" /> {e.bookings_count} booking{e.bookings_count === 1 ? "" : "s"}
                      </Badge>
                    </div>
                  ))}
              </CardBody>
            </Card>
          )}
        </div>
      ) : tab === "queue" ? (
        <div className="space-y-2">
          {queue.length === 0 ? (
            <EmptyState title="Queue clear" body="No drafts waiting for approval." />
          ) : (
            queue.map((m) => (
              <Card key={m.id}>
                <CardBody>
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-semibold text-ink">{pName(m.prospect_id)}</div>
                    <Badge tone="brand">step {m.sequence_step}</Badge>
                  </div>
                  <div className="mt-2 whitespace-pre-wrap rounded-xl border border-line bg-base/40 p-3 text-sm text-ink-muted">
                    {m.final_text || m.draft_text}
                  </div>
                  <div className="mt-3 flex gap-2">
                    <Button size="sm" onClick={() => void act(m, "approve")}>
                      <Check className="h-4 w-4" /> Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setEditMsg({ m, text: m.final_text || m.draft_text })}
                    >
                      <Pencil className="h-4 w-4" /> Edit
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => void act(m, "kill")}>
                      <X className="h-4 w-4" /> Kill
                    </Button>
                  </div>
                </CardBody>
              </Card>
            ))
          )}
        </div>
      ) : tab === "pipeline" ? (
        <div className="space-y-2">
          {prospects.length === 0 ? (
            <EmptyState title="No prospects" body="They appear here once intake runs." />
          ) : (
            prospects.map((p) => (
              <button
                key={p.id}
                onClick={() => setDetail(p)}
                className="flex w-full items-center justify-between gap-3 rounded-xl border border-line bg-surface p-3 text-left active:scale-[0.99]"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-ink">{p.business_name}</div>
                  <div className="truncate text-xs text-ink-faint">
                    {p.niche}{p.suburb ? ` · ${p.suburb}` : ""}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {p.popia_optout && <Badge tone="danger">opted out</Badge>}
                  <Badge>{p.status}</Badge>
                </div>
              </button>
            ))
          )}
        </div>
      ) : tab === "inbox" ? (
        <div className="space-y-2">
          {replies.length === 0 ? (
            <EmptyState icon={<InboxIcon className="h-7 w-7" />} title="No replies yet" />
          ) : (
            replies.map((r) => (
              <Card key={r.id}>
                <CardBody>
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-semibold text-ink">{pName(r.prospect_id)}</div>
                    <div className="flex items-center gap-2">
                      {r.sentiment && (
                        <Badge tone={sentimentTone(r.sentiment)}>{r.sentiment}</Badge>
                      )}
                      {!r.responded && <Badge tone="warn">awaiting</Badge>}
                    </div>
                  </div>
                  <div className="mt-2 whitespace-pre-wrap text-sm text-ink-muted">{r.body}</div>
                  {r.ai_suggested_response && (
                    <div className="mt-2 rounded-xl border border-brand/20 bg-brand-soft p-3 text-sm text-ink-muted">
                      <div className="mb-1 text-xs font-medium text-brand">AI suggestion</div>
                      {r.ai_suggested_response}
                    </div>
                  )}
                </CardBody>
              </Card>
            ))
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {prospects.length === 0 ? (
            <EmptyState title="No prospects" />
          ) : (
            prospects.map((p) => (
              <button
                key={p.id}
                onClick={() => setDetail(p)}
                className="flex w-full items-center justify-between gap-3 rounded-xl border border-line bg-surface p-3 text-left active:scale-[0.99]"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-ink">{p.business_name}</div>
                  <div className="truncate text-xs text-ink-faint">
                    {p.niche}{p.suburb ? ` · ${p.suburb}` : ""}
                    {p.google_rating ? ` · ${p.google_rating}★` : ""}
                  </div>
                </div>
                <Badge>{p.status}</Badge>
              </button>
            ))
          )}
        </div>
      )}

      <Sheet
        open={!!detail}
        onClose={() => setDetail(null)}
        title={detail?.business_name}
      >
        {detail && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Badge>{detail.status}</Badge>
              <Badge tone="brand">{detail.niche}</Badge>
              {detail.suburb && <Badge>{detail.suburb}</Badge>}
              {detail.popia_optout && <Badge tone="danger">POPIA opt-out</Badge>}
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <Info label="Phone" value={detail.phone_e164 ?? "—"} />
              <Info label="Google" value={detail.google_rating ? `${detail.google_rating}★` : "—"} />
              <Info label="IG followers" value={detail.instagram_followers?.toLocaleString() ?? "—"} />
              <Info label="Slug" value={detail.slug} />
            </div>
            {(() => {
              const e = engOf(detail.id);
              return (
                <Card>
                  <CardHeader title="Engagement" />
                  <CardBody className="grid grid-cols-2 gap-3">
                    <Stat label="Bookings" value={e?.bookings_count ?? 0} tone={(e?.bookings_count ?? 0) > 0 ? "danger" : "default"} />
                    <Stat label="Demo views" value={e?.demo_views ?? 0} />
                  </CardBody>
                </Card>
              );
            })()}
            <div>
              <div className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-faint">
                Messages
              </div>
              <div className="space-y-2">
                {messages
                  .filter((m) => m.prospect_id === detail.id)
                  .slice(0, 8)
                  .map((m) => (
                    <div key={m.id} className="rounded-xl border border-line bg-surface p-3">
                      <div className="flex items-center justify-between">
                        <Badge>step {m.sequence_step}</Badge>
                        <Badge tone={m.status === "sent" ? "success" : "neutral"}>
                          {m.status}
                        </Badge>
                      </div>
                      <div className="mt-2 whitespace-pre-wrap text-sm text-ink-muted">
                        {m.final_text || m.draft_text}
                      </div>
                    </div>
                  ))}
                {messages.filter((m) => m.prospect_id === detail.id).length === 0 && (
                  <div className="text-sm text-ink-faint">No messages yet.</div>
                )}
              </div>
            </div>
          </div>
        )}
      </Sheet>

      <Sheet
        open={!!editMsg}
        onClose={() => setEditMsg(null)}
        title="Edit message"
      >
        {editMsg && (
          <div className="space-y-3">
            <Field label={pName(editMsg.m.prospect_id)}>
              <Textarea
                rows={8}
                value={editMsg.text}
                onChange={(e) => setEditMsg({ ...editMsg, text: e.target.value })}
              />
            </Field>
            <Button block size="lg" onClick={() => void act(editMsg.m, "approve", editMsg.text)}>
              Save & approve
            </Button>
          </div>
        )}
      </Sheet>
    </PageTransition>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-3">
      <div className="text-xs text-ink-faint">{label}</div>
      <div className="mt-0.5 truncate text-sm font-medium text-ink">{value}</div>
    </div>
  );
}
