import { workflow, node, links } from '@n8n-as-code/transformer';

// <workflow-map>
// Workflow : 07 - Email Pilot Follow-Ups (Business Days)
// Nodes   : 9  |  Connections: 9
//
// NODE INDEX
// ──────────────────────────────────────────────────────────────────
// Property name                    Node type (short)         Flags
// EveryWeekdayMorning                scheduleTrigger
// CloseStaleThreads                  httpRequest                [creds]
// GetFollowUpCandidates              httpRequest                [creds] [alwaysOutput]
// ParseCandidates                    code
// AnyCandidates                      if
// LoopCandidates                     splitInBatches
// QueueFollowUp                      httpRequest                [onError→regular] [creds]
// SummariseRun                       code
// NotifyFollowUps                    telegram                   [creds]
//
// ROUTING MAP
// ──────────────────────────────────────────────────────────────────
// EveryWeekdayMorning
//    → CloseStaleThreads
//      → GetFollowUpCandidates
//        → ParseCandidates
//          → AnyCandidates
//            → LoopCandidates
//              → SummariseRun
//                → NotifyFollowUps
//             .out(1) → QueueFollowUp
//                → LoopCandidates (↩ loop)
// </workflow-map>

// =====================================================================
// METADATA DU WORKFLOW
// =====================================================================

@workflow({
    id: 'Eh84jFt2FF7Kb42J',
    name: '07 - Email Pilot Follow-Ups (Business Days)',
    active: false,
    isArchived: false,
    settings: { timezone: 'Africa/Johannesburg', executionOrder: 'v1', availableInMCP: false },
})
export class _07EmailPilotFollowUpsBusinessDaysWorkflow {
    // =====================================================================
    // CONFIGURATION DES NOEUDS
    // =====================================================================

    @node({
        id: 'c3f5e2a0-0701-4c30-9f43-7d2e9a3f0001',
        name: 'Every Weekday Morning',
        type: 'n8n-nodes-base.scheduleTrigger',
        version: 1.2,
        position: [-1060, 300],
    })
    EveryWeekdayMorning = {
        rule: {
            interval: [
                {
                    field: 'cronExpression',
                    expression: '30 6 * * 1-5',
                },
            ],
        },
    };

    @node({
        id: 'c3f5e2a0-0701-4c30-9f43-7d2e9a3f0002',
        name: 'Close Stale Threads',
        type: 'n8n-nodes-base.httpRequest',
        version: 4.4,
        position: [-840, 300],
        credentials: { supabaseApi: { id: 'wsbXBeC9kVgmn2L9', name: 'streamline-admin-supabse' } },
    })
    CloseStaleThreads = {
        method: 'POST',
        url: 'https://lpjwfjkgqpgydzozuusj.supabase.co/rest/v1/rpc/close_stale_campaign_members',
        authentication: 'predefinedCredentialType',
        nodeCredentialType: 'supabaseApi',
        sendHeaders: true,
        headerParameters: {
            parameters: [
                {
                    name: 'Content-Type',
                    value: 'application/json',
                },
            ],
        },
        sendBody: true,
        specifyBody: 'json',
        jsonBody: '={{ JSON.stringify({ p_days: 30 }) }}',
        options: {},
    };

