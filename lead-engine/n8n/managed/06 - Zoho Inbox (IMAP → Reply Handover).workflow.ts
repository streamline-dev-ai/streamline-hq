import { workflow, node, links } from '@n8n-as-code/transformer';

// <workflow-map>
// Workflow : 06 - Zoho Inbox (IMAP → Reply Handover)
// Nodes   : 9  |  Connections: 8
//
// NODE INDEX
// ──────────────────────────────────────────────────────────────────
// Property name                    Node type (short)         Flags
// ZohoInboxTrigger                   emailReadImap              [creds]
// ExtractReply                       code
// ResolveThread                      httpRequest                [creds] [alwaysOutput]
// PrepareIngest                      code
// IsPilotThread                      if
// IngestReply                        httpRequest                [creds]
// NeedsHandover                      if
// AlertHandover                      telegram                   [creds]
// IgnoreUnmatched                    noOp
//
// ROUTING MAP
// ──────────────────────────────────────────────────────────────────
// ZohoInboxTrigger
//    → ExtractReply
//      → ResolveThread
//        → PrepareIngest
//          → IsPilotThread
//            → IngestReply
//              → NeedsHandover
//                → AlertHandover
//           .out(1) → IgnoreUnmatched
// </workflow-map>

// =====================================================================
// METADATA DU WORKFLOW
// =====================================================================

@workflow({
    id: 'XqZNImewzKM5TBkr',
    name: '06 - Zoho Inbox (IMAP → Reply Handover)',
    active: false,
    isArchived: false,
    settings: { timezone: 'Africa/Johannesburg', executionOrder: 'v1', availableInMCP: false },
})
export class _06ZohoInboxImapReplyHandoverWorkflow {
    // =====================================================================
    // CONFIGURATION DES NOEUDS
    // =====================================================================

    @node({
        id: 'b2e4d1ef-0601-4b20-8e32-6c1d8f2f0001',
        name: 'Zoho Inbox Trigger',
        type: 'n8n-nodes-base.emailReadImap',
        version: 2.1,
        position: [-1000, 300],
        credentials: { imap: { id: 'gPKvVKlObH3MKISZ', name: 'Zoho IMAP - Streamline Outreach' } },
    })
    ZohoInboxTrigger = {
        mailbox: 'INBOX',
        postProcessAction: 'read',
        downloadAttachments: false,
        format: 'resolved',
        options: {},
    };

    @node({
        id: 'b2e4d1ef-0601-4b20-8e32-6c1d8f2f0002',
        name: 'Extract Reply',
        type: 'n8n-nodes-base.code',
        version: 2,
        position: [-780, 300],
    })
    ExtractReply = {
        jsCode: `// Normalise the parsed mail and classify it. Classification only ever routes
// a human to the message — it never composes or sends a response.
const mail = $input.first().json;

function headerId(value) {
  if (!value) return null;
  const text = String(value).trim();
  return text ? text : null;
}

const messageId = headerId(mail.messageId);
if (!messageId) {
  throw new Error('Inbound mail has no Message-ID header');
}

const inReplyTo = headerId(mail.inReplyTo);
const rawReferences = mail.references;
const references = Array.isArray(rawReferences)
  ? rawReferences.map(headerId).filter(Boolean)
  : (headerId(rawReferences) || '').split(/\\s+/).map(headerId).filter(Boolean);

// Newest ancestor first: a reply to a follow-up points at the follow-up.
const candidates = [...new Set([inReplyTo, ...references.reverse()].filter(Boolean))];

const bodyText = (mail.text || mail.textAsHtml || mail.html || '').toString().trim();
if (!bodyText) {
  throw new Error('Inbound mail has no readable body');
}

const fromAddress =
  (mail.from && mail.from.value && mail.from.value[0] && mail.from.value[0].address) ||
  (mail.from && mail.from.text) ||
  null;

const subject = mail.subject || '';
const haystack = (subject + '\\n' + bodyText).toLowerCase();

function has(pattern) {
  return pattern.test(haystack);
}

let classification;
if (has(/\\b(unsubscribe|no thanks|remove me|stop emailing|opt[- ]?out|take me off|do ?n'?t (email|contact))\\b/)) {
  classification = 'stop';
} else if (has(/\\b(spam|reporting you|report you|harass|legal action|complaint|complain)\\b/)) {
  classification = 'complaint';
} else if (has(/\\b(out of office|automatic reply|auto[- ]?reply|automatic response|on leave|annual leave|currently away)\\b/)) {
  // An auto-responder is not a human answer; route it to a person to judge.
  classification = 'unclassified';
} else if (has(/\\b(not interested|no thank you|we're (good|sorted|fine)|already have (a|our)|not (right )?now)\\b/)) {
  classification = 'not_interested';
} else if (has(/\\b(yes|interested|sounds good|tell me more|keen|let'?s (chat|talk|do)|send (it|me|the|over)|how much|what.{0,12}cost|book)\\b/)) {
  classification = 'interested';
} else if (bodyText.includes('?')) {
  classification = 'question';
} else {
  classification = 'unclassified';
}

const summary = bodyText.replace(/\\s+/g, ' ').slice(0, 240);

return [{
  json: {
    provider_message_id: messageId,
    candidates,
    candidate_filter: candidates.length
      ? 'provider_message_id=in.(' + candidates.map((c) => '"' + c.replace(/"/g, '') + '"').join(',') + ')'
      : null,
    body: bodyText,
    classification,
    summary,
    from_address: fromAddress,
    subject,
  },
}];`,
    };

