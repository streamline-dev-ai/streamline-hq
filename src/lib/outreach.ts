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
  | "follow_up_both";

export const DEFAULT_OUTREACH_TEMPLATES: Record<OutreachTemplateKey, string> = {
  new_afrikaans_has_name: "Hallo {owner_name}, is dit {owner_name} van {business_name}? 👋",
  new_afrikaans_no_name: "Hallo, is dit die eienaar van {business_name}? 👋",
  new_english_has_name: "Hi, is this {owner_name} from {business_name}?",
  new_english_no_name: "Hi, is this the owner of {business_name}?",
  messaged_afrikaans_has_name:
    "Hallo {owner_name}! Christiaan hier. Het {business_name} op Google raakgeloop — great reviews. Het gesien julle nog nie 'n webtuiste het nie — het julle al ooit daaraan gedink om een te kry?",
  messaged_afrikaans_no_name:
    "Hallo daar! Christiaan hier. Het {business_name} op Google raakgeloop — great reviews. Het gesien julle nog nie 'n webtuiste het nie — het julle al ooit daaraan gedink om een te kry?",
  messaged_english_has_name:
    "Hi {owner_name}! I'm Christiaan — came across {business_name} on Google, great reviews. Noticed you don't have a website yet — ever thought about getting one?",
  messaged_english_no_name:
    "Hi! I'm Christiaan — came across {business_name} on Google, great reviews. Noticed you don't have a website yet — ever thought about getting one?",
  replied_afrikaans:
    "Ek bou professionele webtuiste vir {niche} diensverskaffers in Gauteng. Ek het al 'n demo vir {business_name} gebou — sal jy belangstel om dit te sien? 👊",
  replied_english:
    "I build professional websites for {niche} businesses in Gauteng. I actually built a quick demo for {business_name} already — want me to send it over?",
  demo_sent_afrikaans: "Hallo {owner_name}, net vinnig — het jy kans gehad om na die demo te kyk? Laat my weet wat jy dink 😊",
  demo_sent_english: "Hi {owner_name}, just checking — did you get a chance to look at the demo? Let me know what you think 😊",
  follow_up_both: "Hi {owner_name}, last one from me — demo is ready whenever you want to see it 👊",
};

export const OUTREACH_TEMPLATE_META: Array<{ key: OutreachTemplateKey; label: string }> = [
  { key: "new_afrikaans_has_name", label: "New — Afrikaans (has name)" },
  { key: "new_afrikaans_no_name", label: "New — Afrikaans (no name)" },
  { key: "new_english_has_name", label: "New — English (has name)" },
  { key: "new_english_no_name", label: "New — English (no name)" },
  { key: "messaged_afrikaans_has_name", label: "Messaged — Afrikaans (has name)" },
  { key: "messaged_afrikaans_no_name", label: "Messaged — Afrikaans (no name)" },
  { key: "messaged_english_has_name", label: "Messaged — English (has name)" },
  { key: "messaged_english_no_name", label: "Messaged — English (no name)" },
  { key: "replied_afrikaans", label: "Replied — Afrikaans" },
  { key: "replied_english", label: "Replied — English" },
  { key: "demo_sent_afrikaans", label: "Demo sent — Afrikaans" },
  { key: "demo_sent_english", label: "Demo sent — English" },
  { key: "follow_up_both", label: "Follow up (3+ days) — Both" },
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
      return applyVars("Hi, is this the owner of {business_name}?", vars).trim();
    }
    if (stage === "messaged") {
      return applyVars(
        "Hey! I actually ate at {business_name} recently — food was great. Wanted to share it with a friend afterwards and realised you guys don't have a website. Is there a reason for that?",
        vars
      ).trim();
    }
    if (stage === "replied") {
      return applyVars(
        "Ah makes sense. I actually build websites — I put together a quick demo to show you what it could look like. Online menu, reservations, the works. Would you be interested in having a look?",
        vars
      ).trim();
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
