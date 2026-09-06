/** Ad-hoc query helper: node scripts/db-query.mjs "select 1" */
import { readFileSync } from "node:fs";
import pg from "pg";
for (const l of readFileSync(new URL("../.env", import.meta.url), "utf8").split("\n")) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const c = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await c.connect();
const r = await c.query(process.argv[2]);
console.table(r.rows);
await c.end();
