import { workflow, node, links } from '@n8n-as-code/transformer';

// <workflow-map>
// Workflow : 08 - Email Pilot Health (Failures + Weekly Report)
// Nodes   : 8  |  Connections: 6
//
// NODE INDEX
// ──────────────────────────────────────────────────────────────────
// Property name                    Node type (short)         Flags
// DailyFailureCheck                  scheduleTrigger
// GetFailedSends                     httpRequest                [creds] [alwaysOutput]
// AnyFailures                        if
// AlertFailures                      telegram                   [creds]
// WeeklyReportTrigger                scheduleTrigger
// GetWeeklyMemberships               httpRequest                [creds] [alwaysOutput]
// BuildWeeklyReport                  code
// SendWeeklyReport                   telegram                   [creds]
//
// ROUTING MAP
// ──────────────────────────────────────────────────────────────────
// DailyFailureCheck
//    → GetFailedSends
//      → AnyFailures
//        → AlertFailures
// WeeklyReportTrigger
//    → GetWeeklyMemberships
//      → BuildWeeklyReport
//        → SendWeeklyReport
// </workflow-map>

// =====================================================================
// METADATA DU WORKFLOW
// =====================================================================

@workflow({
    id: 'qFYZcd8IfXrmUBdW',
    name: '08 - Email Pilot Health (Failures + Weekly Report)',
    active: false,
    isArchived: false,
    settings: { timezone: 'Africa/Johannesburg', executionOrder: 'v1', availableInMCP: false },
})
export class _08EmailPilotHealthFailuresWeeklyReportWorkflow {
    // =====================================================================
    // CONFIGURATION DES NOEUDS
    // =====================================================================

    @node({
        id: 'd4a6f3b1-0801-4d40-8054-8e3fab400001',
        name: 'Daily Failure Check',
        type: 'n8n-nodes-base.scheduleTrigger',
        version: 1.2,
        position: [-1060, 180],
    })
    DailyFailureCheck = {
        rule: {
            interval: [
                {
                    field: 'cronExpression',
                    expression: '0 15 * * 1-5',
                },
            ],
        },
    };

    @node({
        id: 'd4a6f3b1-0801-4d40-8054-8e3fab400002',
        name: 'Get Failed Sends',
        type: 'n8n-nodes-base.httpRequest',
        version: 4.4,
        position: [-840, 180],
        credentials: { supabaseApi: { id: 'wsbXBeC9kVgmn2L9', name: 'streamline-admin-supabse' } },
        alwaysOutputData: true,
    })
    GetFailedSends = {
        method: 'GET',
        url: '=https://lpjwfjkgqpgydzozuusj.supabase.co/rest/v1/campaign_memberships?status=in.(failed,sending)&channel=eq.email&updated_at=gte.{{ $now.minus({ days: 1 }).toISO() }}&select=id,status,last_error,updated_at&order=updated_at.desc&limit=25',
        authentication: 'predefinedCredentialType',
        nodeCredentialType: 'supabaseApi',
        sendHeaders: true,
        headerParameters: {
            parameters: [
                {
                    name: 'Accept-Profile',
                    value: 'streamline_hq',
                },
            ],
        },
        options: {},
    };

    @node({
        id: 'd4a6f3b1-0801-4d40-8054-8e3fab400003',
        name: 'Any Failures',
        type: 'n8n-nodes-base.if',
        version: 2,
        position: [-620, 180],
    })
    AnyFailures = {
        conditions: {
            options: {
                caseSensitive: true,
                leftValue: '',
                typeValidation: 'loose',
            },
            conditions: [
                {
                    id: 'cond-any-failures',
                    leftValue: '={{ Array.isArray($json) ? $json.length : ($json && $json.id ? 1 : 0) }}',
                    rightValue: 0,
                    operator: {
                        type: 'number',
                        operation: 'gt',
                    },
                },
            ],
            combinator: 'and',
        },
        options: {},
    };

    @node({
        id: 'd4a6f3b1-0801-4d40-8054-8e3fab400004',
        webhookId: '980afa80-373a-49c1-94c5-a2a619100b68',
        name: 'Alert Failures',
        type: 'n8n-nodes-base.telegram',
        version: 1.2,
        position: [-400, 100],
        credentials: { telegramApi: { id: 'NjP97V1NQwgzrpvC', name: 'Streamline Lead Bot' } },
    })
    AlertFailures = {
        resource: 'message',
        operation: 'sendMessage',
        chatId: '8713649240',
        text: `=⚠️ *Email pilot — send failures in the last 24h*

{{ (Array.isArray($json) ? $json : [$json]).map(r => '• ' + r.status + ' — ' + (r.last_error || 'claimed but never recorded')).join('\\n') }}

A row stuck in *sending* still holds a slot in today's cap. Check Streamline HQ → Email Pilot → Threads.`,
        additionalFields: {
            appendAttribution: false,
            parse_mode: 'Markdown',
        },
    };

