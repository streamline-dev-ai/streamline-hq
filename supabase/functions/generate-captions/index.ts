// generate-captions — server-side caption writer (Claude)
//
// Replaces the old client-side OpenAI call (VITE_OPENAI_API_KEY, exposed + missing).
// ANTHROPIC_API_KEY lives in the function env and never reaches the browser.
//
// POST { brief, contentType, pillar, platforms }
//   → { master, instagram, facebook, linkedin, hashtags, first_comment }

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SYSTEM_PROMPT = `You are the social media voice for Streamline Automations.

ABOUT THE BRAND:
Streamline Automations is a South African web design and automation studio founded by Christiaan Steffen, based in Johannesburg. I build custom websites and automation systems for SA small businesses — not templates, real systems. I deliver in under 7 days.

PACKAGES:
- Online Presence: From R7,500 | 3-5 days | Clean website, mobile-first, SEO
- Client Magnet: From R15,000 | 5-7 days | Website + bookings + WhatsApp automation + AI chatbot
- Business Accelerator: From R25,000 | 7-14 days | Full system + admin dashboard + analytics + monthly support

PORTFOLIO:
- RecklessBear Apparel: Custom website, quote engine, AI chatbot, admin dashboard
- BLOM Cosmetics: Full e-commerce, custom admin, WhatsApp alerts, PDF invoicing, training academy
- Ameli van Zyl: Portfolio site, contact automation, built in 4 days
- Madiega Trading (in progress): 9-page site, solar lead gen, e-commerce, admin system

TARGET AUDIENCE:
SA small business owners — restaurants, trades (electrical, solar, plumbing, construction), retail, beauty, apparel. They are practical, value-driven, and skeptical of agencies. They understand money but not tech. Speak plainly.

BRAND VOICE:
First person — "I", never "we" (this is a solo studio). Direct. Confident. No fluff. Short sentences. Outcomes over features. No corporate speak. No "excited to share". No "game-changing". South African spelling (organise, colour, optimise). SA context always — rands, loadshedding, Gauteng, WhatsApp where relevant.

PLATFORM RULES:
Instagram: Max 5 lines. Strong hook line 1. Problem or outcome lines 2-3. CTA line 4-5. No hashtags in caption.
Facebook: 2-3 short paragraphs. Slightly more context than Instagram. Conversational. End with a question or CTA.
LinkedIn: First-person founder voice. Start with a bold insight or uncomfortable truth. 3-4 short paragraphs. Professional but human. No buzzwords.

OUTPUT FORMAT:
Return ONLY raw JSON. No markdown. No backticks. No explanation.
{
  "master": "platform-agnostic core caption, 2-4 lines, the single source idea",
  "instagram": "...",
  "facebook": "...",
  "linkedin": "...",
  "hashtags": "#streamlineautomations #websitedesign #automation #southafrica #smallbusiness",
  "first_comment": "..."
}

First comment should be a soft CTA — "Link in bio to see the work." or "WhatsApp me: 063 306 3861" or "Free demo — no obligation. Link in bio."`;

function safeParse(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    const clean = text.replace(/```json|```/g, "").trim();
    return JSON.parse(clean);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) return json({ error: "ANTHROPIC_API_KEY not configured" }, 500);

    const { brief, contentType, pillar, platforms } = await req.json();
    if (!brief) return json({ error: "Missing brief" }, 400);

    const userMessage = `Brief: ${brief}
Content type: ${contentType ?? "static"}
Pillar: ${pillar ?? "Build in Public"}
Platforms: ${(platforms ?? ["instagram", "facebook", "linkedin"]).join(", ")}

Generate the master caption plus platform-specific captions. Keep each tight and punchy. Use the brand voice. Make the hook impossible to scroll past.`;

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1200,
        temperature: 0.7,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userMessage }],
      }),
    });

    const data = await res.json();
    if (!res.ok) return json({ error: data?.error?.message ?? "Anthropic error", raw: data }, 502);

    const text = (data?.content?.[0]?.text ?? "").trim();
    const parsed = safeParse(text);
    return json(parsed);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
