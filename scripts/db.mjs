/**
 * Runs a .sql file against the Supabase Postgres.
 *
 *   node scripts/db.mjs supabase/schema.sql
 *   node scripts/db.mjs --check          (connectivity + table list)
 *
 * Reads DATABASE_URL from .env. That variable is deliberately NOT prefixed
 * EXPO_PUBLIC_, so it never reaches the app bundle — it is a build-time tool
 * credential, not something the phone should ever hold.
 */

import { readFileSync } from "node:fs";
import pg from "pg";

for (const line of readFileSync(new URL("../.env", import.meta.url), "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("✗ No DATABASE_URL in .env");
  process.exit(1);
}

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });

try {
  await client.connect();
} catch (e) {
  console.error(`✗ Could not connect: ${e.message}`);
  process.exit(1);
}

const arg = process.argv[2];

if (!arg || arg === "--check") {
  const { rows } = await client.query(
    `select table_name from information_schema.tables
     where table_schema = 'public' order by table_name`,
  );
  console.log(`✓ Connected. ${rows.length} tables in public:`);
  console.log(rows.length ? rows.map((r) => "  " + r.table_name).join("\n") : "  (none yet)");
  await client.end();
  process.exit(0);
}

const sql = readFileSync(arg, "utf8");
console.log(`Applying ${arg} (${sql.split("\n").length} lines)…`);

try {
  await client.query(sql);
  console.log("✓ Applied cleanly");
} catch (e) {
  console.error(`✗ ${e.message}`);
  if (e.position) {
    const upto = sql.slice(0, Number(e.position));
    console.error(`  near line ${upto.split("\n").length}: ${upto.split("\n").pop()}`);
  }
  await client.end();
  process.exit(1);
}

await client.end();
