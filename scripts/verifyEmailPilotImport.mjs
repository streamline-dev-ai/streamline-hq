/**
 * Verifies the email pilot CSV parser/validator against a fixture containing
 * valid, invalid, duplicate, missing-contact, and suppressed-candidate rows.
 *
 * The pure logic lives in src/lib/emailPilotCsv.ts (no Supabase import), so it
 * is bundled with esbuild and exercised directly — no browser, no env vars.
 *
 *   npm run verify:email-import
 */
import { build } from "esbuild";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const FIXTURE = "scripts/fixtures/email-pilot-import-sample.csv";

// Bundle inside the project so Node still resolves the external `xlsx` package.
const outDir = join(process.cwd(), "node_modules", ".cache", "email-pilot-csv");
mkdirSync(outDir, { recursive: true });
const outFile = join(outDir, "emailPilotCsv.mjs");

let failures = 0;
function check(label, condition, detail) {
  if (condition) {
    console.log(`  ok   ${label}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

try {
  await build({
    entryPoints: ["src/lib/emailPilotCsv.ts"],
    bundle: true,
    format: "esm",
    platform: "node",
    logLevel: "error",
    outfile: outFile,
    // xlsx is CJS and dynamically requires node builtins; let Node load it.
    external: ["xlsx"],
    // Mirror the `@/` alias from tsconfig/vite.
    alias: { "@": join(process.cwd(), "src") },
  });

  const { parseSpreadsheet, validateRow, slugify } = await import(
    pathToFileURL(outFile).href
  );

  const buffer = readFileSync(FIXTURE);
  const rows = parseSpreadsheet(
    buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
  );

  console.log(`\nParsed ${rows.length} rows from ${FIXTURE}\n`);
  check("all 8 fixture rows parsed", rows.length === 8, `got ${rows.length}`);

  const results = rows.map((row) => validateRow(row));
  const valid = results.filter((r) => r.normalized);
  const invalid = results.filter((r) => !r.normalized);

  console.log("\nValidation:");
  check("5 rows valid", valid.length === 5, `got ${valid.length}`);
  check("3 rows rejected", invalid.length === 3, `got ${invalid.length}`);

  check(
    "malformed email rejected",
    invalid.some((r) => r.issues.some((i) => i.includes("Invalid email address"))),
    JSON.stringify(invalid.map((r) => r.issues)),
  );
  check(
    "missing business name rejected",
    invalid.some((r) => r.issues.includes("Missing business name")),
  );
  check(
    "missing email rejected",
    invalid.some((r) => r.issues.includes("Missing email address")),
  );

  console.log("\nNormalisation:");
  const byEmail = new Map(valid.map((r) => [r.normalized.email, r.normalized]));

  check(
    "email lowercased",
    byEmail.has("info@casanostra.co.za"),
    [...byEmail.keys()].join(", "),
  );
  check(
    "header aliases resolved (Business Name -> business_name, Owner -> owner_first_name)",
    byEmail.get("hello@copperpot.co.za")?.business_name === "The Copper Pot" &&
      byEmail.get("hello@copperpot.co.za")?.owner_first_name === "Naledi",
  );
  check(
    "local phone normalised to E.164",
    byEmail.get("hello@copperpot.co.za")?.phone_e164 === "27821234567",
    byEmail.get("hello@copperpot.co.za")?.phone_e164,
  );
  check(
    "spaced +27 phone normalised",
    byEmail.get("suppressed@example.co.za")?.phone_e164 === "27829998888",
    byEmail.get("suppressed@example.co.za")?.phone_e164,
  );
  check(
    "already-27 phone left intact",
    byEmail.get("chef@ubuntukitchen.co.za")?.phone_e164 === "27841112222",
    byEmail.get("chef@ubuntukitchen.co.za")?.phone_e164,
  );
  check(
    "blank optional field becomes null",
    byEmail.get("info@casanostra.co.za")?.owner_first_name === null,
  );

  console.log("\nIn-file duplicate detection:");
  const seen = new Set();
  const duplicates = valid.filter((r) => {
    if (seen.has(r.normalized.email)) return true;
    seen.add(r.normalized.email);
    return false;
  });
  check("1 duplicate row detected", duplicates.length === 1, `got ${duplicates.length}`);
  check(
    "the 4 unique valid rows survive alongside the bad rows",
    seen.size === 4,
    `got ${seen.size}`,
  );

  console.log("\nSlug generation:");
  check(
    "punctuation and spaces slugified",
    slugify("Ubuntu Kitchen & Bar") === "ubuntu-kitchen-bar",
    slugify("Ubuntu Kitchen & Bar"),
  );
  check("empty name falls back", slugify("!!!") === "prospect", slugify("!!!"));

  console.log(
    failures === 0
      ? "\nAll import checks passed.\n"
      : `\n${failures} import check(s) failed.\n`,
  );
} finally {
  rmSync(outDir, { recursive: true, force: true });
}

process.exit(failures === 0 ? 0 : 1);
