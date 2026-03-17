export type OpenAISuggestInput = {
  lead: {
    business_name: string;
    owner_name: string | null;
    stage: string | null;
    notes: string | null;
  };
  last_sent_message: string | null;
  last_received_message: string | null;
};

export async function requestOpenAISuggestion(input: OpenAISuggestInput) {
  const res = await fetch("/api/openai-suggest", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(txt || `OpenAI request failed (${res.status})`);
  }

  const json = (await res.json()) as { text?: string };
  if (!json.text) throw new Error("OpenAI response was empty");
  return json.text;
}

