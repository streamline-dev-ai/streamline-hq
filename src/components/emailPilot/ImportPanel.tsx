import { useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Copy, FileUp, Ban } from "lucide-react";
import { importProspects, loadImportBatches, parseSpreadsheet } from "@/lib/emailPilot";
import type { ImportBatch, ImportSummary, OutreachCampaign } from "@/types/emailPilot";
import { Badge, Button, Card, CardBody, CardHeader, EmptyState, Stat } from "@/ui";

const STATUS_TONE = {
  accepted: "success",
  invalid: "danger",
  duplicate: "warn",
  suppressed: "neutral",
} as const;

export default function ImportPanel({
  campaign,
  batches,
  onImported,
  onError,
}: {
  campaign: OutreachCampaign | null;
  batches: ImportBatch[];
  onImported: (summary: ImportSummary, batches: ImportBatch[]) => void;
  onError: (message: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<ImportSummary | null>(null);

  async function handleFile(file: File) {
    if (!campaign) {
      onError("Create a campaign before importing contacts.");
      return;
    }
    setBusy(true);
    setSummary(null);
    try {
      const rows = parseSpreadsheet(await file.arrayBuffer());
      if (rows.length === 0) {
        onError("That file has no rows.");
        return;
      }
      const result = await importProspects({
        campaignId: campaign.id,
        filename: file.name,
        rows,
      });
      setSummary(result);
      onImported(result, await loadImportBatches());
    } catch (error) {
      onError(error instanceof Error ? error.message : "Import failed");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  const problemRows = summary?.rows.filter((row) => row.status !== "accepted") ?? [];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="Import contacts"
          subtitle="CSV or XLSX. Rows are validated one at a time — a bad row never discards the good ones."
        />
        <CardBody className="space-y-4">
          <input
            ref={inputRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void handleFile(file);
            }}
          />
          <div className="flex flex-wrap items-center gap-3">
            <Button
              onClick={() => inputRef.current?.click()}
              loading={busy}
              disabled={!campaign}
            >
              <FileUp className="h-4 w-4" />
              Choose file
            </Button>
            <p className="text-xs text-ink-faint">
              Recognised columns: business_name, email, owner, suburb, phone, website,
              instagram, facebook, niche.
            </p>
          </div>
          {!campaign && (
            <p className="text-xs text-warn">
              No email campaign exists yet. Create one first — it starts inactive.
            </p>
          )}
        </CardBody>
      </Card>

      {summary && (
        <Card>
          <CardHeader
            title="Last import"
            subtitle={`${summary.total} row${summary.total === 1 ? "" : "s"} processed`}
          />
          <CardBody className="space-y-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Accepted" value={summary.accepted} tone="success" />
              <Stat label="Invalid" value={summary.invalid} tone="danger" />
              <Stat label="Duplicate" value={summary.duplicate} tone="warn" />
              <Stat label="Suppressed" value={summary.suppressed} />
            </div>

            {problemRows.length === 0 ? (
              <div className="flex items-center gap-2 rounded-xl border border-success/30 bg-success-soft px-3 py-2.5 text-sm text-success">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                Every row was accepted and queued as a draft.
              </div>
            ) : (
              <div className="space-y-2">
                <div className="text-xs font-medium uppercase tracking-wide text-ink-faint">
                  Rows needing attention
                </div>
                <div className="space-y-1.5">
                  {problemRows.map((row) => (
                    <div
                      key={row.row_number}
                      className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-base px-3 py-2 text-sm"
                    >
                      <span className="tabular-nums text-ink-faint">#{row.row_number}</span>
                      <Badge tone={STATUS_TONE[row.status]}>{row.status}</Badge>
                      <span className="min-w-0 truncate text-ink">
                        {row.business_name ?? "—"}
                        {row.email ? ` · ${row.email}` : ""}
                      </span>
                      <span className="w-full text-xs text-ink-faint">
                        {row.issues.join("; ")}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader title="Import history" />
        <CardBody>
          {batches.length === 0 ? (
            <EmptyState
              icon={<FileUp className="h-6 w-6" />}
              title="No imports yet"
              body="Batch results are kept so you can audit exactly what entered the pilot."
            />
          ) : (
            <div className="space-y-2">
              {batches.map((batch) => (
                <div
                  key={batch.id}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-line bg-base px-3 py-2.5 text-sm"
                >
                  <span className="min-w-0 flex-1 truncate font-medium text-ink">
                    {batch.source_filename ?? "Untitled file"}
                  </span>
                  <span className="flex items-center gap-1 text-xs text-success">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    {batch.accepted_rows}
                  </span>
                  <span className="flex items-center gap-1 text-xs text-danger">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    {batch.rejected_rows}
                  </span>
                  <span className="flex items-center gap-1 text-xs text-warn">
                    <Copy className="h-3.5 w-3.5" />
                    {batch.duplicate_rows}
                  </span>
                  <span className="flex items-center gap-1 text-xs text-ink-faint">
                    <Ban className="h-3.5 w-3.5" />
                    {batch.suppressed_rows}
                  </span>
                  <span className="text-xs text-ink-faint">
                    {new Date(batch.created_at).toLocaleDateString("en-ZA")}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
