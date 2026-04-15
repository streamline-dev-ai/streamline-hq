import { daysSinceSaISOString } from "@/utils/saDate";

export type LeadLanguage = "english" | "afrikaans";

export type OutreachTemplateKey =
  | "new_afrikaans_has_name"
  | "new_afrikaans_no_name"
  | "new_english_has_name"
  | "new_english_no_name"
  | "messaged_afrikaans_has_name"
  | "messaged_afrikaans_no_name"
  | "messaged_english_has_name"
  | "messaged_english_no_name"
  | "replied_afrikaans"
  | "replied_english"
  | "demo_sent_afrikaans"
  | "demo_sent_english"
  | "follow_up_both"
  | "restaurant_messaged"
  | "restaurant_replied"
  | "restaurant_someone_building_1"
  | "restaurant_someone_building_2"
  | "salon_messaged"
  | "salon_replied"
  | "salon_demo_offer_accepted"
  | "salon_someone_building"
  | "salon_not_interested"
  | "nail_salon_messaged"
  | "nail_salon_replied"
  | "nail_salon_demo_offer_accepted"
  | "nail_salon_someone_building"
  | "nail_salon_not_interested";

export const DEFAULT_OUTREACH_TEMPLATES: Record<OutreachTemplateKey, string> = {
  // ── Opening messages ────────────────────────────────────────────────────────
  new_afrikaans_has_name: "Hallo, is dit {owner_name} van {business_name}? 👋",
  new_afrikaans_no_name: "Hallo, is dit die eienaar van {business_name}? 👋",
  new_english_has_name: "Hi, is this {owner_name} from {business_name}? 👋",
  new_english_no_name: "Hi, is this the owner of {business_name}? 👋",

  // ── Follow-up after no reply ─────────────────────────────────────────────
  messaged_afrikaans_has_name:
    "Hallo {owner_name}! Christiaan hier — het {business_name} op Google gesien, great reviews. Ek het gesien julle het nog nie 'n webtuiste nie — het julle al ooit daaraan gedink om een te kry?",
  messaged_afrikaans_no_name:
    "Hallo! Christiaan hier — het {business_name} op Google gesien, great reviews. Ek het gesien julle het nog nie 'n webtuiste nie — het julle al ooit daaraan gedink om een te kry?",
  messaged_english_has_name:
    "Hi {owner_name}! Christiaan here — found {business_name} on Google, great reviews. Noticed you don't have a website yet — any particular reason, or is it something you've thought about?",
  messaged_english_no_name:
    "Hi! Christiaan here — found {business_name} on Google, great reviews. Noticed you don't have a website yet — any particular reason, or is it something you've thought about?",

  // ── After they reply ─────────────────────────────────────────────────────
  replied_afrikaans:
    "Ek bou webtuiste vir {niche} besighede in Gauteng — ek het al 'n vinnige demo vir {business_name} gebou om jou 'n idee te gee. Sal jy wil kyk? 😊",
  replied_english:
    "I build websites for {niche} businesses in Gauteng — I actually put together a quick demo for {business_name} so you can see what it could look like. Want me to send it over? 😊",

  // ── After demo is sent ───────────────────────────────────────────────────
  demo_sent_afrikaans:
    "Hallo {owner_name}, net vinnig — het jy kans gehad om na die demo te kyk? Laat my weet wat jy dink 😊",
  demo_sent_english:
    "Hi {owner_name}, just checking in — did you get a chance to look at the demo? Let me know what you think 😊",

  // ── General follow-up (3+ days no reply) ────────────────────────────────
  follow_up_both:
    "Hi {owner_name}, just following up — happy to answer any questions or tweak the demo if needed. No pressure at all 😊",

  // ── Salon-specific ───────────────────────────────────────────────────────
  salon_messaged:
    "Hi! I heard from a friend that {business_name} does really good hair/treatments — and I noticed you don't have a website yet.\n\nI'm a web designer who works with salons. Any particular reason, or are you already working on one?",
  salon_replied:
    "A good website really helps salons — clients can book appointments online 24/7, you can sell your products directly, it builds trust, and you get more control instead of relying only on Instagram.\n\nWould you be interested in me quickly building a *free demo website* so you can see how it could look for {business_name}? No obligation at all.",
  salon_demo_offer_accepted:
    "Great! I'll put together a quick demo based on {business_name}.\n\nWhat's the best email to send it to?",
  salon_someone_building:
    "Oh nice!\n\nIf it takes longer than expected or you want a second option later, feel free to reach out. Happy to help 😊",
  salon_not_interested:
    "No problem at all.\n\nI'll keep your details and if you ever change your mind, just let me know. Wish you all the best! 🙏",

  // ── Nail salon-specific ──────────────────────────────────────────────────
  nail_salon_messaged:
    "Hi! I heard from a friend that you do really great nails — and I noticed you don't have a website yet.\n\nI'm a web designer who works with nail salons. Any particular reason, or are you already working on one?",
  nail_salon_replied:
    "A website makes a real difference for nail salons — clients can book online any time of day, you can sell your products directly instead of only relying on Instagram, and it just makes the business look way more professional.\n\nWould you want me to put together a free demo so you can actually see what it could look like for {business_name}? Zero obligation.",
  nail_salon_demo_offer_accepted:
    "Great! I'll put something together based on your services and style.\n\nWhat's the best email to send it to?",
  nail_salon_someone_building:
    "Oh nice!\n\nIf things take longer than expected or you want to compare options, feel free to reach out. Happy to help 😊",
  nail_salon_not_interested:
    "No problem at all.\n\nI'll keep your details — if you ever change your mind, just shout. All the best with the salon! 🙏",

  // ── Restaurant-specific ──────────────────────────────────────────────────
  restaurant_messaged:
    "Hi! I actually ate at your restaurant recently — the food was excellent. Afterwards I wanted to recommend it to friends and noticed you don't have a website yet.\nI'm a web designer who specialises in restaurants. Just curious — is there a reason you haven't got one, or are you already working on it?",
  restaurant_replied:
    "I build websites specifically for restaurants — online menu, opening hours, a contact page, the works. I actually put together a quick demo to show you what it could look like. Would you be keen to have a look? 😊",
  restaurant_someone_building_1:
    "Oh nice!\nI'm a web designer who builds websites for many local restaurants. If you ever feel the current one is taking too long or you're not 100% happy with it, feel free to reach out. I'd be happy to show you some examples of what I can do.\nNo pressure at all — just letting you know.",
  restaurant_someone_building_2:
    "Oh great!\nIf things don't move as fast as you'd like, or you want a second option, I'm happy to build a quick demo for you to compare. Just let me know.",
};