    @node({
        id: 'd4a6f3b1-0801-4d40-8054-8e3fab400005',
        name: 'Weekly Report Trigger',
        type: 'n8n-nodes-base.scheduleTrigger',
        version: 1.2,
        position: [-1060, 480],
    })
    WeeklyReportTrigger = {
        rule: {
            interval: [
                {
                    field: 'cronExpression',
                    expression: '0 6 * * 1',
                },
            ],
        },
    };

    @node({
        id: 'd4a6f3b1-0801-4d40-8054-8e3fab400006',
        name: 'Get Weekly Memberships',
        type: 'n8n-nodes-base.httpRequest',
        version: 4.4,
        position: [-840, 480],
        credentials: { supabaseApi: { id: 'wsbXBeC9kVgmn2L9', name: 'streamline-admin-supabse' } },
        alwaysOutputData: true,
    })
    GetWeeklyMemberships = {
        method: 'GET',
        url: '=https://lpjwfjkgqpgydzozuusj.supabase.co/rest/v1/campaign_memberships?channel=eq.email&updated_at=gte.{{ $now.minus({ days: 7 }).toISO() }}&select=id,status,follow_up_step,last_sent_at,replied_at&limit=500',
        authentication: 'predefinedCredentialType',
        nodeCredentialType: 'supabaseApi',
        sendHeaders: true,
        headerParameters: {
            parameters: [
                {
                    name: 'Accept-Profile',
                    value: 'streamline_hq',
                },
            ],
        },
        options: {},
    };

    @node({
        id: 'd4a6f3b1-0801-4d40-8054-8e3fab400007',
        name: 'Build Weekly Report',
        type: 'n8n-nodes-base.code',
        version: 2,
        position: [-620, 480],
    })
    BuildWeeklyReport = {
        jsCode: `const response = $input.first().json;
const rows = Array.isArray(response) ? response : (response && response.id ? [response] : []);

const count = (predicate) => rows.filter(predicate).length;

const sent = count((r) => r.last_sent_at);
const replied = count((r) => r.replied_at);
const handovers = count((r) => r.status === 'handover');
const suppressed = count((r) => r.status === 'suppressed');
const closed = count((r) => r.status === 'closed_no_response');
const awaiting = count((r) => r.status === 'draft' || r.status === 'approved' || r.status === 'scheduled');
const failed = count((r) => r.status === 'failed');
const replyRate = sent > 0 ? Math.round((replied / sent) * 1000) / 10 : 0;

return [{ json: { sent, replied, replyRate, handovers, suppressed, closed, awaiting, failed } }];`,
    };

    @node({
        id: 'd4a6f3b1-0801-4d40-8054-8e3fab400008',
        webhookId: '8ad9fd0b-f91b-4e64-95da-0949e89eb7a4',
        name: 'Send Weekly Report',
        type: 'n8n-nodes-base.telegram',
        version: 1.2,
        position: [-400, 480],
        credentials: { telegramApi: { id: 'NjP97V1NQwgzrpvC', name: 'Streamline Lead Bot' } },
    })
    SendWeeklyReport = {
        resource: 'message',
        operation: 'sendMessage',
        chatId: '8713649240',
        text: `=📊 *Email pilot — last 7 days*

Sent: {{ $json.sent }}
Replies: {{ $json.replied }} ({{ $json.replyRate }}%)
Handovers: {{ $json.handovers }}
Opted out / suppressed: {{ $json.suppressed }}
Closed after 30 days: {{ $json.closed }}
Waiting on you: {{ $json.awaiting }}
Failed sends: {{ $json.failed }}`,
        additionalFields: {
            appendAttribution: false,
            parse_mode: 'Markdown',
        },
    };

    // =====================================================================
    // ROUTAGE ET CONNEXIONS
    // =====================================================================

    @links()
    defineRouting() {
        this.DailyFailureCheck.out(0).to(this.GetFailedSends.in(0));
        this.GetFailedSends.out(0).to(this.AnyFailures.in(0));
        this.AnyFailures.out(0).to(this.AlertFailures.in(0));
        this.WeeklyReportTrigger.out(0).to(this.GetWeeklyMemberships.in(0));
        this.GetWeeklyMemberships.out(0).to(this.BuildWeeklyReport.in(0));
        this.BuildWeeklyReport.out(0).to(this.SendWeeklyReport.in(0));
    }
}
