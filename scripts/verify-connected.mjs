/**
 * Proves connected mode with two real accounts.
 *
 * The tenant invites; a separate landlord account redeems the code; the
 * landlord can then read the tenancy and its ledger — and still cannot read
 * anything belonging to a third party.
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

let failures = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "✓" : "✗"} ${name}${detail ? " — " + detail : ""}`);
  if (!ok) failures++;
};

async function makeUser(tag) {
  const c = createClient(url, key, { auth: { persistSession: false } });
  const email = `conn-${tag}-${stamp}@rentlooptest.dev`;
  const password = `Test-${stamp}-${tag}`;
  const { error } = await c.auth.signUp({ email, password });
  if (error) throw new Error(`${tag}: ${error.message}`);
  await c.auth.signInWithPassword({ email, password });
  const { data } = await c.auth.getUser();
  return { c, id: data.user.id };
}

// The tenant: demo account, already seeded.
const tenant = createClient(url, key, { auth: { persistSession: false } });
const { error: tErr } = await tenant.auth.signInWithPassword({
  email: "tenant@rentloop.lk",
  password: "demo1234",
});
if (tErr) {
  console.error(`✗ demo tenant sign-in: ${tErr.message}`);
  process.exit(1);
}
const { data: tUser } = await tenant.auth.getUser();

const { data: tenancy } = await tenant
  .from("tenancies")
  .select("id")
  .eq("owner_id", tUser.user.id)
  .eq("status", "active")
  .single();

// Create + send the invite as the tenant.
const code = Array.from(
  { length: 6 },
  () => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[Math.floor(Math.random() * 32)],
).join("");

await tenant.from("invitations").delete().eq("tenancy_id", tenancy.id);
const { error: invErr } = await tenant.from("invitations").insert({
  tenancy_id: tenancy.id,
  code,
  invited_name: "Mr. Perera",
  status: "sent",
  sent_on: new Date().toISOString().slice(0, 10),
});
check("tenant can create an invite", !invErr, invErr?.message ?? "");

const landlord = await makeUser("landlord");
const stranger = await makeUser("stranger");

// Before redeeming, the landlord must see nothing.
const { data: before } = await landlord.c.from("tenancies").select("id").eq("id", tenancy.id);
check("landlord sees nothing before redeeming", (before ?? []).length === 0);

const { data: redeemed, error: redeemErr } = await landlord.c.rpc("redeem_invitation", {
  p_code: code,
});
check("landlord redeems the code", !redeemErr, redeemErr?.message ?? "");

const { data: after } = await landlord.c.from("tenancies").select("id").eq("id", tenancy.id);
check("landlord can now read the tenancy", (after ?? []).length === 1);

const { data: ledger } = await landlord.c
  .from("rent_period_summaries")
  .select("id")
  .eq("tenancy_id", tenancy.id);
check(
  "landlord can read the rent ledger",
  (ledger ?? []).length > 0,
  `${(ledger ?? []).length} months`,
);

const { data: tickets } = await landlord.c
  .from("maintenance_tickets")
  .select("id")
  .eq("tenancy_id", tenancy.id);
check("landlord can read the repairs", (tickets ?? []).length > 0, `${(tickets ?? []).length}`);

// A third party still sees nothing.
const { data: peek } = await stranger.c.from("tenancies").select("id").eq("id", tenancy.id);
check("an unrelated account still sees nothing", (peek ?? []).length === 0);

const { error: reuseErr } = await stranger.c.rpc("redeem_invitation", { p_code: code });
check("a used code cannot be redeemed again", Boolean(reuseErr), reuseErr?.message ?? "IT WORKED");

// The tenant cannot join their own tenancy as landlord.
await tenant.from("invitations").update({ status: "sent" }).eq("tenancy_id", tenancy.id);
const { error: selfErr } = await tenant.rpc("redeem_invitation", { p_code: code });
check(
  "the tenant cannot join their own tenancy",
  Boolean(selfErr),
  selfErr?.message ?? "IT WORKED",
);

console.log(failures === 0 ? "\nConnected mode holds." : `\n${failures} FAILURE(S).`);
process.exit(failures === 0 ? 0 : 1);
