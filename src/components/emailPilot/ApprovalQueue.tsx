import { useMemo, useState } from "react";
import {
  Ban,
  Check,
  Clock3,
  ExternalLink,
  Globe,
  MapPin,
  PauseCircle,
  PlayCircle,
  SkipForward,
  Sparkles,
  Star,
} from "lucide-react";
import { defaultFollowUpEmail, defaultRestaurantEmail } from "@/lib/emailPilot";
import type { CampaignMembership, OutreachCampaign } from "@/types/emailPilot";
import { MEMBERSHIP_STATUS_META } from "@/types/emailPilot";
import {
  Badge,
  Button,
  Card,
  CardBody,
  EmptyState,
  Field,
  Input,
  Textarea,
} from "@/ui";

export type ApprovalAction =
  | { kind: "approve"; membershipId: string; subject: string; body: string }
  | { kind: "skip"; membershipId: string }
  | { kind: "suppress"; membershipId: string; prospectId: string };

function ResearchCard({ membership }: { membership: CampaignMembership }) {
  const prospect = membership.prospect;
  if (!prospect) return null;
  const website = prospect.website;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-ink-faint">
      {prospect.suburb && (
        <span className="inline-flex items-center gap-1">
          <MapPin className="h-3.5 w-3.5" />
          {prospect.suburb}
        </span>
      )}
      {prospect.google_rating != null && (
        <span className="inline-flex items-center gap-1">
          <Star className="h-3.5 w-3.5" />
          {prospect.google_rating}
          {prospect.google_reviews_count != null && ` (${prospect.google_reviews_count})`}
        </span>
      )}
      <span className="inline-flex items-center gap-1">
        <Globe className="h-3.5 w-3.5" />
        {website ? (
          <a
            href={website.startsWith("http") ? website : `https://${website}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-brand hover:underline"
          >
            Has a site
            <ExternalLink className="h-3 w-3" />
          </a>
        ) : (
          "No website found"
        )}
      </span>
      {membership.follow_up_step > 0 && (
        <Badge tone="warn">Follow-up #{membership.follow_up_step}</Badge>
      )}
    </div>
  );
}

export default function ApprovalQueue({
  campaign,
  memberships,
  busyId,
  onAction,
  onSetActive,
}: {
  campaign: OutreachCampaign | null;
  memberships: CampaignMembership[];
  busyId: string | null;
  onAction: (action: ApprovalAction) => void;
  onSetActive: (active: boolean) => void;
}) {
  const [drafts, setDrafts] = useState<Record<string, { subject: string; body: string }>>({});
  const [nonce, setNonce] = useState<Record<string, number>>({});

  const drafted = useMemo(
    () => memberships.filter((m) => m.status === "draft"),
    [memberships],
  );

  const sentToday = useMemo(() => {
    const today = new Date().toDateString();
    return memberships.filter(
      (m) => m.last_sent_at && new Date(m.last_sent_at).toDateString() === today,
    ).length;
  }, [memberships]);

  const remaining = Math.max((campaign?.daily_limit ?? 5) - sentToday, 0);
  const queue = drafted.slice(0, Math.max(remaining, 0) || drafted.length);

  function draftFor(membership: CampaignMembership) {
    const existing = drafts[membership.id];
    if (existing) return existing;
    if (membership.subject_draft || membership.draft_text) {
      return {
        subject: membership.subject_draft ?? "",
        body: membership.draft_text ?? "",
      };
    }
    const prospect = membership.prospect;
    if (!prospect) return { subject: "", body: "" };
    return membership.follow_up_step > 0
      ? defaultFollowUpEmail(prospect, membership.follow_up_step)
      : defaultRestaurantEmail(prospect);
  }

  function setDraft(id: string, patch: Partial<{ subject: string; body: string }>) {
    setDrafts((current) => {
      const base = current[id] ?? { subject: "", body: "" };
      return { ...current, [id]: { ...base, ...patch } };
    });
  }

  function regenerate(membership: CampaignMembership) {
    const prospect = membership.prospect;
    if (!prospect) return;
    const fresh =
      membership.follow_up_step > 0
        ? defaultFollowUpEmail(prospect, membership.follow_up_step)
        : defaultRestaurantEmail(prospect);
    setDrafts((current) => ({ ...current, [membership.id]: fresh }));
    setNonce((current) => ({ ...current, [membership.id]: (current[membership.id] ?? 0) + 1 }));
  }

  if (!campaign) {
    return (
      <EmptyState
        title="No campaign yet"
        body="Create an email campaign to start building the daily approval queue."
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-surface px-4 py-3">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Badge tone={campaign.active ? "success" : "neutral"}>
            {campaign.active ? "Active" : "Inactive"}
          </Badge>
          <span className="text-ink-muted">
            {sentToday} of {campaign.daily_limit} sent today
          </span>
          <span className="text-ink-faint">·</span>
          <span className="text-ink-faint">
            {campaign.business_start.slice(0, 5)}–{campaign.business_end.slice(0, 5)} SAST
          </span>
          {campaign.paused_at && <Badge tone="warn">Paused</Badge>}
        </div>
        {campaign.active ? (
          <Button
            variant="secondary"
            size="sm"
            loading={busyId === campaign.id}
            onClick={() => onSetActive(false)}
          >
            <PauseCircle className="h-4 w-4" />
            Pause sending
          </Button>
        ) : (
          <Button
            size="sm"
            loading={busyId === campaign.id}
            onClick={() => onSetActive(true)}
          >
            <PlayCircle className="h-4 w-4" />
            Activate sending
          </Button>
        )}
      </div>

      {!campaign.active && (
        <p className="text-xs text-ink-faint">
          Approving queues a message but sends nothing. Nothing leaves until you
          activate sending.
        </p>
      )}

      {remaining === 0 && drafted.length > 0 && (
        <div className="flex items-center gap-2 rounded-xl border border-warn/30 bg-warn-soft px-3 py-2.5 text-sm text-warn">
          <Clock3 className="h-4 w-4 shrink-0" />
          The daily cap is used up. Remaining drafts stay queued for tomorrow.
        </div>
      )}

      {queue.length === 0 ? (
        <EmptyState
          icon={<Check className="h-6 w-6" />}
          title="Nothing waiting for approval"
          body="Import contacts or queue a follow-up to fill the queue."
        />
      ) : (
        queue.map((membership) => {
          const draft = draftFor(membership);
          const prospect = membership.prospect;
          const busy = busyId === membership.id;
          const meta = MEMBERSHIP_STATUS_META[membership.status];
          return (
            <Card key={`${membership.id}-${nonce[membership.id] ?? 0}`}>
              <CardBody className="space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-ink">
                      {prospect?.business_name ?? "Unknown business"}
                    </div>
                    <div className="mt-0.5 truncate text-xs text-ink-faint">
                      {prospect?.email ?? "No email"}
                    </div>
                  </div>
                  <Badge tone={meta.tone}>{meta.label}</Badge>
                </div>

                <ResearchCard membership={membership} />

                <Field label="Subject">
                  <Input
                    value={draft.subject}
                    onChange={(event) =>
                      setDraft(membership.id, { subject: event.target.value })
                    }
                    placeholder="Subject line"
                  />
                </Field>

                <Field label="Message">
                  <Textarea
                    rows={11}
                    value={draft.body}
                    onChange={(event) => setDraft(membership.id, { body: event.target.value })}
                    placeholder="Message body"
                  />
                </Field>

                <div className="rounded-xl border border-line bg-base px-3 py-2 text-xs text-ink-faint">
                  <span className="font-medium text-ink-muted">Footer appended on send:</span>{" "}
                  {campaign.signature_footer}
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    loading={busy}
                    disabled={!draft.subject.trim() || !draft.body.trim()}
                    onClick={() =>
                      onAction({
                        kind: "approve",
                        membershipId: membership.id,
                        subject: draft.subject.trim(),
                        body: draft.body.trim(),
                      })
                    }
                  >
                    <Check className="h-4 w-4" />
                    Approve &amp; schedule
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={busy}
                    onClick={() => regenerate(membership)}
                  >
                    <Sparkles className="h-4 w-4" />
                    Research again
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => onAction({ kind: "skip", membershipId: membership.id })}
                  >
                    <SkipForward className="h-4 w-4" />
                    Skip
                  </Button>
                  {prospect && (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      className="text-danger hover:text-danger"
                      onClick={() =>
                        onAction({
                          kind: "suppress",
                          membershipId: membership.id,
                          prospectId: prospect.id,
                        })
                      }
                    >
                      <Ban className="h-4 w-4" />
                      Suppress
                    </Button>
                  )}
                </div>
              </CardBody>
            </Card>
          );
        })
      )}
    </div>
  );
}
