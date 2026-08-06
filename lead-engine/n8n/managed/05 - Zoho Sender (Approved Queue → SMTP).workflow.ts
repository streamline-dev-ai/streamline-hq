import { workflow, node, links } from '@n8n-as-code/transformer';

// <workflow-map>
// Workflow : 05 - Zoho Sender (Approved Queue → SMTP)
// Nodes   : 14  |  Connections: 16
//
// NODE INDEX
// ──────────────────────────────────────────────────────────────────
// Property name                    Node type (short)         Flags
// EveryFifteenMinutes                scheduleTrigger
// Config                             set
// GetActiveCampaigns                 httpRequest                [creds]
// ParseCampaigns                     code
// AnyActiveCampaign                  if
// LoopCampaigns                      splitInBatches
// ClaimNextSend                      httpRequest                [creds]
// ParseClaim                         code
// HasClaim                           if
// BuildEmail                         code
// SendZohoEmail                      emailSend                  [onError→out(1)] [creds] [retry]
// RecordSendSuccess                  httpRequest                [creds]
// RecordSendFailure                  httpRequest                [creds]
// PauseBetweenSends                  wait
//
// ROUTING MAP
// ──────────────────────────────────────────────────────────────────
// EveryFifteenMinutes
//    → Config
//      → GetActiveCampaigns
//        → ParseCampaigns
//          → AnyActiveCampaign
//            → LoopCampaigns
//             .out(1) → ClaimNextSend
//                → ParseClaim
//                  → HasClaim
//                    → BuildEmail
//                      → SendZohoEmail
//                        → RecordSendSuccess
//                          → PauseBetweenSends
//                            → ClaimNextSend (↩ loop)
//                       .out(1) → RecordSendFailure
//                          → PauseBetweenSends (↩ loop)
//                   .out(1) → LoopCampaigns (↩ loop)
// </workflow-map>

// =====================================================================
// METADATA DU WORKFLOW
// =====================================================================

@workflow({
    id: 'OU1UlkbRVW1mCcRy',
    name: '05 - Zoho Sender (Approved Queue → SMTP)',
    active: false,
    isArchived: false,
    settings: { timezone: 'Africa/Johannesburg', executionOrder: 'v1', availableInMCP: false },
})
export class _05ZohoSenderApprovedQueueSmtpWorkflow {
    // =====================================================================
    // CONFIGURATION DES NOEUDS
    // =====================================================================

    @node({
        id: 'a1f3c0de-0501-4a10-9d21-5b0c7f1e0001',
        name: 'Every Fifteen Minutes',
        type: 'n8n-nodes-base.scheduleTrigger',
        version: 1.2,
        position: [-1120, 300],
    })
    EveryFifteenMinutes = {
        rule: {
            interval: [
                {
                    field: 'cronExpression',
                    expression: '*/15 5-16 * * 1-5',
                },
            ],
        },
    };

    @node({
        id: 'a1f3c0de-0501-4a10-9d21-5b0c7f1e0002',
        name: 'Config',
        type: 'n8n-nodes-base.set',
        version: 3.4,
        position: [-900, 300],
    })
    Config = {
        assignments: {
            assignments: [
                {
                    id: 'cfg-rest',
                    name: 'rest_url',
                    value: 'https://lpjwfjkgqpgydzozuusj.supabase.co/rest/v1',
                    type: 'string',
                },
            ],
        },
        options: {},
    };

