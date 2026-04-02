/**
 * Splits a raw phone string into up to two numbers, handling common separators
 * like `/`, `|`, `;`, or two numbers jammed together (e.g. "0831234567083123456").
 * Each number is then normalised to South African international format (27xxxxxxxxx).
 */
export function parseAndFormatPhones(raw: string): { phone: string; altPhone: string } {
  if (!raw || !raw.trim()) return { phone: "", altPhone: "" };

  // Strip all characters that are not digits or common separators
  const cleaned = raw.trim();

  // Split on explicit separators first: / | ; ,  (with optional surrounding spaces)
  const separatorMatch = cleaned.split(/\s*[\/|;,]\s*/);
  let parts: string[];

  if (separatorMatch.length >= 2) {
    parts = separatorMatch.slice(0, 2);
  } else {
    // No separator found — check if the digits-only string looks like two SA numbers
    // concatenated together. SA local numbers are 10 digits (0xx xxxxxxx).
    const digits = cleaned.replace(/[^0-9]/g, "");
    if (digits.length >= 17) {
      // Two 10-digit numbers smashed together (possibly with leading zeros)
      // or one 27-prefixed + one 0-prefixed
      // Try to split at position 10 or 11
      const split = trySplitConcatenated(digits);
      if (split) {
        parts = split;
      } else {
        parts = [cleaned];
      }
    } else {
      parts = [cleaned];
    }
  }

  const [primary, secondary] = parts.map((p) => formatZAPhone(p.trim()));
  return { phone: primary, altPhone: secondary ?? "" };
}

/**
 * Normalises a single phone string to South African international format.
 * 083xxxxxxx  → 2783xxxxxxx
 * +2783xxxxxxx → 2783xxxxxxx
 * 2783xxxxxxx  → 2783xxxxxxx  (already correct)
 */
export function formatZAPhone(raw: string): string {
  if (!raw) return "";
  // Strip everything except digits
  const digits = raw.replace(/[^0-9]/g, "");
  if (!digits) return "";

  // Already has country code 27
  if (digits.startsWith("27") && digits.length === 11) return digits;

  // Starts with 0 — local SA format (e.g. 083..., 011...)
  if (digits.startsWith("0") && digits.length === 10) return "27" + digits.slice(1);

  // 9 digits without leading 0 — add 27 prefix
  if (digits.length === 9) return "27" + digits;

  // Has country code but includes a leading 0 after it: 2708312345678 (12 digits)
  if (digits.startsWith("27") && digits.length === 12 && digits[2] === "0") {
    return "27" + digits.slice(3);
  }

  // Fallback: return as-is (stripped of non-digits)
  return digits;
}

/**
 * Attempts to split a purely-digit string that looks like two concatenated SA numbers.
 * Returns [first, second] digit strings or null if we can't confidently split.
 */
function trySplitConcatenated(digits: string): [string, string] | null {
  // Common patterns:
  // 0xx (7 more digits) = 10 digits per number → total 20 digits
  // 27xx (7 more digits) = 11 digits per number → total 22 digits

  // Try 10+10
  if (digits.length === 20 && digits[0] === "0" && digits[10] === "0") {
    return [digits.slice(0, 10), digits.slice(10)];
  }
  // Try 11+10 (27-prefix + 0-prefix)
  if (digits.length === 21 && digits.startsWith("27") && digits[11] === "0") {
    return [digits.slice(0, 11), digits.slice(11)];
  }
  // Try 10+11
  if (digits.length === 21 && digits[0] === "0" && digits.slice(10).startsWith("27")) {
    return [digits.slice(0, 10), digits.slice(10)];
  }
  // Try 11+11
  if (digits.length === 22 && digits.startsWith("27") && digits.slice(11).startsWith("27")) {
    return [digits.slice(0, 11), digits.slice(11)];
  }

  return null;
}
