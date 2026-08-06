import * as XLSX from "xlsx";
import { formatZAPhone } from "./phone";
import type { NormalizedImportRow } from "@/types/emailPilot";

// Pure parsing/validation for the email pilot importer. Deliberately free of
// any Supabase import so it can be exercised without a browser or env vars.

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const HEADER_ALIASES: Record<keyof NormalizedImportRow, string[]> = {
  business_name: ["business_name", "business", "name", "restaurant", "company"],
  email: ["email", "email_address", "e_mail", "mail"],
  owner_first_name: ["owner_first_name", "owner", "first_name", "contact", "contact_name"],
  suburb: ["suburb", "area", "city", "location"],
  phone_e164: ["phone", "phone_number", "telephone", "mobile", "cell"],
  website: ["website", "url", "site", "web"],
  instagram_handle: ["instagram", "instagram_handle", "ig"],
  facebook_handle: ["facebook", "facebook_handle", "fb"],
  niche: ["niche", "category", "type"],
};

export function normalizeHeader(header: string): string {
  return header.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

export function pick(
  row: Record<string, string>,
  field: keyof NormalizedImportRow,
): string {
  for (const alias of HEADER_ALIASES[field]) {
    const value = row[alias];
    if (value != null && String(value).trim() !== "") return String(value).trim();
  }
  return "";
}

export function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^\w\s-]/g, "")
      .trim()
      .replace(/[\s_]+/g, "-")
      .replace(/-+/g, "-")
      .slice(0, 60) || "prospect"
  );
}

/** Parses a CSV/XLSX buffer into lower-snake-cased rows. */
export function parseSpreadsheet(data: ArrayBuffer): Record<string, string>[] {
  const workbook = XLSX.read(data);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) return [];
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
  return raw.map((row) => {
    const mapped: Record<string, string> = {};
    for (const [key, value] of Object.entries(row)) {
      mapped[normalizeHeader(key)] = value == null ? "" : String(value);
    }
    return mapped;
  });
}

export function validateRow(row: Record<string, string>): {
  normalized: NormalizedImportRow | null;
  issues: string[];
} {
  const issues: string[] = [];
  const businessName = pick(row, "business_name");
  const email = pick(row, "email").toLowerCase();

  if (!businessName) issues.push("Missing business name");
  if (!email) issues.push("Missing email address");
  else if (!EMAIL_PATTERN.test(email)) issues.push(`Invalid email address: ${email}`);

  if (issues.length > 0) return { normalized: null, issues };

  const phone = pick(row, "phone_e164");
  return {
    normalized: {
      business_name: businessName,
      email,
      owner_first_name: pick(row, "owner_first_name") || null,
      suburb: pick(row, "suburb") || null,
      phone_e164: phone ? formatZAPhone(phone) || null : null,
      website: pick(row, "website") || null,
      instagram_handle: pick(row, "instagram_handle") || null,
      facebook_handle: pick(row, "facebook_handle") || null,
      niche: pick(row, "niche") || "restaurant",
    },
    issues,
  };
}