    @node({
        id: 'a1f3c0de-0501-4a10-9d21-5b0c7f1e0003',
        name: 'Get Active Campaigns',
        type: 'n8n-nodes-base.httpRequest',
        version: 4.4,
        position: [-680, 300],
        credentials: { supabaseApi: { id: 'wsbXBeC9kVgmn2L9', name: 'streamline-admin-supabse' } },
    })
    GetActiveCampaigns = {
        method: 'GET',
        url: '={{ $json.rest_url }}/outreach_campaigns?channel=eq.email&active=is.true&paused_at=is.null&select=id,name',
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
        id: 'a1f3c0de-0501-4a10-9d21-5b0c7f1e0004',
        name: 'Parse Campaigns',
        type: 'n8n-nodes-base.code',
        version: 2,
        position: [-460, 300],
    })
    ParseCampaigns = {
        jsCode: `const restUrl = $('Config').first().json.rest_url;
const response = $input.first().json;
const campaigns = Array.isArray(response) ? response : [];

if (campaigns.length === 0) {
  return [{ json: { has_campaigns: false, rest_url: restUrl } }];
}

return campaigns.map((campaign) => ({
  json: { has_campaigns: true, rest_url: restUrl, campaign_id: campaign.id, campaign_name: campaign.name },
}));`,
    };

    @node({
        id: 'a1f3c0de-0501-4a10-9d21-5b0c7f1e0005',
        name: 'Any Active Campaign',
        type: 'n8n-nodes-base.if',
        version: 2,
        position: [-240, 300],
    })
    AnyActiveCampaign = {
        conditions: {
            options: {
                caseSensitive: true,
                leftValue: '',
                typeValidation: 'strict',
            },
            conditions: [
                {
                    id: 'cond-has-campaigns',
                    leftValue: '={{ $json.has_campaigns }}',
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
        id: 'a1f3c0de-0501-4a10-9d21-5b0c7f1e0006',
        name: 'Loop Campaigns',
        type: 'n8n-nodes-base.splitInBatches',
        version: 3,
        position: [-20, 300],
    })
    LoopCampaigns = {
        options: {},
    };

    @node({
        id: 'a1f3c0de-0501-4a10-9d21-5b0c7f1e0007',
        name: 'Claim Next Send',
        type: 'n8n-nodes-base.httpRequest',
        version: 4.4,
        position: [200, 400],
        credentials: { supabaseApi: { id: 'wsbXBeC9kVgmn2L9', name: 'streamline-admin-supabse' } },
    })
    ClaimNextSend = {
        method: 'POST',
        url: "={{ $('Config').first().json.rest_url }}/rpc/claim_due_campaign_send",
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
        jsonBody: "={{ JSON.stringify({ p_campaign_id: $('Loop Campaigns').item.json.campaign_id }) }}",
        options: {},
    };

    @node({
        id: 'a1f3c0de-0501-4a10-9d21-5b0c7f1e0008',
        name: 'Parse Claim',
        type: 'n8n-nodes-base.code',
        version: 2,
        position: [420, 400],
    })
    ParseClaim = {
        jsCode: `// claim_due_campaign_send returns a set: zero rows means "nothing to send".
const response = $input.first().json;
const rows = Array.isArray(response) ? response : (response ? [response] : []);
const claim = rows.find((row) => row && row.membership_id);

if (!claim) {
  return [{ json: { claimed: false } }];
}

return [{ json: { ...claim, claimed: true } }];`,
    };

    @node({
        id: 'a1f3c0de-0501-4a10-9d21-5b0c7f1e0009',
        name: 'Has Claim',
        type: 'n8n-nodes-base.if',
        version: 2,
        position: [640, 400],
    })
    HasClaim = {
        conditions: {
            options: {
                caseSensitive: true,
                leftValue: '',
                typeValidation: 'strict',
            },
            conditions: [
                {
                    id: 'cond-claimed',
                    leftValue: '={{ $json.claimed }}',
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
        id: 'a1f3c0de-0501-4a10-9d21-5b0c7f1e0010',
        name: 'Build Email',
        type: 'n8n-nodes-base.code',
        version: 2,
        position: [860, 300],
    })
    BuildEmail = {
        jsCode: `const claim = $input.first().json;

if (!claim.approved_text || !claim.approved_subject) {
  throw new Error('Claimed send is missing approved subject or body');
}
if (!claim.recipient_email) {
  throw new Error('Claimed send has no recipient email');
}

const footer = (claim.signature_footer || '').trim();
const body = footer
  ? claim.approved_text.trimEnd() + '\\n\\n—\\n' + footer
  : claim.approved_text.trimEnd();

const displayName = claim.sender_display_name || 'Streamline Automations';
const senderEmail = claim.sender_identity;
if (!senderEmail) {
  throw new Error('Campaign has no sender identity configured');
}

return [{
  json: {
    membership_id: claim.membership_id,
    approved_version: claim.approved_version,
    provider_thread_id: claim.provider_thread_id || null,
    from_email: displayName + ' <' + senderEmail + '>',
    reply_to: claim.reply_to || senderEmail,
    to_email: claim.recipient_email,
    subject: claim.approved_subject,
    body,
  },
}];`,
    };

    @node({
        id: 'a1f3c0de-0501-4a10-9d21-5b0c7f1e0011',
        webhookId: 'da89d883-8e92-4431-a5cb-b29d82d804a5',
        name: 'Send Zoho Email',
        type: 'n8n-nodes-base.emailSend',
        version: 2.1,
        position: [1080, 300],
        credentials: { smtp: { id: 'sAbC7LSfFcC2ZZWb', name: 'Zoho SMTP - Streamline Outreach' } },
        onError: 'continueErrorOutput',
        retryOnFail: true,
        maxTries: 3,
        waitBetweenTries: 5000,
    })
    SendZohoEmail = {
        fromEmail: '={{ $json.from_email }}',
        toEmail: '={{ $json.to_email }}',
        subject: '={{ $json.subject }}',
        message: '={{ $json.body }}',
        emailFormat: 'text',
        options: {
            replyTo: '={{ $json.reply_to }}',
            appendAttribution: false,
        },
    };

    @node({
        id: 'a1f3c0de-0501-4a10-9d21-5b0c7f1e0012',
        name: 'Record Send Success',
        type: 'n8n-nodes-base.httpRequest',
        version: 4.4,
        position: [1300, 200],
        credentials: { supabaseApi: { id: 'wsbXBeC9kVgmn2L9', name: 'streamline-admin-supabse' } },
    })
    RecordSendSuccess = {
        method: 'POST',
        url: "={{ $('Config').first().json.rest_url }}/rpc/record_campaign_provider_result",
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
  p_membership_id: $('Build Email').item.json.membership_id,
  p_approved_version: $('Build Email').item.json.approved_version,
  p_provider_message_id: $json.messageId,
  p_provider_thread_id: $('Build Email').item.json.provider_thread_id,
  p_success: true,
  p_error: null
}) }}`,
        options: {},
    };

    @node({
        id: 'a1f3c0de-0501-4a10-9d21-5b0c7f1e0013',
        name: 'Record Send Failure',
        type: 'n8n-nodes-base.httpRequest',
        version: 4.4,
        position: [1300, 420],
        credentials: { supabaseApi: { id: 'wsbXBeC9kVgmn2L9', name: 'streamline-admin-supabse' } },
    })
    RecordSendFailure = {
        method: 'POST',
        url: "={{ $('Config').first().json.rest_url }}/rpc/record_campaign_provider_result",
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
  p_membership_id: $('Build Email').item.json.membership_id,
  p_approved_version: $('Build Email').item.json.approved_version,
  p_provider_message_id: null,
  p_provider_thread_id: null,
  p_success: false,
  p_error: String($json.error && $json.error.message ? $json.error.message : $json.error || 'SMTP send failed')
}) }}`,
        options: {},
    };

    @node({
        id: 'a1f3c0de-0501-4a10-9d21-5b0c7f1e0014',
        webhookId: 'a1f3c0de-0501-4a10-9d21-5b0c7f1e9014',
        name: 'Pause Between Sends',
        type: 'n8n-nodes-base.wait',
        version: 1.1,
        position: [1520, 300],
    })
    PauseBetweenSends = {
        amount: 45,
        unit: 'seconds',
    };

    // =====================================================================
    // ROUTAGE ET CONNEXIONS
    // =====================================================================

    @links()
    defineRouting() {
        this.EveryFifteenMinutes.out(0).to(this.Config.in(0));
        this.Config.out(0).to(this.GetActiveCampaigns.in(0));
        this.GetActiveCampaigns.out(0).to(this.ParseCampaigns.in(0));
        this.ParseCampaigns.out(0).to(this.AnyActiveCampaign.in(0));
        this.AnyActiveCampaign.out(0).to(this.LoopCampaigns.in(0));
        this.LoopCampaigns.out(1).to(this.ClaimNextSend.in(0));
        this.ClaimNextSend.out(0).to(this.ParseClaim.in(0));
        this.ParseClaim.out(0).to(this.HasClaim.in(0));
        this.HasClaim.out(0).to(this.BuildEmail.in(0));
        this.HasClaim.out(1).to(this.LoopCampaigns.in(0));
        this.BuildEmail.out(0).to(this.SendZohoEmail.in(0));
        this.SendZohoEmail.out(0).to(this.RecordSendSuccess.in(0));
        this.SendZohoEmail.out(1).to(this.RecordSendFailure.in(0));
        this.RecordSendSuccess.out(0).to(this.PauseBetweenSends.in(0));
        this.RecordSendFailure.out(0).to(this.PauseBetweenSends.in(0));
        this.PauseBetweenSends.out(0).to(this.ClaimNextSend.in(0));
    }
}
