import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  Ban,
  BarChart3,
  Check,
  CheckCircle2,
  ChevronRight,
  ClipboardPaste,
  Clock3,
  ExternalLink,
  Inbox,
  ListChecks,
  MapPin,
  MessageCircle,
  Phone,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import { getSaDateString } from "@/utils/saDate";
import { useToast } from "@/components/toast/ToastProvider";
import {
  buildDailyQueue,
  defaultRestaurantOpener,
  loadConversations,
  loadDailyQueue,
  loadFollowUps,
  loadProspects,
  recordManualFollowUp,
  recordManualReply,
  recordManualSend,
  resolveQueueItem,
  whatsappUrl,
} from "@/lib/leadEngine";
import type {
  CrmLead,
  DailyQueueItem,
  FollowUp,
  OutreachMessage,
  Prospect,
  QueueAction,
  ReplyClassification,
} from "@/types/leadEngine";
import {
  Badge,
  Button,
  Card,
  CardBody,
  EmptyState,
  Field,
  Input,
  PageHeader,
  PageTransition,
  Segmented,
  Sheet,
  Skeleton,
  Stat,
  Textarea,
} from "@/ui";

type Tab = "queue" | "prospects" | "conversations" | "followups" | "analytics";

const REPLY_OPTIONS: { value: ReplyClassification; label: string }[] = [
  { value: "interested", label: "Interested" },
  { value: "staff_response", label: "Staff response" },
  { value: "question", label: "Question" },
  { value: "not_interested", label: "Not interested" },
  { value: "stop", label: "Opt out / stop" },
  { value: "unclassified", label: "Unclassified" },
];

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong";
}

