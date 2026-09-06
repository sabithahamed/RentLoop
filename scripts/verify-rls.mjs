/**
 * Proves the security model, rather than assuming it.
 *
 * Creates two real users, has each create a tenancy, then checks that neither
 * can see the other's. SPEC.md's last acceptance criterion, automated: verified
 * by query, not by the absence of a UI path.
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

for (const l of readFileSync(new URL("../.env", import.meta.url), "utf8").split("\n")) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const stamp = Date.now();

async function makeUser(tag) {
  const c = createClient(url, key, { auth: { persistSession: false } });
  const email = `rls-${tag}-${stamp}@rentlooptest.dev`;
  const password = `Test-${stamp}-${tag}`;

  const { data, error } = await c.auth.signUp({ email, password });
  if (error) throw new Error(`signUp(${tag}): ${error.message}`);
  if (!data.session) {
    const { data: si, error: se } = await c.auth.signInWithPassword({ email, password });
    if (se) throw new Error(`signIn(${tag}): ${se.message} — email confirmation is probably ON`);
    if (!si.session) throw new Error(`no session for ${tag}`);
  }
  const { data: u } = await c.auth.getUser();
  return { client: c, id: u.user.id, email };
}

async function seed(u, label) {
  const { data: prop, error: pe } = await u.client
    .from("properties")
    .insert({ owner_id: u.id, label })
    .select()
    .single();
  if (pe) throw new Error(`property: ${pe.message}`);

  const { data: land, error: le } = await u.client
    .from("landlord_contacts")
    .insert({ owner_id: u.id, full_name: `${label} landlord` })
    .select()
    .single();
  if (le) throw new Error(`landlord: ${le.message}`);

  const { data: ten, error: te } = await u.client
    .from("tenancies")
    .insert({
      owner_id: u.id,
      property_id: prop.id,
      landlord_contact_id: land.id,
      rent_amount_cents: 4500000,
      due_day_of_month: 5,
      started_on: "2026-01-01",
    })
    .select()
    .single();
  if (te) throw new Error(`tenancy: ${te.message}`);

  const { error: ke } = await u.client.from("maintenance_tickets").insert({
    tenancy_id: ten.id,
    title: `${label} secret repair`,
    reported_by: "tenant",
  });
  if (ke) throw new Error(`ticket: ${ke.message}`);

  return ten.id;
}

const A = await makeUser("a");
const B = await makeUser("b");
console.log(`✓ two users created`);

const tenA = await seed(A, "A-property");
const tenB = await seed(B, "B-property");
console.log(`✓ each created a tenancy with a maintenance ticket`);

let failures = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "✓" : "✗"} ${name}${detail ? " — " + detail : ""}`);
  if (!ok) failures++;
};

const { data: bSeesA } = await B.client.from("tenancies").select("id").eq("id", tenA);
check("B cannot read A's tenancy", (bSeesA ?? []).length === 0, `saw ${(bSeesA ?? []).length}`);

const { data: bTickets } = await B.client.from("maintenance_tickets").select("title");
check(
  "B only sees B's tickets",
  (bTickets ?? []).every((t) => t.title.startsWith("B-")),
  `saw: ${(bTickets ?? []).map((t) => t.title).join(", ") || "none"}`,
);

const { data: bLedger } = await B.client.from("rent_period_summaries").select("tenancy_id");
check(
  "the summary view leaks nothing",
  (bLedger ?? []).every((r) => r.tenancy_id === tenB),
  `${(bLedger ?? []).length} rows`,
);

const { error: writeErr } = await B.client
  .from("maintenance_tickets")
  .insert({ tenancy_id: tenA, title: "B injecting into A", reported_by: "tenant" });
check("B cannot write into A's tenancy", Boolean(writeErr), writeErr?.code ?? "INSERT SUCCEEDED");

const { data: ownTen } = await A.client.from("tenancies").select("id");
check("A can still read A's own tenancy", (ownTen ?? []).length === 1);

console.log(failures === 0 ? "\nRLS holds." : `\n${failures} FAILURE(S) — do not ship this.`);
process.exit(failures === 0 ? 0 : 1);