    @node({
        id: 'c3f5e2a0-0701-4c30-9f43-7d2e9a3f0003',
        name: 'Get Follow Up Candidates',
        type: 'n8n-nodes-base.httpRequest',
        version: 4.4,
        position: [-620, 300],
        credentials: { supabaseApi: { id: 'wsbXBeC9kVgmn2L9', name: 'streamline-admin-supabse' } },
        alwaysOutputData: true,
    })
    GetFollowUpCandidates = {
        method: 'GET',
        url: '=https://lpjwfjkgqpgydzozuusj.supabase.co/rest/v1/campaign_memberships?status=eq.sent&channel=eq.email&follow_up_step=lt.2&last_sent_at=lt.{{ $now.minus({ days: 3 }).toISO() }}&select=id,campaign_id,follow_up_step,last_sent_at&order=last_sent_at.asc&limit=25',
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
        id: 'c3f5e2a0-0701-4c30-9f43-7d2e9a3f0004',
        name: 'Parse Candidates',
        type: 'n8n-nodes-base.code',
        version: 2,
        position: [-400, 300],
    })
    ParseCandidates = {
        jsCode: `const response = $input.first().json;
const rows = Array.isArray(response) ? response : [];

if (rows.length === 0) {
  return [{ json: { has_candidates: false, count: 0 } }];
}

return rows.map((row) => ({
  json: {
    has_candidates: true,
    count: rows.length,
    membership_id: row.id,
    follow_up_step: row.follow_up_step,
  },
}));`,
    };

    @node({
        id: 'c3f5e2a0-0701-4c30-9f43-7d2e9a3f0005',
        name: 'Any Candidates',
        type: 'n8n-nodes-base.if',
        version: 2,
        position: [-180, 300],
    })
    AnyCandidates = {
        conditions: {
            options: {
                caseSensitive: true,
                leftValue: '',
                typeValidation: 'strict',
            },
            conditions: [
                {
                    id: 'cond-has-candidates',
                    leftValue: '={{ $json.has_candidates }}',
                    rightValue: true,
                    operator: {
                        type: 'boolean',
                        operation: 'equals',
                    },
                },
            ],
            combinator: 'and',
        },
        options: {},
    };

    @node({
        id: 'c3f5e2a0-0701-4c30-9f43-7d2e9a3f0006',
        name: 'Loop Candidates',
        type: 'n8n-nodes-base.splitInBatches',
        version: 3,
        position: [40, 300],
    })
    LoopCandidates = {
        options: {},
    };

    @node({
        id: 'c3f5e2a0-0701-4c30-9f43-7d2e9a3f0007',
        name: 'Queue Follow Up',
        type: 'n8n-nodes-base.httpRequest',
        version: 4.4,
        position: [260, 400],
        credentials: { supabaseApi: { id: 'wsbXBeC9kVgmn2L9', name: 'streamline-admin-supabse' } },
        onError: 'continueRegularOutput',
    })
    QueueFollowUp = {
        method: 'POST',
        url: 'https://lpjwfjkgqpgydzozuusj.supabase.co/rest/v1/rpc/queue_campaign_follow_up',
        authentication: 'predefinedCredentialType',
        nodeCredentialType: 'supabaseApi',
        sendHeaders: true,
        headerParameters: {
            parameters: [
                {
                    name: 'Content-Type',
                    value: 'application/json',
                },
            ],
        },
        sendBody: true,
        specifyBody: 'json',
        jsonBody: `={{ JSON.stringify({
  p_membership_id: $json.membership_id,
  p_subject_draft: null,
  p_draft_text: null,
  p_business_days: 3
}) }}`,
        options: {},
    };

    @node({
        id: 'c3f5e2a0-0701-4c30-9f43-7d2e9a3f0008',
        name: 'Summarise Run',
        type: 'n8n-nodes-base.code',
        version: 2,
        position: [260, 180],
    })
    SummariseRun = {
        jsCode: `const results = $input.all().map((item) => item.json);
const queued = results.filter((row) => row && row.follow_up_step).length;
const refused = results.length - queued;

let closed = 0;
try {
  const closeResult = $('Close Stale Threads').first().json;
  closed = typeof closeResult === 'number' ? closeResult : Number(closeResult) || 0;
} catch (error) {
  closed = 0;
}

return [{ json: { queued, refused, closed } }];`,
    };

    @node({
        id: 'c3f5e2a0-0701-4c30-9f43-7d2e9a3f0009',
        webhookId: '879d3804-1344-4013-b815-4572791fac6b',
        name: 'Notify Follow Ups',
        type: 'n8n-nodes-base.telegram',
        version: 1.2,
        position: [480, 180],
        credentials: { telegramApi: { id: 'NjP97V1NQwgzrpvC', name: 'Streamline Lead Bot' } },
    })
    NotifyFollowUps = {
        resource: 'message',
        operation: 'sendMessage',
        chatId: '8713649240',
        text: `=🔁 *Email pilot — follow-up sweep*

Queued for approval: {{ $json.queued }}
Skipped (replied or suppressed): {{ $json.refused }}
Closed after 30 days: {{ $json.closed }}

Follow-up drafts still need your approval before anything sends.`,
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
        this.EveryWeekdayMorning.out(0).to(this.CloseStaleThreads.in(0));
        this.CloseStaleThreads.out(0).to(this.GetFollowUpCandidates.in(0));
        this.GetFollowUpCandidates.out(0).to(this.ParseCandidates.in(0));
        this.ParseCandidates.out(0).to(this.AnyCandidates.in(0));
        this.AnyCandidates.out(0).to(this.LoopCandidates.in(0));
        this.LoopCandidates.out(0).to(this.SummariseRun.in(0));
        this.LoopCandidates.out(1).to(this.QueueFollowUp.in(0));
        this.QueueFollowUp.out(0).to(this.LoopCandidates.in(0));
        this.SummariseRun.out(0).to(this.NotifyFollowUps.in(0));
    }
}