export const OUTREACH_TEMPLATE_META: Array<{ key: OutreachTemplateKey; label: string; group?: string }> = [
  { key: "new_english_has_name", label: "Opening — English (has name)" },
  { key: "new_english_no_name", label: "Opening — English (no name)" },
  { key: "new_afrikaans_has_name", label: "Opening — Afrikaans (has name)" },
  { key: "new_afrikaans_no_name", label: "Opening — Afrikaans (no name)" },
  { key: "messaged_english_has_name", label: "2nd message — English (has name)" },
  { key: "messaged_english_no_name", label: "2nd message — English (no name)" },
  { key: "messaged_afrikaans_has_name", label: "2nd message — Afrikaans (has name)" },
  { key: "messaged_afrikaans_no_name", label: "2nd message — Afrikaans (no name)" },
  { key: "replied_english", label: "After reply — English" },
  { key: "replied_afrikaans", label: "After reply — Afrikaans" },
  { key: "demo_sent_english", label: "Demo sent — English" },
  { key: "demo_sent_afrikaans", label: "Demo sent — Afrikaans" },
  { key: "follow_up_both", label: "Follow up (3+ days no reply)" },
  { key: "restaurant_messaged", label: "🍽️ Restaurant — 2nd message" },
  { key: "restaurant_replied", label: "🍽️ Restaurant — after reply" },
  { key: "restaurant_someone_building_1", label: "🍽️ Restaurant — someone's building their site (v1)" },
  { key: "restaurant_someone_building_2", label: "🍽️ Restaurant — someone's building their site (v2)" },
  { key: "salon_messaged", label: "💇 Salon — 2nd message" },
  { key: "salon_replied", label: "💇 Salon — after reply (benefits + demo offer)" },
  { key: "salon_demo_offer_accepted", label: "💇 Salon — they want a demo (ask for email)" },
  { key: "salon_someone_building", label: "💇 Salon — someone's already building their site" },
  { key: "salon_not_interested", label: "💇 Salon — not interested right now" },
  { key: "nail_salon_messaged", label: "💅 Nail salon — 2nd message" },
  { key: "nail_salon_replied", label: "💅 Nail salon — after reply (benefits + demo offer)" },
  { key: "nail_salon_demo_offer_accepted", label: "💅 Nail salon — they want a demo (ask for email)" },
  { key: "nail_salon_someone_building", label: "💅 Nail salon — someone's already building their site" },
  { key: "nail_salon_not_interested", label: "💅 Nail salon — not interested right now" },
];

export type OutreachLead = {
  stage: string | null;
  language?: string | null;
  owner_name: string | null;
  business_name: string;
  niche: string | null;
  demo_url?: string | null;
  last_contact_at?: string | null;
};

const STORAGE_KEY = "streamline-hq:outreach-templates:v1";

