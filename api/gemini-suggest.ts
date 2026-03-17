type Body = {
  lead: {
    business_name: string;
    owner_name: string | null;
    stage: string | null;
    notes: string | null;
  };
  last_message: string | null;
  conversation_language_hint?: string | null;
};

function safeString(x: unknown) {
  return typeof x === "string" ? x : "";
}

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    res.status(405).send("Method not allowed");
    return;
  }

  const apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.status(500).send("Missing server env var GOOGLE_API_KEY");
    return;
  }

  const body = (req.body ?? {}) as Partial<Body>;
  const business_name = safeString(body.lead?.business_name);
  const owner_name = body.lead?.owner_name ? safeString(body.lead.owner_name) : null;
  const stage = body.lead?.stage ? safeString(body.lead.stage) : null;
  const notes = body.lead?.notes ? safeString(body.lead.notes) : null;
  const last_message = body.last_message ? safeString(body.last_message) : null;
  const languageHint = body.conversation_language_hint ? safeString(body.conversation_language_hint) : null;

  const systemPrompt =
    "You are an outreach assistant for Streamline Automations, a web design and automation agency in South Africa. Generate a short, casual WhatsApp message in the same language as the conversation history. Keep it under 3 sentences. Sound like a real person, not a salesperson.";

  const userPrompt =
    `Lead: ${business_name}\n` +
    `Owner: ${owner_name ?? ""}\n` +
    `Current stage: ${stage ?? ""}\n` +
    `Last message sent: ${last_message ?? ""}\n` +
    `Notes: ${notes ?? ""}\n` +
    `Language hint: ${languageHint ?? ""}\n` +
    "Generate the next message to send.";

  const url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent";

  const upstream = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-goog-api-key": apiKey,
    },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            { text: `${systemPrompt}\n\n${userPrompt}` },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 160,
      },
    }),
  });

  if (!upstream.ok) {
    const txt = await upstream.text().catch(() => "");
    res.status(502).send(txt || "Upstream Gemini error");
    return;
  }

  const json = (await upstream.json()) as any;
  const text: string | undefined = json?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    res.status(502).send("Gemini returned no text");
    return;
  }

  res.status(200).json({ text });
}
