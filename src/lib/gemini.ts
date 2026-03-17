export type GeminiSuggestInput = {
  lead: {
    business_name: string;
    owner_name: string | null;
    stage: string | null;
    notes: string | null;
  };
  last_message: string | null;
  conversation_language_hint?: string | null;
};

export async function requestGeminiSuggestion(input: GeminiSuggestInput) {
  const tryServer = async () => {
    const res = await fetch("/api/gemini-suggest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(txt || `Gemini request failed (${res.status})`);
    }
    const json = (await res.json()) as { text?: string };
    if (!json.text) throw new Error("Gemini response was empty");
    return json.text;
  };

  try {
    return await tryServer();
  } catch (e) {
    const key = (import.meta as any).env?.VITE_GOOGLE_API_KEY || (import.meta as any).env?.VITE_GEMINI_API_KEY;
    if (!key) throw e;

    const systemPrompt =
      "You are an outreach assistant for Streamline Automations, a web design and automation agency in South Africa. Generate a short, casual WhatsApp message in the same language as the conversation history. Keep it under 3 sentences. Sound like a real person, not a salesperson.";

    const userPrompt =
      `Lead: ${input.lead.business_name}\n` +
      `Owner: ${input.lead.owner_name ?? ""}\n` +
      `Current stage: ${input.lead.stage ?? ""}\n` +
      `Last message sent: ${input.last_message ?? ""}\n` +
      `Notes: ${input.lead.notes ?? ""}\n` +
      `Language hint: ${input.conversation_language_hint ?? ""}\n` +
      "Generate the next message to send.";

    const url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent";
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-goog-api-key": key,
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 160,
        },
      }),
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(txt || `Gemini request failed (${res.status})`);
    }
    const json = (await res.json()) as any;
    const text: string | undefined = json?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error("Gemini response was empty");
    return text;
  }
}
