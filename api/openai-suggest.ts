type Body = {
  lead: {
    business_name: string;
    owner_name: string | null;
    stage: string | null;
    notes: string | null;
  };
  last_sent_message: string | null;
  last_received_message: string | null;
};

function safeString(x: unknown) {
  return typeof x === "string" ? x : "";
}

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    res.status(405).send("Method not allowed");
    return;
  }

  const apiKey = process.env.OPENAI_API_KEY || process.env.VITE_OPENAI_API_KEY;
  if (!apiKey) {
    res.status(500).send("Missing server env var OPENAI_API_KEY");
    return;
  }

  const body = (req.body ?? {}) as Partial<Body>;
  const business_name = safeString(body.lead?.business_name);
  const owner_name = body.lead?.owner_name ? safeString(body.lead.owner_name) : null;
  const stage = body.lead?.stage ? safeString(body.lead.stage) : null;
  const notes = body.lead?.notes ? safeString(body.lead.notes) : null;
  const last_sent_message = body.last_sent_message ? safeString(body.last_sent_message) : null;
  const last_received_message = body.last_received_message ? safeString(body.last_received_message) : null;

  const systemPrompt =
    "You are a WhatsApp outreach assistant for Christiaan Steffen,\nowner of Streamline Automations in South Africa. He builds websites\nand booking systems for trade businesses (electricians, plumbers, etc).\n\nRules:\n- Maximum 2 sentences. Never more.\n- Casual South African tone — like a real person texting\n- No emojis unless the conversation had them\n- No corporate language. Never say 'I hope this finds you well'\n- If previous messages were in Afrikaans, reply in Afrikaans\n- Use the owner name naturally if known\n- Goal: get them to say yes to ONE thing (see demo / book call / reply)\n- Never mention 'automation' or technical features upfront";

  const userPrompt =
    `Business: ${business_name}\n` +
    `Owner: ${owner_name ?? ""}\n` +
    `Stage: ${stage ?? ""}\n` +
    `Last message WE sent: ${last_sent_message ?? ""}\n` +
    `Last message THEY sent: ${last_received_message ?? ""}\n` +
    `Notes: ${notes ?? ""}\n\n` +
    "Write the next WhatsApp message to send.";

  const upstream = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.7,
    }),
  });

  if (!upstream.ok) {
    const txt = await upstream.text().catch(() => "");
    res.status(502).send(txt || "Upstream OpenAI error");
    return;
  }

  const json = (await upstream.json()) as any;
  const text: string | undefined = json?.choices?.[0]?.message?.content;
  if (!text) {
    res.status(502).send("OpenAI returned no text");
    return;
  }

  res.status(200).json({ text });
}

