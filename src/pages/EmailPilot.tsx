import { useCallback, useEffect, useMemo, useState } from "react";
import { Mail, Plus, RefreshCw } from "lucide-react";
import { useToast } from "@/components/toast/ToastProvider";
import ApprovalQueue, { type ApprovalAction } from "@/components/emailPilot/ApprovalQueue";
import HandoverList from "@/components/emailPilot/HandoverList";
import ImportPanel from "@/components/emailPilot/ImportPanel";
import SocialQueue from "@/components/emailPilot/SocialQueue";
import ThreadTimeline from "@/components/emailPilot/ThreadTimeline";
import WeeklyReport from "@/components/emailPilot/WeeklyReport";
import {
  approveAndSchedule,
  createCampaign,
  loadCampaigns,
  loadHandovers,
  loadImportBatches,
  loadMemberships,
  loadSocialQueue,
  loadThreadMessages,
  loadWeeklyReport,
  logSocialSend,
  pauseCampaign,
  queueFollowUp,
  resolveHandover,
  setCampaignActive,
  skipMember,
  suppressProspect,
  type WeeklyReport as WeeklyReportData,
} from "@/lib/emailPilot";
import type {
  CampaignMembership,
  ImportBatch,
  OutreachCampaign,
  OutreachHandover,
  PilotMessage,
} from "@/types/emailPilot";
import type { Prospect } from "@/types/leadEngine";
import {
  Badge,
  Button,
  Card,
  CardBody,
  PageHeader,
  PageTransition,
  Segmented,
  type SegOption,
  Skeleton,
} from "@/ui";

type Tab = "import" | "approve" | "threads" | "handovers" | "social" | "report";

const SENDER_IDENTITY = "hello@streamline-automations.co.za";
const SENDER_DISPLAY_NAME = "Christiaan | Streamline Automations";
const REPLY_TO = "christiaan@streamline-automations.co.za";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong";
}

