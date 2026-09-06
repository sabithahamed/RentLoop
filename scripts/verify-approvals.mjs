/**
 * Proves the landlord-to-tenant connection, against the real database.
 *
 *   node scripts/verify-approvals.mjs
 *
 * The claim being tested is that a code is not access. Someone holding a valid
 * code can ask to join and nothing else — no ledger, no repairs, no property —
 * until the landlord approves. Codes get forwarded and screenshotted, so if
 * holding one were enough, the approval screen would be decoration.
 *
 * Also checks the two ways this could go wrong quietly: an outsider who was
 * never invited seeing anything, and a requester approving themselves.
 */

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

for (const line of readFileSync(new URL("../.env", import.meta.url), "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const URL_ = process.env.EXPO_PUBLIC_SUPABASE_URL;
const KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

let failures = 0;
const check = (ok, label, detail = "") => {
  console.log(`${ok ? "✓" : "✗"} ${label}${detail && !ok ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
};

const stamp = Date.now().toString(36);
const landlord = createClient(URL_, KEY, { auth: { persistSession: false } });
const tenant = createClient(URL_, KEY, { auth: { persistSession: false } });
const outsider = createClient(URL_, KEY, { auth: { persistSession: false } });

async function account(client, tag, role) {
  const email = `approve-${tag}-${stamp}@rentlooptest.dev`;
  const password = `Test-${stamp}-${tag}`;
  const { error } = await client.auth.signUp({ email, password });
  if (error && !/already/i.test(error.message)) throw new Error(error.message);
  await client.auth.signInWithPassword({ email, password });

  const { data } = await client.auth.getUser();
  await client.from("profiles").upsert({
    id: data.user.id,
    display_name: `${tag} ${stamp}`,
    phone: "0771234567",
    role,
  });
  return data.user.id;
}

const landlordId = await account(landlord, "landlord", "landlord");
await account(tenant, "tenant", "tenant");
await account(outsider, "outsider", "tenant");
console.log("Three accounts: a landlord, a tenant, and an uninvited third party\n");

// --- the landlord puts a property up -----------------------------------------

const { data: property } = await landlord
  .from("properties")
  .insert({ owner_id: landlordId, label: `Verify annex ${stamp}`, city: "Nugegoda" })
  .select()
  .single();

const { data: contact } = await landlord
  .from("landlord_contacts")
  .insert({ owner_id: landlordId, full_name: "Test Landlord", linked_user_id: landlordId })
  .select()
  .single();

const { data: tenancy, error: tErr } = await landlord
  .from("tenancies")
  .insert({
    owner_id: landlordId,
    property_id: property.id,
    landlord_contact_id: contact.id,
    rent_amount_cents: 45_000_00,
    due_day_of_month: 5,
    started_on: new Date().toISOString().slice(0, 10),
  })
  .select()
  .single();
check(!tErr && !!tenancy, "A landlord can create a property they let", tErr?.message);

await landlord
  .from("tenancy_members")
  .insert({ tenancy_id: tenancy.id, user_id: landlordId, role: "landlord" });

// --- and issues a code -------------------------------------------------------

const code = `T${stamp.slice(-5).toUpperCase()}`;
const { error: inviteErr } = await landlord
  .from("tenant_invites")
  .insert({ tenancy_id: tenancy.id, code, label: "The tenant", created_by: landlordId });
check(!inviteErr, "…and issue a code for a tenant", inviteErr?.message);

// --- before approval, the code holder has nothing ----------------------------

const { data: seenBefore } = await tenant.from("tenancies").select("id").eq("id", tenancy.id);
check(seenBefore?.length === 0, "Before asking, the tenant sees nothing");

const { error: askErr } = await tenant.rpc("request_to_join", {
  p_code: code,
  p_message: "Moving in on the 1st",
});
check(!askErr, "The tenant can ask to join with the code", askErr?.message);

const { data: seenAfterAsk } = await tenant.from("tenancies").select("id").eq("id", tenancy.id);
check(
  seenAfterAsk?.length === 0,
  "Asking grants nothing — the property is still invisible",
  "the tenancy was readable before approval",
);

const { data: request } = await landlord
  .from("tenancy_join_requests")
  .select("*")
  .eq("tenancy_id", tenancy.id)
  .single();
check(!!request, "The landlord sees the request");
check(
  request?.from_name?.includes("tenant"),
  "…with the requester's name on it",
  `got ${request?.from_name}`,
);
check(request?.message === "Moving in on the 1st", "…and what they said");

// --- an outsider is nowhere near it ------------------------------------------

const { data: outsiderSees } = await outsider
  .from("tenancy_join_requests")
  .select("id")
  .eq("tenancy_id", tenancy.id);
check(outsiderSees?.length === 0, "An uninvited third party sees no requests");

// --- the requester cannot approve themselves ---------------------------------

const { error: selfApprove } = await tenant.rpc("decide_join_request", {
  p_request_id: request.id,
  p_approve: true,
});
check(!!selfApprove, "The requester cannot approve their own request", "it was allowed");

const { data: stillOut } = await tenant.from("tenancies").select("id").eq("id", tenancy.id);
check(stillOut?.length === 0, "…and still sees nothing after trying");

// --- approval opens the door -------------------------------------------------

const { error: approveErr } = await landlord.rpc("decide_join_request", {
  p_request_id: request.id,
  p_approve: true,
});
check(!approveErr, "The landlord approves", approveErr?.message);

const { data: seenAfter } = await tenant.from("tenancies").select("id").eq("id", tenancy.id);
check(seenAfter?.length === 1, "Now the tenant sees the property");

const { data: ledgerAfter, error: ledgerErr } = await tenant
  .from("rent_periods")
  .select("id")
  .eq("tenancy_id", tenancy.id);
check(!ledgerErr, "…and can read its ledger", ledgerErr?.message);
console.log(`  (${ledgerAfter?.length ?? 0} rent periods visible)`);

const { data: outsiderAfter } = await outsider.from("tenancies").select("id").eq("id", tenancy.id);
check(outsiderAfter?.length === 0, "The third party still sees nothing");

// --- a decided request cannot be decided twice -------------------------------

const { error: twice } = await landlord.rpc("decide_join_request", {
  p_request_id: request.id,
  p_approve: false,
});
check(!!twice, "A decided request cannot be flipped afterwards", "it was allowed");

// --- cleanup -----------------------------------------------------------------

await landlord.from("tenancies").delete().eq("id", tenancy.id);
await landlord.from("properties").delete().eq("id", property.id);

console.log(`\n${failures === 0 ? "✓ All approval checks passed" : `✗ ${failures} failed`}`);
process.exit(failures === 0 ? 0 : 1);
