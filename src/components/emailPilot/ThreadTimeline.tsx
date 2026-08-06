import { useMemo, useState } from "react";
import { ArrowDownLeft, ArrowUpRight, Inbox, RotateCcw } from "lucide-react";
import type { CampaignMembership, PilotMessage } from "@/types/emailPilot";
import { MEMBERSHIP_STATUS_META } from "@/types/emailPilot";
import { Badge, Button, Card, CardBody, EmptyState } from "@/ui";

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("en-ZA", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default function ThreadTimeline({
  memberships,
  messages,
  busyId,
  onFollowUp,
}: {
  memberships: CampaignMembership[];
  messages: PilotMessage[];
  busyId: string | null;
  onFollowUp: (membershipId: string) => void;
}) {
  const [openId, setOpenId] = useState<string | null>(null);

  const byMembership = useMemo(() => {
    const map = new Map<string, PilotMessage[]>();
    for (const message of messages) {
      if (!message.campaign_membership_id) continue;
      const list = map.get(message.campaign_membership_id) ?? [];
      list.push(message);
      map.set(message.campaign_membership_id, list);
    }
    return map;
  }, [messages]);

  const threads = useMemo(
    () =>
      memberships
        .filter((m) => m.last_sent_at || byMembership.has(m.id))
        .sort((a, b) =>
          (b.last_sent_at ?? b.updated_at).localeCompare(a.last_sent_at ?? a.updated_at),
        ),
    [memberships, byMembership],
  );

  if (threads.length === 0) {
    return (
      <EmptyState
        icon={<Inbox className="h-6 w-6" />}
        title="No threads yet"
        body="Once an approved email is sent, its full thread appears here."
      />
    );
  }

  return (
    <div className="space-y-3">
      {threads.map((membership) => {
        const thread = byMembership.get(membership.id) ?? [];
        const meta = MEMBERSHIP_STATUS_META[membership.status];
        const open = openId === membership.id;
        const hasReply = thread.some((m) => m.direction === "inbound");
        return (
          <Card key={membership.id}>
            <CardBody className="space-y-3">
              <button
                type="button"
                onClick={() => setOpenId(open ? null : membership.id)}
                className="flex w-full flex-wrap items-center justify-between gap-2 text-left"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-ink">
                    {membership.prospect?.business_name ?? "Unknown business"}
                  </div>
                  <div className="mt-0.5 truncate text-xs text-ink-faint">
                    {membership.prospect?.email ?? "—"}
                    {membership.last_sent_at && ` · sent ${formatDateTime(membership.last_sent_at)}`}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {membership.follow_up_step > 0 && (
                    <Badge tone="warn">FU #{membership.follow_up_step}</Badge>
                  )}
                  <Badge tone={meta.tone}>{meta.label}</Badge>
                </div>
              </button>

              {membership.last_error && (
                <div className="rounded-xl border border-danger/30 bg-danger-soft px-3 py-2 text-xs text-danger">
                  {membership.last_error}
                </div>
              )}

              {open && (
                <div className="space-y-2 border-t border-line pt-3">
                  {thread.length === 0 ? (
                    <p className="text-xs text-ink-faint">
                      No provider messages recorded for this thread yet.
                    </p>
                  ) : (
                    thread.map((message) => (
                      <div
                        key={message.id}
                        className="rounded-xl border border-line bg-base px-3 py-2.5"
                      >
                        <div className="flex flex-wrap items-center gap-2 text-xs text-ink-faint">
                          {message.direction === "outbound" ? (
                            <ArrowUpRight className="h-3.5 w-3.5 text-brand" />
                          ) : (
                            <ArrowDownLeft className="h-3.5 w-3.5 text-accent" />
                          )}
                          <span>{formatDateTime(message.sent_at)}</span>
                          {message.delivery_status && (
                            <Badge tone="neutral">{message.delivery_status}</Badge>
                          )}
                          {message.classification && (
                            <Badge tone="accent">{message.classification}</Badge>
                          )}
                        </div>
                        {message.subject && (
                          <div className="mt-1.5 text-sm font-medium text-ink">
                            {message.subject}
                          </div>
                        )}
                        <p className="mt-1 whitespace-pre-wrap text-sm text-ink-muted">
                          {message.message_text}
                        </p>
                        {message.summary && (
                          <p className="mt-1.5 text-xs text-ink-faint">{message.summary}</p>
                        )}
                      </div>
                    ))
                  )}

                  {membership.status === "sent" && !hasReply && (
                    <Button
                      size="sm"
                      variant="secondary"
                      loading={busyId === membership.id}
                      onClick={() => onFollowUp(membership.id)}
                    >
                      <RotateCcw className="h-4 w-4" />
                      Queue follow-up for approval
                    </Button>
                  )}
                </div>
              )}
            </CardBody>
          </Card>
        );
      })}
    </div>
  );
}
