import { CheckCircle2, ShieldAlert } from "lucide-react";
import type { CampaignMembership, OutreachHandover } from "@/types/emailPilot";
import { HANDOVER_REASON_META } from "@/types/emailPilot";
import { Badge, Button, Card, CardBody, EmptyState } from "@/ui";

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("en-ZA", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default function HandoverList({
  handovers,
  memberships,
  busyId,
  onResolve,
}: {
  handovers: OutreachHandover[];
  memberships: CampaignMembership[];
  busyId: string | null;
  onResolve: (handoverId: string) => void;
}) {
  const open = handovers.filter((h) => h.status === "open");
  const resolved = handovers.filter((h) => h.status === "resolved").slice(0, 20);

  function businessFor(handover: OutreachHandover): string {
    const membership = memberships.find((m) => m.id === handover.campaign_membership_id);
    return membership?.prospect?.business_name ?? "Unknown business";
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-line bg-surface px-3 py-2.5 text-xs text-ink-faint">
        Every handover is answered by a person. The pilot never sends an automatic reply.
      </div>

      {open.length === 0 ? (
        <EmptyState
          icon={<CheckCircle2 className="h-6 w-6" />}
          title="No open handovers"
          body="Interested, question, complaint, opt-out, and unclear replies land here."
        />
      ) : (
        <div className="space-y-2">
          {open.map((handover) => {
            const meta = HANDOVER_REASON_META[handover.reason];
            return (
              <Card key={handover.id}>
                <CardBody className="space-y-2">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-ink">
                        {businessFor(handover)}
                      </div>
                      <div className="mt-0.5 text-xs text-ink-faint">
                        {formatDateTime(handover.created_at)}
                      </div>
                    </div>
                    <Badge tone={meta.tone}>
                      <ShieldAlert className="h-3 w-3" />
                      {meta.label}
                    </Badge>
                  </div>
                  {handover.summary && (
                    <p className="text-sm text-ink-muted">{handover.summary}</p>
                  )}
                  <Button
                    size="sm"
                    variant="secondary"
                    loading={busyId === handover.id}
                    onClick={() => onResolve(handover.id)}
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    Mark handled
                  </Button>
                </CardBody>
              </Card>
            );
          })}
        </div>
      )}

      {resolved.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-xs font-medium uppercase tracking-wide text-ink-faint">
            Recently handled
          </div>
          {resolved.map((handover) => (
            <div
              key={handover.id}
              className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-base px-3 py-2 text-sm"
            >
              <span className="min-w-0 flex-1 truncate text-ink-muted">
                {businessFor(handover)}
              </span>
              <Badge tone="neutral">{HANDOVER_REASON_META[handover.reason].label}</Badge>
              <span className="text-xs text-ink-faint">
                {handover.resolved_at ? formatDateTime(handover.resolved_at) : "—"}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