function isDue(followUp: FollowUp): boolean {
  return followUp.status === "pending" && new Date(followUp.due_at).getTime() <= Date.now();
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("en-ZA", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function defaultFollowUpMessage(followUp: FollowUp): string {
  const businessName = followUp.lead?.business_name ?? "your business";
  if (followUp.step === 1) {
    return `Hi - just following up in case my previous message got buried.

I have a website idea specifically for ${businessName} and wanted to speak to the owner or person who handles the marketing.

Who would be the best person to chat to?`;
  }

  return `Hi - just following up one last time about the website idea for ${businessName}.

No pressure at all. I just wanted to check whether the owner or person who handles the marketing would be open to hearing more about it.`;
}

export default function LeadEngineV2() {
  const { pushToast } = useToast();
  const today = useMemo(() => getSaDateString(), []);
  const [tab, setTab] = useState<Tab>("queue");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [queue, setQueue] = useState<DailyQueueItem[]>([]);
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [leads, setLeads] = useState<CrmLead[]>([]);
  const [messages, setMessages] = useState<OutreachMessage[]>([]);
  const [followUps, setFollowUps] = useState<FollowUp[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [followUpDrafts, setFollowUpDrafts] = useState<Record<string, string>>({});
  const [prospectSearch, setProspectSearch] = useState("");
  const [replyOpen, setReplyOpen] = useState(false);
  const [replyLeadId, setReplyLeadId] = useState("");
  const [replyBody, setReplyBody] = useState("");
  const [replyClassification, setReplyClassification] =
    useState<ReplyClassification>("unclassified");
  const [replySummary, setReplySummary] = useState("");
  const [suggestedReply, setSuggestedReply] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [queueRows, prospectRows, conversationRows, followUpRows] = await Promise.all([
        loadDailyQueue(today),
        loadProspects(),
        loadConversations(),
        loadFollowUps(),
      ]);
      setQueue(queueRows);
      setProspects(prospectRows);
      setLeads(conversationRows.leads);
      setMessages(conversationRows.messages);
      setFollowUps(followUpRows);
      setDrafts((current) => {
        const next = { ...current };
        for (const item of queueRows) {
          if (!next[item.id]) {
            next[item.id] =
              item.final_text ||
              item.draft_text ||
              defaultRestaurantOpener(item.prospect.business_name);
          }
        }
        return next;
      });
      setFollowUpDrafts((current) => {
        const next = { ...current };
        for (const followUp of followUpRows) {
          if (!next[followUp.id]) {
            next[followUp.id] =
              followUp.draft_text || defaultFollowUpMessage(followUp);
          }
        }
        return next;
      });
    } catch (loadError) {
      setError(errorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }, [today]);

  useEffect(() => {
    void load();
  }, [load]);

  const readyQueue = useMemo(
    () => queue.filter((item) => item.status === "ready"),
    [queue],
  );
  const sentToday = useMemo(
    () => queue.filter((item) => item.status === "sent").length,
    [queue],
  );
  const dueFollowUps = useMemo(() => followUps.filter(isDue), [followUps]);
  const restaurantProspects = useMemo(
    () => prospects.filter((prospect) => prospect.offer === "restaurant_site"),
    [prospects],
  );
  const filteredProspects = useMemo(() => {
    const query = prospectSearch.trim().toLowerCase();
    if (!query) return restaurantProspects;
    return restaurantProspects.filter((prospect) =>
      [
        prospect.business_name,
        prospect.niche,
        prospect.suburb,
        prospect.website,
        prospect.phone_e164,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query)),
    );
  }, [prospectSearch, restaurantProspects]);

  const conversationLeads = useMemo(() => {
    const leadIds = new Set(messages.map((message) => message.lead_id));
    return leads.filter((lead) => leadIds.has(lead.id));
  }, [leads, messages]);

  async function handleBuildQueue() {
    setBusy("build");
    try {
      const created = await buildDailyQueue(today, 20);
      pushToast({
        type: "success",
        title: "Daily queue ready",
        message: created ? `${created} candidates added` : "No new eligible candidates",
      });
      await load();
    } catch (buildError) {
      pushToast({ type: "error", title: "Build queue", message: errorMessage(buildError) });
    } finally {
      setBusy(null);
    }
  }

  function openWhatsApp(item: DailyQueueItem) {
    const draft = drafts[item.id] ?? defaultRestaurantOpener(item.prospect.business_name);
    const url = whatsappUrl(
      item.prospect.whatsapp_e164 ?? item.prospect.phone_e164,
      draft,
    );
    if (!url) {
      pushToast({ type: "error", title: "WhatsApp", message: "No usable phone number" });
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  }

  async function handleRecordSent(item: DailyQueueItem) {
    setBusy(item.id);
    try {
      await recordManualSend(
        item.id,
        drafts[item.id] ?? defaultRestaurantOpener(item.prospect.business_name),
      );
      pushToast({
        type: "success",
        title: "Outreach recorded",
        message: `${item.prospect.business_name} is now in the CRM`,
      });
      await load();
    } catch (sendError) {
      pushToast({ type: "error", title: "Mark sent", message: errorMessage(sendError) });
    } finally {
      setBusy(null);
    }
  }

  async function handleQueueAction(item: DailyQueueItem, action: QueueAction) {
    setBusy(item.id);
    try {
      await resolveQueueItem(item.id, action);
      pushToast({
        type: action === "suppress" ? "error" : "success",
        title:
          action === "skip" ? "Skipped" : action === "reject" ? "Rejected" : "Suppressed",
        message: item.prospect.business_name,
      });
      await load();
    } catch (actionError) {
      pushToast({ type: "error", title: "Queue action", message: errorMessage(actionError) });
    } finally {
      setBusy(null);
    }
  }

  function beginReplyCapture(lead?: CrmLead) {
    setReplyLeadId(lead?.id ?? conversationLeads[0]?.id ?? leads[0]?.id ?? "");
    setReplyBody("");
    setReplyClassification("unclassified");
    setReplySummary("");
    setSuggestedReply("");
    setReplyOpen(true);
  }

  async function handleReplySave() {
    if (!replyLeadId || !replyBody.trim()) return;
    setBusy("reply");
    try {
      await recordManualReply({
        leadId: replyLeadId,
        body: replyBody,
        classification: replyClassification,
        summary: replySummary,
        suggestedReply,
      });
      pushToast({
        type: "success",
        title: "Reply captured",
        message: "Pipeline and follow-ups updated",
      });
      setReplyOpen(false);
      await load();
    } catch (replyError) {
      pushToast({ type: "error", title: "Capture reply", message: errorMessage(replyError) });
    } finally {
      setBusy(null);
    }
  }

  async function handleFollowUpComplete(followUp: FollowUp) {
    const finalText = followUpDrafts[followUp.id]?.trim();
    if (!finalText) {
      pushToast({
        type: "error",
        title: "Follow-up",
        message: "Review or enter the exact message before marking it sent",
      });
      return;
    }
    setBusy(followUp.id);
    try {
      await recordManualFollowUp(followUp.id, finalText);
      pushToast({
        type: "success",
        title: "Follow-up recorded",
        message: `${followUp.lead?.business_name ?? "Lead"} message saved exactly`,
      });
      await load();
    } catch (followUpError) {
      pushToast({ type: "error", title: "Follow-up", message: errorMessage(followUpError) });
    } finally {
      setBusy(null);
    }
  }

  const responseCount = messages.filter((message) => message.direction === "inbound").length;
  const interestedCount = messages.filter(
    (message) => message.classification === "interested",
  ).length;
  const outboundCount = messages.filter((message) => message.direction === "outbound").length;
  const responseRate = outboundCount
    ? Math.round((responseCount / outboundCount) * 100)
    : 0;

  return (
    <PageTransition>
      <div className="relative overflow-hidden rounded-3xl border border-line bg-surface p-5 sm:p-7">
        <div className="pointer-events-none absolute -right-20 -top-28 h-72 w-72 rounded-full bg-brand/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 left-1/3 h-56 w-56 rounded-full bg-accent/10 blur-3xl" />
        <div className="relative">
          <PageHeader
            title="Lead Engine"
            subtitle="Restaurant outreach command deck · manual-send by design"
            action={
              <Button
                size="sm"
                variant="secondary"
                onClick={() => void load()}
                loading={loading}
              >
                <RefreshCw className="h-4 w-4" />
                Refresh
              </Button>
            }
          />
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Ready today" value={readyQueue.length} tone="brand" hint="20 max" />
            <Stat label="Sent today" value={sentToday} tone="success" />
            <Stat label="Follow-ups due" value={dueFollowUps.length} tone="warn" />
            <Stat label="Interested replies" value={interestedCount} tone="accent" />
          </div>
        </div>
      </div>

      <div className="sticky top-14 z-20 -mx-1 mt-4 overflow-x-auto px-1 py-2 backdrop-blur-xl">
        <Segmented
          value={tab}
          onChange={(value) => setTab(value as Tab)}
          options={[
            { value: "queue", label: "Daily queue", count: readyQueue.length },
            { value: "prospects", label: "Prospects", count: restaurantProspects.length },
            { value: "conversations", label: "Conversations", count: conversationLeads.length },
            { value: "followups", label: "Follow-ups", count: dueFollowUps.length },
            { value: "analytics", label: "Analytics" },
          ]}
        />
      </div>

      {error && (
        <Card className="mt-3 border-danger/30">
          <CardBody>
            <div className="flex items-start gap-3 text-sm text-danger">
              <Ban className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <div className="font-semibold">Lead Engine could not load</div>
                <div className="mt-1 text-danger/80">{error}</div>
              </div>
            </div>
          </CardBody>
        </Card>
      )}

      {loading ? (
        <div className="mt-3 space-y-3">
          {[0, 1, 2].map((item) => (
            <Skeleton key={item} className="h-48 w-full" />
          ))}
        </div>
      ) : tab === "queue" ? (
        <QueueTab
          queue={queue}
          readyQueue={readyQueue}
          drafts={drafts}
          busy={busy}
          onDraftChange={(id, value) => setDrafts((current) => ({ ...current, [id]: value }))}
          onBuild={() => void handleBuildQueue()}
          onOpenWhatsApp={openWhatsApp}
          onRecordSent={(item) => void handleRecordSent(item)}
          onAction={(item, action) => void handleQueueAction(item, action)}
        />
      ) : tab === "prospects" ? (
        <ProspectsTab
          prospects={filteredProspects}
          search={prospectSearch}
          onSearch={setProspectSearch}
        />
      ) : tab === "conversations" ? (
        <ConversationsTab
          leads={conversationLeads}
          messages={messages}
          onCapture={beginReplyCapture}
        />
      ) : tab === "followups" ? (
        <FollowUpsTab
          followUps={followUps}
          drafts={followUpDrafts}
          busy={busy}
          onDraftChange={(id, value) =>
            setFollowUpDrafts((current) => ({ ...current, [id]: value }))
          }
          onComplete={(followUp) => void handleFollowUpComplete(followUp)}
        />
      ) : (
        <AnalyticsTab
          prospects={restaurantProspects}
          queue={queue}
          outboundCount={outboundCount}
          responseCount={responseCount}
          responseRate={responseRate}
          interestedCount={interestedCount}
        />
      )}

      <Sheet open={replyOpen} onClose={() => setReplyOpen(false)} title="Paste WhatsApp reply">
        <div className="space-y-4">
          <Field label="Lead">
            <select
              value={replyLeadId}
              onChange={(event) => setReplyLeadId(event.target.value)}
              className="min-h-[44px] w-full rounded-xl border border-line bg-surface px-3 text-sm text-ink outline-none focus:border-brand"
            >
              <option value="">Select a lead</option>
              {leads.map((lead) => (
                <option key={lead.id} value={lead.id}>
                  {lead.business_name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Reply text">
            <Textarea
              rows={6}
              value={replyBody}
              onChange={(event) => setReplyBody(event.target.value)}
              placeholder="Paste the WhatsApp reply here…"
            />
          </Field>
          <Field label="Classification">
            <select
              value={replyClassification}
              onChange={(event) =>
                setReplyClassification(event.target.value as ReplyClassification)
              }
              className="min-h-[44px] w-full rounded-xl border border-line bg-surface px-3 text-sm text-ink outline-none focus:border-brand"
            >
              {REPLY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Summary (optional)">
            <Input
              value={replySummary}
              onChange={(event) => setReplySummary(event.target.value)}
              placeholder="What matters about this reply?"
            />
          </Field>
          <Field label="Suggested response (optional)">
            <Textarea
              rows={4}
              value={suggestedReply}
              onChange={(event) => setSuggestedReply(event.target.value)}
              placeholder="Agent suggestion or your own draft"
            />
          </Field>
          <Button
            block
            size="lg"
            loading={busy === "reply"}
            disabled={!replyLeadId || !replyBody.trim()}
            onClick={() => void handleReplySave()}
          >
            <ClipboardPaste className="h-4 w-4" />
            Save reply and update pipeline
          </Button>
        </div>
      </Sheet>
    </PageTransition>
  );
}

function QueueTab({
  queue,
  readyQueue,
  drafts,
  busy,
  onDraftChange,
  onBuild,
  onOpenWhatsApp,
  onRecordSent,
  onAction,
}: {
  queue: DailyQueueItem[];
  readyQueue: DailyQueueItem[];
  drafts: Record<string, string>;
  busy: string | null;
  onDraftChange: (id: string, value: string) => void;
  onBuild: () => void;
  onOpenWhatsApp: (item: DailyQueueItem) => void;
  onRecordSent: (item: DailyQueueItem) => void;
  onAction: (item: DailyQueueItem, action: QueueAction) => void;
}) {
  return (
    <div className="mt-3 space-y-3">
      <div className="flex flex-col gap-3 rounded-2xl border border-brand/20 bg-brand-soft p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-brand/15 p-2 text-brand">
            <ListChecks className="h-5 w-5" />
          </div>
          <div>
            <div className="text-sm font-semibold text-ink">Today’s review queue</div>
            <div className="mt-0.5 text-xs text-ink-faint">
              Qualified restaurants only. Nothing sends until you tap WhatsApp.
            </div>
          </div>
        </div>
        <Button size="sm" onClick={onBuild} loading={busy === "build"}>
          <Sparkles className="h-4 w-4" />
          Fill to 20
        </Button>
      </div>

      {readyQueue.length === 0 ? (
        <EmptyState
          icon={<CheckCircle2 className="h-7 w-7" />}
          title={queue.length ? "Today’s queue is clear" : "No queue built yet"}
          body={
            queue.length
              ? "Everything selected for today has been actioned."
              : "Build the queue after importing and qualifying restaurant prospects."
          }
          action={
            <Button size="sm" onClick={onBuild} loading={busy === "build"}>
              Build today’s queue
            </Button>
          }
        />
      ) : (
        readyQueue.map((item) => {
          const prospect = item.prospect;
          const draft = drafts[item.id] ?? defaultRestaurantOpener(prospect.business_name);
          return (
            <Card key={item.id} className="overflow-hidden border-line-strong">
              <div className="h-1 bg-gradient-to-r from-brand via-brand to-accent" />
              <CardBody>
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs text-ink-faint">
                        #{String(item.rank).padStart(2, "0")}
                      </span>
                      <h2 className="text-lg font-bold text-ink">{prospect.business_name}</h2>
                      <Badge tone={prospect.lead_temp === "hot" ? "danger" : "warn"}>
                        {item.qualification?.verdict ?? prospect.lead_temp ?? "review"}
                      </Badge>
                      {item.qualification && (
                        <Badge tone="brand">{item.qualification.score}/100</Badge>
                      )}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2 text-xs text-ink-faint">
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="h-3.5 w-3.5" />
                        {prospect.suburb ?? "South Africa"}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Activity className="h-3.5 w-3.5" />
                        {prospect.google_rating ?? "—"}★ ·{" "}
                        {prospect.google_reviews_count ?? 0} reviews
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Phone className="h-3.5 w-3.5" />
                        {prospect.whatsapp_e164 ?? prospect.phone_e164 ?? "No number"}
                      </span>
                    </div>
                    {prospect.website && (
                      <a
                        href={prospect.website}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-2 inline-flex max-w-full items-center gap-1 truncate text-xs text-brand hover:underline"
                      >
                        {prospect.website}
                        <ExternalLink className="h-3 w-3 shrink-0" />
                      </a>
                    )}
                    <div className="mt-3 rounded-xl border border-line bg-base/50 px-3 py-2 text-xs text-ink-muted">
                      {item.selection_reason ?? "Selected by restaurant qualification rules"}
                    </div>
                  </div>

                  <div className="w-full lg:max-w-xl">
                    <Textarea
                      rows={4}
                      value={draft}
                      onChange={(event) => onDraftChange(item.id, event.target.value)}
                      aria-label={`Message for ${prospect.business_name}`}
                    />
                    <div className="mt-3 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                      <Button size="sm" onClick={() => onOpenWhatsApp(item)}>
                        <MessageCircle className="h-4 w-4" />
                        Open WhatsApp
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        loading={busy === item.id}
                        onClick={() => onRecordSent(item)}
                      >
                        <Check className="h-4 w-4" />
                        Mark sent
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy === item.id}
                        onClick={() => onAction(item, "skip")}
                      >
                        <Clock3 className="h-4 w-4" />
                        Skip
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy === item.id}
                        onClick={() => onAction(item, "reject")}
                      >
                        <X className="h-4 w-4" />
                        Reject
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy === item.id}
                        className="text-danger"
                        onClick={() => onAction(item, "suppress")}
                      >
                        <ShieldCheck className="h-4 w-4" />
                        Opt out
                      </Button>
                    </div>
                  </div>
                </div>
              </CardBody>
            </Card>
          );
        })
      )}
    </div>
  );
}

function ProspectsTab({
  prospects,
  search,
  onSearch,
}: {
  prospects: Prospect[];
  search: string;
  onSearch: (value: string) => void;
}) {
  return (
    <div className="mt-3 space-y-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
        <Input
          value={search}
          onChange={(event) => onSearch(event.target.value)}
          placeholder="Search restaurants, suburbs, websites or phone numbers"
          className="pl-10"
        />
      </div>
      {prospects.length === 0 ? (
        <EmptyState title="No restaurant prospects found" />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {prospects.map((prospect) => (
            <Card key={prospect.id}>
              <CardBody>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate font-semibold text-ink">{prospect.business_name}</div>
                    <div className="mt-1 text-xs text-ink-faint">
                      {prospect.niche}
                      {prospect.suburb ? ` · ${prospect.suburb}` : ""}
                    </div>
                  </div>
                  <Badge
                    tone={
                      prospect.popia_optout
                        ? "danger"
                        : prospect.lead_id
                          ? "success"
                          : "neutral"
                    }
                  >
                    {prospect.popia_optout
                      ? "suppressed"
                      : prospect.lead_id
                        ? "in CRM"
                        : prospect.status}
                  </Badge>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-ink-muted">
                  <div className="rounded-xl border border-line bg-base/40 p-2">
                    <div className="text-ink-faint">Qualification</div>
                    <div className="mt-0.5 font-semibold">{prospect.lead_temp ?? "pending"}</div>
                  </div>
                  <div className="rounded-xl border border-line bg-base/40 p-2">
                    <div className="text-ink-faint">Google proof</div>
                    <div className="mt-0.5 font-semibold">
                      {prospect.google_rating ?? "—"}★ · {prospect.google_reviews_count ?? 0}
                    </div>
                  </div>
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function ConversationsTab({
  leads,
  messages,
  onCapture,
}: {
  leads: CrmLead[];
  messages: OutreachMessage[];
  onCapture: (lead?: CrmLead) => void;
}) {
  return (
    <div className="mt-3 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-ink">WhatsApp conversation log</div>
          <div className="text-xs text-ink-faint">Paste replies until Business API sync is justified.</div>
        </div>
        <Button size="sm" onClick={() => onCapture()}>
          <ClipboardPaste className="h-4 w-4" />
          Paste reply
        </Button>
      </div>
      {leads.length === 0 ? (
        <EmptyState icon={<Inbox className="h-7 w-7" />} title="No conversations yet" />
      ) : (
        leads.map((lead) => {
          const leadMessages = messages
            .filter((message) => message.lead_id === lead.id)
            .slice()
            .reverse();
          const latest = leadMessages.at(-1);
          return (
            <button
              type="button"
              key={lead.id}
              onClick={() => onCapture(lead)}
              className="flex w-full items-center gap-3 rounded-2xl border border-line bg-surface p-4 text-left transition hover:border-line-strong hover:bg-surface-hover"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-soft font-bold text-brand">
                {lead.business_name.slice(0, 1).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-semibold text-ink">
                    {lead.business_name}
                  </span>
                  <Badge tone={latest?.direction === "inbound" ? "accent" : "neutral"}>
                    {lead.stage}
                  </Badge>
                </div>
                <div className="mt-1 truncate text-xs text-ink-faint">
                  {latest?.message_text ?? "No messages"}
                </div>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-ink-faint" />
            </button>
          );
        })
      )}
    </div>
  );
}

function FollowUpsTab({
  followUps,
  drafts,
  busy,
  onDraftChange,
  onComplete,
}: {
  followUps: FollowUp[];
  drafts: Record<string, string>;
  busy: string | null;
  onDraftChange: (id: string, value: string) => void;
  onComplete: (followUp: FollowUp) => void;
}) {
  const pending = followUps.filter((followUp) => followUp.status === "pending");
  return (
    <div className="mt-3 space-y-3">
      {pending.length === 0 ? (
        <EmptyState icon={<Clock3 className="h-7 w-7" />} title="No follow-ups pending" />
      ) : (
        pending.map((followUp) => {
          const due = isDue(followUp);
          const message = drafts[followUp.id] ?? defaultFollowUpMessage(followUp);
          const url = whatsappUrl(followUp.lead?.phone ?? null, message);
          return (
            <Card key={followUp.id} className={due ? "border-warn/40" : undefined}>
              <CardBody>
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-ink">
                        {followUp.lead?.business_name ?? "Unknown lead"}
                      </span>
                      <Badge tone={due ? "warn" : "neutral"}>
                        {due ? "due now" : formatDateTime(followUp.due_at)}
                      </Badge>
                      <Badge>step {followUp.step}</Badge>
                    </div>
                    <Textarea
                      rows={5}
                      className="mt-3"
                      value={message}
                      onChange={(event) => onDraftChange(followUp.id, event.target.value)}
                      aria-label={`Follow-up message for ${followUp.lead?.business_name ?? "lead"}`}
                    />
                    <div className="mt-2 text-xs text-ink-faint">
                      Review this text, send it manually in WhatsApp, then mark it sent.
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    {url && (
                      <a
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-brand px-3 text-sm font-semibold text-white shadow-glow transition hover:brightness-110"
                      >
                        <MessageCircle className="h-4 w-4" />
                        Open WhatsApp
                      </a>
                    )}
                    <Button
                      size="sm"
                      variant="secondary"
                      loading={busy === followUp.id}
                      disabled={!message.trim()}
                      onClick={() => onComplete(followUp)}
                    >
                      <Check className="h-4 w-4" />
                      Mark sent
                    </Button>
                  </div>
                </div>
              </CardBody>
            </Card>
          );
        })
      )}
    </div>
  );
}

function AnalyticsTab({
  prospects,
  queue,
  outboundCount,
  responseCount,
  responseRate,
  interestedCount,
}: {
  prospects: Prospect[];
  queue: DailyQueueItem[];
  outboundCount: number;
  responseCount: number;
  responseRate: number;
  interestedCount: number;
}) {
  const hot = prospects.filter((prospect) => prospect.lead_temp === "hot").length;
  const warm = prospects.filter((prospect) => prospect.lead_temp === "warm").length;
  return (
    <div className="mt-3 space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Restaurant pool" value={prospects.length} tone="brand" />
        <Stat label="Hot / warm" value={`${hot} / ${warm}`} tone="warn" />
        <Stat label="Outreach logged" value={outboundCount} tone="success" />
        <Stat label="Response rate" value={`${responseRate}%`} tone="accent" />
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <Card>
          <CardBody>
            <div className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-brand" />
              <div className="font-semibold text-ink">Pilot scorecard</div>
            </div>
            <div className="mt-4 space-y-3">
              {[
                ["Selected today", queue.length],
                ["Sent today", queue.filter((item) => item.status === "sent").length],
                ["Replies captured", responseCount],
                ["Interested", interestedCount],
              ].map(([label, value]) => (
                <div
                  key={String(label)}
                  className="flex items-center justify-between border-b border-line pb-2 text-sm last:border-0"
                >
                  <span className="text-ink-muted">{label}</span>
                  <span className="font-mono font-bold text-ink">{value}</span>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-accent" />
              <div className="font-semibold text-ink">Agent promotion gates</div>
            </div>
            <div className="mt-4 space-y-3 text-sm">
              <Gate label="Research agreement" target="≥ 85%" />
              <Gate label="Drafts approved unchanged" target="≥ 80%" />
              <Gate label="Reply classification" target="≥ 90%" />
              <Gate label="Preparation time saved" target="≥ 50%" />
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

function Gate({ label, target }: { label: string; target: string }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-line bg-base/40 px-3 py-2">
      <span className="text-ink-muted">{label}</span>
      <Badge tone="brand">{target}</Badge>
    </div>
  );
}
