import { useMemo, useState } from "react";
import { Check, ExternalLink, Facebook, Instagram, Search } from "lucide-react";
import { socialProfileUrl } from "@/lib/emailPilot";
import type { Prospect } from "@/types/leadEngine";
import { Badge, Button, Card, CardBody, EmptyState, Input, Textarea } from "@/ui";

function suggestedMessage(prospect: Prospect): string {
  const place = prospect.suburb ? ` in ${prospect.suburb}` : "";
  return `Hey! Came across ${prospect.business_name}${place} — the food looks great, but I couldn't find a menu or website anywhere.

I build simple restaurant sites (menu, photos, hours, directions). Happy to put a free mock-up together so you can see it with your own photos — no obligation.`;
}

export default function SocialQueue({
  prospects,
  busyId,
  onLogSend,
}: {
  prospects: Prospect[];
  busyId: string | null;
  onLogSend: (input: {
    prospectId: string;
    platform: "instagram" | "facebook";
    body: string;
  }) => void;
}) {
  const [search, setSearch] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return prospects;
    return prospects.filter((p) => p.business_name.toLowerCase().includes(term));
  }, [prospects, search]);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-line bg-surface px-3 py-2.5 text-xs text-ink-faint">
        Instagram and Facebook stay fully manual. Send from your own account, then log it
        here so it joins the same lead history as the email pilot.
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search businesses"
          className="pl-9"
        />
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<Instagram className="h-6 w-6" />}
          title="No social prospects"
          body="Prospects with an Instagram or Facebook handle appear here."
        />
      ) : (
        filtered.map((prospect) => {
          const instagram = socialProfileUrl(prospect.instagram_handle, "instagram");
          const facebook = socialProfileUrl(prospect.facebook_handle, "facebook");
          const draft = drafts[prospect.id] ?? suggestedMessage(prospect);
          const busy = busyId === prospect.id;
          return (
            <Card key={prospect.id}>
              <CardBody className="space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-ink">
                      {prospect.business_name}
                    </div>
                    {prospect.suburb && (
                      <div className="mt-0.5 text-xs text-ink-faint">{prospect.suburb}</div>
                    )}
                  </div>
                  {prospect.popia_optout && <Badge tone="danger">Opted out</Badge>}
                </div>

                <div className="flex flex-wrap gap-2">
                  {instagram && (
                    <a
                      href={instagram}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-base px-2.5 py-1.5 text-xs text-ink-muted transition hover:text-ink"
                    >
                      <Instagram className="h-3.5 w-3.5" />
                      Instagram
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                  {facebook && (
                    <a
                      href={facebook}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-base px-2.5 py-1.5 text-xs text-ink-muted transition hover:text-ink"
                    >
                      <Facebook className="h-3.5 w-3.5" />
                      Facebook
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>

                <Textarea
                  rows={6}
                  value={draft}
                  onChange={(event) =>
                    setDrafts((current) => ({ ...current, [prospect.id]: event.target.value }))
                  }
                />

                <div className="flex flex-wrap gap-2">
                  {instagram && (
                    <Button
                      size="sm"
                      variant="secondary"
                      loading={busy}
                      onClick={() =>
                        onLogSend({
                          prospectId: prospect.id,
                          platform: "instagram",
                          body: draft,
                        })
                      }
                    >
                      <Check className="h-4 w-4" />
                      Log Instagram send
                    </Button>
                  )}
                  {facebook && (
                    <Button
                      size="sm"
                      variant="secondary"
                      loading={busy}
                      onClick={() =>
                        onLogSend({
                          prospectId: prospect.id,
                          platform: "facebook",
                          body: draft,
                        })
                      }
                    >
                      <Check className="h-4 w-4" />
                      Log Facebook send
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