export function loadOutreachTemplates(): Record<OutreachTemplateKey, string> {
  if (typeof window === "undefined") return DEFAULT_OUTREACH_TEMPLATES;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_OUTREACH_TEMPLATES;
    const json = JSON.parse(raw) as Partial<Record<OutreachTemplateKey, unknown>>;
    const next = { ...DEFAULT_OUTREACH_TEMPLATES };
    for (const k of Object.keys(DEFAULT_OUTREACH_TEMPLATES) as OutreachTemplateKey[]) {
      const v = json[k];
      if (typeof v === "string" && v.trim()) next[k] = v;
    }
    return next;
  } catch {
    return DEFAULT_OUTREACH_TEMPLATES;
  }
}

export function saveOutreachTemplates(next: Record<OutreachTemplateKey, string>) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

export function resetOutreachTemplates() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
}

function normLang(x: unknown): LeadLanguage {
  const s = typeof x === "string" ? x.toLowerCase().trim() : "";
  return s === "afrikaans" ? "afrikaans" : "english";
}

function normStage(x: unknown): string {
  return typeof x === "string" ? x.toLowerCase().trim() : "new";
}

function hasName(owner_name: string | null | undefined) {
  return Boolean((owner_name ?? "").trim());
}

function safeNiche(niche: string | null | undefined) {
  const n = (niche ?? "").trim();
  return n || "trade";
}

function applyVars(template: string, vars: Record<string, string>) {
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (_, k: string) => vars[k] ?? "");
}

export function getOutreachMessage(lead: OutreachLead) {
  const templates = loadOutreachTemplates();
  const stage = normStage(lead.stage);
  const language = normLang(lead.language);
  const business_name = lead.business_name;
  const owner_name = lead.owner_name;
  const niche = safeNiche(lead.niche);
  const daysSince = lead.last_contact_at ? daysSinceSaISOString(lead.last_contact_at) : null;
  const useFollowUp = daysSince !== null && daysSince >= 3 && (stage === "messaged" || stage === "demo_sent");

  const vars = {
    business_name,
    owner_name: owner_name ?? "",
    niche,
    demo_url: lead.demo_url ?? "",
  };

  if (useFollowUp) {
    const who = hasName(owner_name) ? owner_name!.trim() : "there";
    return applyVars(templates.follow_up_both, { ...vars, owner_name: who }).trim();
  }

  if (niche === "restaurant") {
    if (stage === "new") {
      const tpl = hasName(owner_name) ? templates.new_english_has_name : templates.new_english_no_name;
      return applyVars(tpl, vars).trim();
    }
    if (stage === "messaged") {
      return applyVars(templates.restaurant_messaged, vars).trim();
    }
    if (stage === "replied") {
      return applyVars(templates.restaurant_replied, vars).trim();
    }
  }

  if (niche === "salon") {
    if (stage === "new") {
      const tpl = hasName(owner_name) ? templates.new_english_has_name : templates.new_english_no_name;
      return applyVars(tpl, vars).trim();
    }
    if (stage === "messaged") {
      return applyVars(templates.salon_messaged, vars).trim();
    }
    if (stage === "replied") {
      return applyVars(templates.salon_replied, vars).trim();
    }
  }

  if (niche === "nail salon") {
    if (stage === "new") {
      const tpl = hasName(owner_name) ? templates.new_english_has_name : templates.new_english_no_name;
      return applyVars(tpl, vars).trim();
    }
    if (stage === "messaged") {
      return applyVars(templates.nail_salon_messaged, vars).trim();
    }
    if (stage === "replied") {
      return applyVars(templates.nail_salon_replied, vars).trim();
    }
  }

  if (stage === "new") {
    const tpl =
      language === "afrikaans"
        ? hasName(owner_name)
          ? templates.new_afrikaans_has_name
          : templates.new_afrikaans_no_name
        : hasName(owner_name)
          ? templates.new_english_has_name
          : templates.new_english_no_name;
    return applyVars(tpl, vars).trim();
  }

  if (stage === "messaged") {
    const tpl =
      language === "afrikaans"
        ? hasName(owner_name)
          ? templates.messaged_afrikaans_has_name
          : templates.messaged_afrikaans_no_name
        : hasName(owner_name)
          ? templates.messaged_english_has_name
          : templates.messaged_english_no_name;
    return applyVars(tpl, vars).trim();
  }

  if (stage === "replied") {
    const tpl = language === "afrikaans" ? templates.replied_afrikaans : templates.replied_english;
    return applyVars(tpl, vars).trim();
  }

  if (stage === "demo_sent") {
    const who = hasName(owner_name) ? owner_name!.trim() : language === "afrikaans" ? "daar" : "there";
    const tpl = language === "afrikaans" ? templates.demo_sent_afrikaans : templates.demo_sent_english;
    return applyVars(tpl, { ...vars, owner_name: who }).trim();
  }

  const who = hasName(owner_name) ? owner_name!.trim() : "there";
  return applyVars(templates.follow_up_both, { ...vars, owner_name: who }).trim();
}