    @node({
        id: 'b2e4d1ef-0601-4b20-8e32-6c1d8f2f0003',
        name: 'Resolve Thread',
        type: 'n8n-nodes-base.httpRequest',
        version: 4.4,
        position: [-560, 300],
        credentials: { supabaseApi: { id: 'wsbXBeC9kVgmn2L9', name: 'streamline-admin-supabse' } },
        alwaysOutputData: true,
    })
    ResolveThread = {
        method: 'GET',
        url: '=https://lpjwfjkgqpgydzozuusj.supabase.co/rest/v1/outreach_messages?{{ $json.candidate_filter || "provider_message_id=eq.__none__" }}&direction=eq.outbound&select=provider_message_id,provider_thread_id,sent_at&order=sent_at.desc',
        authentication: 'predefinedCredentialType',
        nodeCredentialType: 'supabaseApi',
        options: {},
    };

    @node({
        id: 'b2e4d1ef-0601-4b20-8e32-6c1d8f2f0004',
        name: 'Prepare Ingest',
        type: 'n8n-nodes-base.code',
        version: 2,
        position: [-340, 300],
    })
    PrepareIngest = {
        jsCode: `const reply = $('Extract Reply').first().json;
const response = $input.first().json;
const matches = Array.isArray(response) ? response : (response && response.provider_message_id ? [response] : []);

const threadId = matches
  .map((row) => row && row.provider_thread_id)
  .find((value) => Boolean(value)) || null;

return [{
  json: {
    ...reply,
    provider_thread_id: threadId,
    matched: Boolean(threadId),
  },
}];`,
    };

    @node({
        id: 'b2e4d1ef-0601-4b20-8e32-6c1d8f2f0005',
        name: 'Is Pilot Thread',
        type: 'n8n-nodes-base.if',
        version: 2,
        position: [-120, 300],
    })
    IsPilotThread = {
        conditions: {
            options: {
                caseSensitive: true,
                leftValue: '',
                typeValidation: 'strict',
            },
            conditions: [
                {
                    id: 'cond-matched',
                    leftValue: '={{ $json.matched }}',
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
        id: 'b2e4d1ef-0601-4b20-8e32-6c1d8f2f0006',
        name: 'Ingest Reply',
        type: 'n8n-nodes-base.httpRequest',
        version: 4.4,
        position: [100, 200],
        credentials: { supabaseApi: { id: 'wsbXBeC9kVgmn2L9', name: 'streamline-admin-supabse' } },
    })
    IngestReply = {
        method: 'POST',
        url: 'https://lpjwfjkgqpgydzozuusj.supabase.co/rest/v1/rpc/ingest_campaign_reply',
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
  p_provider_message_id: $json.provider_message_id,
  p_provider_thread_id: $json.provider_thread_id,
  p_body: $json.body,
  p_classification: $json.classification,
  p_summary: $json.summary
}) }}`,
        options: {},
    };

    @node({
        id: 'b2e4d1ef-0601-4b20-8e32-6c1d8f2f0007',
        name: 'Needs Handover',
        type: 'n8n-nodes-base.if',
        version: 2,
        position: [320, 200],
    })
    NeedsHandover = {
        conditions: {
            options: {
                caseSensitive: true,
                leftValue: '',
                typeValidation: 'loose',
            },
            conditions: [
                {
                    id: 'cond-handover',
                    leftValue:
                        "={{ ['interested','complaint','stop','question','unclassified'].includes($('Prepare Ingest').item.json.classification) }}",
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
        id: 'b2e4d1ef-0601-4b20-8e32-6c1d8f2f0008',
        webhookId: 'f941c760-0e49-4c63-b519-86f08e32f7ee',
        name: 'Alert Handover',
        type: 'n8n-nodes-base.telegram',
        version: 1.2,
        position: [540, 120],
        credentials: { telegramApi: { id: 'NjP97V1NQwgzrpvC', name: 'Streamline Lead Bot' } },
    })
    AlertHandover = {
        resource: 'message',
        operation: 'sendMessage',
        chatId: '8713649240',
        text: `=📥 *Email pilot — reply needs you*

*From:* {{ $('Prepare Ingest').item.json.from_address }}
*Subject:* {{ $('Prepare Ingest').item.json.subject }}
*Classified:* {{ $('Prepare Ingest').item.json.classification }}

{{ $('Prepare Ingest').item.json.summary }}

No automatic reply was sent. Open Streamline HQ → Email Pilot → Handovers.`,
        additionalFields: {
            appendAttribution: false,
            parse_mode: 'Markdown',
        },
    };

    @node({
        id: 'b2e4d1ef-0601-4b20-8e32-6c1d8f2f0009',
        name: 'Ignore Unmatched',
        type: 'n8n-nodes-base.noOp',
        version: 1,
        position: [100, 420],
    })
    IgnoreUnmatched = {};

    // =====================================================================
    // ROUTAGE ET CONNEXIONS
    // =====================================================================

    @links()
    defineRouting() {
        this.ZohoInboxTrigger.out(0).to(this.ExtractReply.in(0));
        this.ExtractReply.out(0).to(this.ResolveThread.in(0));
        this.ResolveThread.out(0).to(this.PrepareIngest.in(0));
        this.PrepareIngest.out(0).to(this.IsPilotThread.in(0));
        this.IsPilotThread.out(0).to(this.IngestReply.in(0));
        this.IsPilotThread.out(1).to(this.IgnoreUnmatched.in(0));
        this.IngestReply.out(0).to(this.NeedsHandover.in(0));
        this.NeedsHandover.out(0).to(this.AlertHandover.in(0));
    }
}