export default function EmailPilot() {
  const { pushToast } = useToast();
  const [tab, setTab] = useState<Tab>("approve");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [campaigns, setCampaigns] = useState<OutreachCampaign[]>([]);
  const [memberships, setMemberships] = useState<CampaignMembership[]>([]);
  const [messages, setMessages] = useState<PilotMessage[]>([]);
  const [handovers, setHandovers] = useState<OutreachHandover[]>([]);
  const [batches, setBatches] = useState<ImportBatch[]>([]);
  const [social, setSocial] = useState<Prospect[]>([]);
  const [report, setReport] = useState<WeeklyReportData | null>(null);

  const campaign = useMemo(
    () => campaigns.find((c) => c.channel === "email") ?? null,
    [campaigns],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [campaignRows, handoverRows, batchRows, socialRows, reportRow] =
        await Promise.all([
          loadCampaigns(),
          loadHandovers(),
          loadImportBatches(),
          loadSocialQueue(),
          loadWeeklyReport(),
        ]);
      setCampaigns(campaignRows);
      setHandovers(handoverRows);
      setBatches(batchRows);
      setSocial(socialRows);
      setReport(reportRow);

      const emailCampaign = campaignRows.find((c) => c.channel === "email") ?? null;
      if (emailCampaign) {
        const membershipRows = await loadMemberships(emailCampaign.id);
        setMemberships(membershipRows);
        setMessages(await loadThreadMessages(membershipRows.map((m) => m.id)));
      } else {
        setMemberships([]);
        setMessages([]);
      }
    } catch (loadError) {
      setError(errorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function withBusy(id: string, action: () => Promise<void>, success: string) {
    setBusyId(id);
    try {
      await action();
      pushToast({ type: "success", message: success });
      await load();
    } catch (actionError) {
      pushToast({ type: "error", message: errorMessage(actionError) });
    } finally {
      setBusyId(null);
    }
  }

  async function handleCreateCampaign() {
    setBusyId("new-campaign");
    try {
      await createCampaign({
        name: `Restaurant email pilot · ${new Date().toLocaleDateString("en-ZA")}`,
        senderIdentity: SENDER_IDENTITY,
        senderDisplayName: SENDER_DISPLAY_NAME,
        replyTo: REPLY_TO,
      });
      pushToast({
        type: "success",
        message: "Campaign created — inactive until you activate it.",
      });
      await load();
    } catch (createError) {
      pushToast({ type: "error", message: errorMessage(createError) });
    } finally {
      setBusyId(null);
    }
  }

  function handleApprovalAction(action: ApprovalAction) {
    if (action.kind === "approve") {
      void withBusy(
        action.membershipId,
        () =>
          approveAndSchedule(
            action.membershipId,
            action.subject,
            action.body,
            new Date(),
          ),
        "Approved and scheduled.",
      );
      return;
    }
    if (action.kind === "skip") {
      void withBusy(
        action.membershipId,
        () => skipMember(action.membershipId, "Skipped from the approval queue"),
        "Skipped.",
      );
      return;
    }
    void withBusy(
      action.membershipId,
      () => suppressProspect(action.prospectId, "manual_optout"),
      "Suppressed — this contact will not be emailed again.",
    );
  }

  const draftCount = memberships.filter((m) => m.status === "draft").length;
  const openHandovers = handovers.filter((h) => h.status === "open").length;

  const tabs: SegOption<Tab>[] = [
    { value: "import", label: "Import" },
    { value: "approve", label: "Approve", count: draftCount },
    { value: "threads", label: "Threads" },
    { value: "handovers", label: "Handovers", count: openHandovers },
    { value: "social", label: "Social" },
    { value: "report", label: "Report" },
  ];

  return (
    <PageTransition>
      <PageHeader
        title="Email Pilot"
        subtitle="Human-approved restaurant outreach · 5 per business day"
        action={
          <div className="flex items-center gap-2">
            {!campaign && (
              <Button
                size="sm"
                loading={busyId === "new-campaign"}
                onClick={() => void handleCreateCampaign()}
              >
                <Plus className="h-4 w-4" />
                New campaign
              </Button>
            )}
            <Button
              size="sm"
              variant="secondary"
              onClick={() => void load()}
              disabled={loading}
            >
              <RefreshCw className="h-4 w-4" />
              Refresh
            </Button>
          </div>
        }
      />

      {campaign && !campaign.active && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-warn/30 bg-warn-soft px-3 py-2.5 text-sm text-warn">
          <Badge tone="warn">Inactive</Badge>
          Nothing sends while the campaign is inactive. Approvals still queue safely.
        </div>
      )}

      <Segmented
        options={tabs}
        value={tab}
        onChange={(next) => setTab(next)}
        className="mb-4"
      />

      {error && (
        <div className="mb-4 rounded-xl border border-danger/30 bg-danger-soft px-3 py-2.5 text-sm text-danger">
          {error}
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-24" />
          <Skeleton className="h-56" />
          <Skeleton className="h-56" />
        </div>
      ) : (
        <>
          {tab === "import" && (
            <ImportPanel
              campaign={campaign}
              batches={batches}
              onImported={(summary, nextBatches) => {
                setBatches(nextBatches);
                pushToast({
                  type: summary.accepted > 0 ? "success" : "info",
                  message: `${summary.accepted} of ${summary.total} rows queued as drafts.`,
                });
                void load();
              }}
              onError={(message) => pushToast({ type: "error", message })}
            />
          )}

          {tab === "approve" && (
            <ApprovalQueue
              campaign={campaign}
              memberships={memberships}
              busyId={busyId}
              onAction={handleApprovalAction}
              onSetActive={(active) => {
                if (!campaign) return;
                void withBusy(
                  campaign.id,
                  () =>
                    active
                      ? setCampaignActive(campaign.id, true)
                      : pauseCampaign(campaign.id, "Paused from Streamline HQ"),
                  active
                    ? "Sending activated — approved messages will go out in business hours."
                    : "Sending paused.",
                );
              }}
            />
          )}

          {tab === "threads" && (
            <ThreadTimeline
              memberships={memberships}
              messages={messages}
              busyId={busyId}
              onFollowUp={(membershipId) =>
                void withBusy(
                  membershipId,
                  () => queueFollowUp({ membershipId }),
                  "Follow-up queued for approval.",
                )
              }
            />
          )}

          {tab === "handovers" && (
            <HandoverList
              handovers={handovers}
              memberships={memberships}
              busyId={busyId}
              onResolve={(handoverId) =>
                void withBusy(
                  handoverId,
                  () => resolveHandover(handoverId),
                  "Handover marked as handled.",
                )
              }
            />
          )}

          {tab === "social" && (
            <SocialQueue
              prospects={social}
              busyId={busyId}
              onLogSend={(input) =>
                void withBusy(
                  input.prospectId,
                  () => logSocialSend(input),
                  "Logged to the lead history.",
                )
              }
            />
          )}

          {tab === "report" && (
            <>
              <WeeklyReport report={report} />
              {!report && (
                <Card>
                  <CardBody className="flex items-center gap-2 text-sm text-ink-faint">
                    <Mail className="h-4 w-4" />
                    No activity to report yet.
                  </CardBody>
                </Card>
              )}
            </>
          )}
        </>
      )}
    </PageTransition>
  );
}
