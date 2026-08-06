import type { WeeklyReport as WeeklyReportData } from "@/lib/emailPilot";
import { Card, CardBody, CardHeader, Stat } from "@/ui";

export default function WeeklyReport({ report }: { report: WeeklyReportData | null }) {
  if (!report) return null;

  const replyRate =
    report.sent > 0 ? Math.round((report.replied / report.sent) * 1000) / 10 : 0;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="Last 7 days"
          subtitle={`Since ${new Intl.DateTimeFormat("en-ZA", { dateStyle: "medium" }).format(
            new Date(report.since),
          )}`}
        />
        <CardBody>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Stat label="Imported" value={report.imported} />
            <Stat label="Approved" value={report.approved} tone="brand" />
            <Stat label="Sent" value={report.sent} tone="success" />
            <Stat label="Replied" value={report.replied} tone="accent" hint={`${replyRate}% reply rate`} />
            <Stat label="Handovers" value={report.handovers} tone="accent" />
            <Stat label="Opt-outs" value={report.optOuts} tone="danger" />
          </div>
          {report.failures > 0 && (
            <div className="mt-3 rounded-xl border border-danger/30 bg-danger-soft px-3 py-2.5 text-sm text-danger">
              {report.failures} send{report.failures === 1 ? "" : "s"} failed this week —
              check the Threads tab for the provider error.
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
