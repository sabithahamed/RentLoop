/**
 * Proves the landlord side of discovery, against the real database.
 *
 *   node scripts/verify-listings.mjs
 *
 * The interesting assertion is not that a listing saves. It is that a landlord
 * cannot write their own reputation: 003 grants them `for all` on their own
 * rows, which is right about ownership and says nothing about which columns
 * they may set. 006 takes verified, rating and tenancy_count away from the
 * client and computes them. This script sends a listing that lies about all
 * three and checks the database ignores it.
 *
 * Runs as a throwaway account, and cleans up after itself.
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
const other = createClient(URL_, KEY, { auth: { persistSession: false } });

async function account(client, tag) {
  const email = `listing-${tag}-${stamp}@rentlooptest.dev`;
  const password = `Test-${stamp}-${tag}`;
  const { error } = await client.auth.signUp({
    email,
    password,
    options: { data: { display_name: `${tag} ${stamp}` } },
  });
  if (error && !/already/i.test(error.message)) throw new Error(error.message);
  await client.auth.signInWithPassword({ email, password });

  const { data } = await client.auth.getUser();
  await client
    .from("profiles")
    .upsert({ id: data.user.id, display_name: `${tag} ${stamp}`, phone: "0771234567" });
  return data.user.id;
}

const landlordId = await account(landlord, "landlord");
const otherId = await account(other, "enquirer");
console.log(`Two accounts: landlord ${landlordId.slice(0, 8)}, enquirer ${otherId.slice(0, 8)}\n`);

// --- posting -----------------------------------------------------------------

const { data: created, error: createError } = await landlord
  .from("listings")
  .insert({
    landlord_id: landlordId,
    landlord_name: "Test Landlord",
    title: "Verification annex",
    description: "Posted by scripts/verify-listings.mjs",
    city: "Nugegoda",
    rent_cents: 45_000_00,
    deposit_cents: 90_000_00,
    bedrooms: 2,
    bathrooms: 1,
    property_type: "annex",
    furnished: "semi",
    // The lie. This account has completed no tenancies at all.
    verified: true,
    tenancy_count: 99,
    rating: 5,
  })
  .select()
  .single();

check(!createError, "A landlord can post a listing", createError?.message);
if (createError) process.exit(1);

check(
  created.verified === false,
  "verified is overwritten, not trusted",
  `got ${created.verified}`,
);
check(created.tenancy_count === 0, "tenancy_count is recomputed", `got ${created.tenancy_count}`);
check(created.rating === null, "rating cannot be self-awarded", `got ${created.rating}`);

// Editing is the other way in. Same answer.
const { data: edited } = await landlord
  .from("listings")
  .update({ title: "Verification annex (edited)", verified: true, tenancy_count: 42 })
  .eq("id", created.id)
  .select()
  .single();

check(edited?.title === "Verification annex (edited)", "A landlord can edit their own listing");
check(edited?.verified === false, "An edit cannot smuggle the badge in either");

// --- other people ------------------------------------------------------------

const { error: hijack } = await other
  .from("listings")
  .update({ title: "Hijacked" })
  .eq("id", created.id);
const { data: afterHijack } = await landlord
  .from("listings")
  .select("title")
  .eq("id", created.id)
  .single();
check(
  afterHijack.title !== "Hijacked",
  "Someone else cannot edit the listing",
  hijack ? hijack.message : "the update went through",
);

const { data: visible } = await other.from("listings").select("id").eq("id", created.id);
check(visible?.length === 1, "Everyone signed in can see an active listing");

// --- enquiries ---------------------------------------------------------------

const { error: enquiryError } = await other
  .from("enquiries")
  .insert({ listing_id: created.id, from_user: otherId, message: "Is it still available?" });
check(!enquiryError, "Someone can enquire", enquiryError?.message);

const { data: received } = await landlord
  .from("enquiries")
  .select("*")
  .eq("listing_id", created.id);
check(received?.length === 1, "The landlord receives it");
check(
  received?.[0]?.from_name?.includes("enquirer"),
  "The enquiry carries the sender's name",
  `got ${received?.[0]?.from_name}`,
);
check(received?.[0]?.from_phone === "0771234567", "…and their number, so it can be answered");

const { data: profileLeak } = await landlord.from("profiles").select("*").eq("id", otherId);
check(
  profileLeak?.length === 0,
  "…without opening their profile to the landlord",
  "the profile was readable",
);

// --- taking it down ----------------------------------------------------------

await landlord.from("listings").update({ is_active: false }).eq("id", created.id);

const { data: goneForOthers } = await other.from("listings").select("id").eq("id", created.id);
check(goneForOthers?.length === 0, "A taken-down listing leaves the search");

const { data: stillMine } = await landlord.from("listings").select("id").eq("id", created.id);
check(stillMine?.length === 1, "…but its author can still see it");

// --- cleanup -----------------------------------------------------------------

await landlord.from("listings").delete().eq("id", created.id);
console.log(`\n${failures === 0 ? "✓ All listing checks passed" : `✗ ${failures} failed`}`);
process.exit(failures === 0 ? 0 : 1);
