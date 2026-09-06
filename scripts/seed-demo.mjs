/**
 * Seeds the demo tenancy into Supabase.
 *
 *   node scripts/seed-demo.mjs
 *
 * Recreates the story the mock told — six months of mixed payment history, an
 * agreement awaiting confirmation, move-in evidence with a deliberate gap, live
 * repairs, and a previous tenancy whose deposit is being argued over — except
 * now it is real rows a judge can watch survive a reload.
 *
 * Safe to re-run: it wipes this demo account's tenancies first (children
 * cascade) and rebuilds. It touches no other account.
 */

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

for (const l of readFileSync(new URL("../.env", import.meta.url), "utf8").split("\n")) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const DEMO_EMAIL = "tenant@rentloop.lk";
const DEMO_PASSWORD = "demo1234";
const DEMO_NAME = "Sabith";

const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { persistSession: false } },
);

// --- dates, relative to today so the ledger always looks alive ---------------

const pad = (n) => String(n).padStart(2, "0");
const iso = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const today = new Date();
const monthStart = (offset) =>
  new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + offset, 1));
const daysInMonth = (d) =>
  new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
const dayOf = (d, day) =>
  iso(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), Math.min(day, daysInMonth(d)))));

const RENT = 45_000_00;
const DUE_DAY = 5;

// --- sign in -----------------------------------------------------------------

let { data: auth, error } = await supabase.auth.signInWithPassword({
  email: DEMO_EMAIL,
  password: DEMO_PASSWORD,
});

if (error) {
  const signUp = await supabase.auth.signUp({
    email: DEMO_EMAIL,
    password: DEMO_PASSWORD,
    options: { data: { display_name: DEMO_NAME } },
  });
  if (signUp.error) {
    console.error(`✗ Could not create the demo account: ${signUp.error.message}`);
    process.exit(1);
  }
  auth = signUp.data;
  if (!auth.session) {
    const again = await supabase.auth.signInWithPassword({
      email: DEMO_EMAIL,
      password: DEMO_PASSWORD,
    });
    if (again.error) {
      console.error(`✗ Signed up but cannot sign in — is email confirmation still on?`);
      process.exit(1);
    }
    auth = again.data;
  }
}

const userId = auth.user.id;
console.log(`✓ Signed in as ${DEMO_EMAIL}`);

await supabase.from("profiles").upsert({ id: userId, display_name: DEMO_NAME });

// Wipe this account's tenancies; everything else cascades.
const { data: old } = await supabase.from("tenancies").select("id").eq("owner_id", userId);
if (old?.length) {
  await supabase
    .from("tenancies")
    .delete()
    .in(
      "id",
      old.map((t) => t.id),
    );
  console.log(`✓ Cleared ${old.length} previous demo tenanc${old.length === 1 ? "y" : "ies"}`);
}
await supabase.from("properties").delete().eq("owner_id", userId);
await supabase.from("landlord_contacts").delete().eq("owner_id", userId);

const must = (label, { data, error }) => {
  if (error) {
    console.error(`✗ ${label}: ${error.message}`);
    process.exit(1);
  }
  return data;
};

async function makeTenancy({ label, address, city, landlord, phone, rent, dueDay, start, end }) {
  const property = must(
    "property",
    await supabase
      .from("properties")
      .insert({ owner_id: userId, label, address_line: address, city })
      .select()
      .single(),
  );

  const contact = must(
    "landlord",
    await supabase
      .from("landlord_contacts")
      .insert({ owner_id: userId, full_name: landlord, phone })
      .select()
      .single(),
  );

  const tenancy = must(
    "tenancy",
    await supabase
      .from("tenancies")
      .insert({
        owner_id: userId,
        property_id: property.id,
        landlord_contact_id: contact.id,
        rent_amount_cents: rent,
        due_day_of_month: dueDay,
        started_on: start,
        ended_on: end ?? null,
        status: end ? "ended" : "active",
      })
      .select()
      .single(),
  );

  return { property, contact, tenancy };
}

// --- current tenancy ---------------------------------------------------------

const startMonth = monthStart(-6);
const current = await makeTenancy({
  label: "Annex, Nugegoda",
  address: "14/3 Sarana Road",
  city: "Nugegoda",
  landlord: "Mr. Perera",
  phone: "077 412 8890",
  rent: RENT,
  dueDay: DUE_DAY,
  start: iso(startMonth),
});
console.log(`✓ Current tenancy: Annex, Nugegoda`);

// Rent periods, six back through three ahead.
const periods = [];
for (let offset = -6; offset <= 3; offset++) {
  const m = monthStart(offset);
  periods.push({
    owner_id: userId,
    tenancy_id: current.tenancy.id,
    period_month: iso(m),
    due_date: dayOf(m, DUE_DAY),
    amount_due_cents: RENT,
  });
}
const inserted = must("periods", await supabase.from("rent_periods").insert(periods).select());
const at = (offset) => inserted.find((p) => p.period_month === iso(monthStart(offset)));

// Payments shaped so every ledger status is on screen at once.
const pay = (offset, amount, day, extra = {}) => ({
  owner_id: userId,
  rent_period_id: at(offset).id,
  tenancy_id: current.tenancy.id,
  amount_cents: amount,
  paid_on: dayOf(monthStart(offset), day),
  method: "bank_transfer",
  ...extra,
});

must(
  "payments",
  await supabase.from("payments").insert([
    pay(-6, RENT, 4, { reference: "CT 8842190" }),
    // Overpaid — rounded up to clear a small utility share.
    pay(-5, 46_000_00, 5, { reference: "CT 8901355", note: "Paid extra 1,000 for the water bill" }),
    // Settled by two transfers; the second has no slip.
    pay(-4, 20_000_00, 5, { reference: "CT 9013877" }),
    pay(-4, 25_000_00, 18, { note: "Balance after salary" }),
    // Cash, so there is no slip to photograph.
    pay(-3, RENT, 6, { method: "cash", note: "Handed over in person" }),
    // Part paid and past due — must still read `partial`, not `overdue`.
    pay(-2, 20_000_00, 7, { reference: "CT 9241006" }),
    // -1 unpaid (overdue), 0 unpaid (due), +1..+3 upcoming.
  ]),
);
console.log(`✓ ${inserted.length} rent periods, 6 payments covering every status`);

// --- agreement ---------------------------------------------------------------

const endsOn = iso(monthStart(6));
const agreement = must(
  "agreement",
  await supabase
    .from("agreements")
    .insert({
      tenancy_id: current.tenancy.id,
      file_name: "Rental agreement - Sarana Road.pdf",
      status: "needs_review",
      ends_on: endsOn,
      notice_period_days: 60,
      deposit_cents: 90_000_00,
    })
    .select()
    .single(),
);

must(
  "terms",
  await supabase.from("agreement_terms").insert([
    {
      agreement_id: agreement.id,
      position: 0,
      label: "Monthly rent",
      value: "Rs. 45,000",
      confidence: 0.97,
      confirmed: true,
      source_quote: "the Tenant shall pay a monthly rental of Rupees Forty Five Thousand",
    },
    {
      agreement_id: agreement.id,
      position: 1,
      label: "Refundable deposit",
      value: "Rs. 90,000",
      confidence: 0.94,
      confirmed: true,
      source_quote: "a refundable deposit equivalent to two months rental",
    },
    {
      agreement_id: agreement.id,
      position: 2,
      label: "Rent due date",
      value: "5th of each month",
      confidence: 0.91,
      confirmed: true,
      source_quote: "payable on or before the 5th day of each calendar month",
    },
    {
      agreement_id: agreement.id,
      position: 3,
      label: "Notice period",
      value: "60 days",
      confidence: 0.72,
      confirmed: false,
      source_quote: "either party may terminate by giving two months notice in writing",
    },
    {
      agreement_id: agreement.id,
      position: 4,
      label: "Agreement ends",
      value: endsOn,
      confidence: 0.88,
      confirmed: false,
      source_quote: "for a term of twelve (12) months commencing from the date hereof",
    },
    {
      agreement_id: agreement.id,
      position: 5,
      label: "Who pays for repairs",
      value: "Landlord — structural only",
      confidence: 0.58,
      confirmed: false,
      source_quote:
        "major repairs of a structural nature shall be borne by the Landlord, all other repairs by the Tenant",
    },
  ]),
);

must(
  "clauses",
  await supabase.from("agreement_clauses").insert([
    {
      agreement_id: agreement.id,
      text: "All other repairs by the Tenant.",
      reason:
        "Unusually broad. As written this could include plumbing and electrical faults that are normally the landlord's responsibility.",
    },
    {
      agreement_id: agreement.id,
      text: "The deposit shall be refunded subject to satisfactory condition of the premises.",
      reason:
        '"Satisfactory" is not defined anywhere in the document. Your move-in photos are what will decide this.',
    },
  ]),
);
console.log(`✓ Agreement with 6 extracted terms, 3 awaiting confirmation`);

// --- move-in inspection ------------------------------------------------------

const STANDARD_AREAS = [
  ["Living room", "Walls", true],
  ["Living room", "Ceiling", true],
  ["Living room", "Floor", true],
  ["Living room", "Windows and locks", true],
  ["Kitchen", "Sink and taps", true],
  ["Kitchen", "Cupboards", false],
  ["Bathroom", "Ceiling", true],
  ["Bathroom", "Toilet and fittings", true],
  ["Bedroom", "Walls", true],
  ["Bedroom", "Wardrobe", false],
  ["Utilities", "Electricity meter", true],
  ["Utilities", "Water meter", true],
];

async function makeInspection(tenancyId, kind, capturedNames, on) {
  const session = must(
    "inspection",
    await supabase
      .from("inspection_sessions")
      .insert({ tenancy_id: tenancyId, kind, status: "complete", started_on: on, completed_on: on })
      .select()
      .single(),
  );

  const areas = must(
    "areas",
    await supabase
      .from("inspection_areas")
      .insert(
        STANDARD_AREAS.map(([room, name, required], i) => ({
          session_id: session.id,
          room,
          name,
          required,
          position: i,
        })),
      )
      .select(),
  );

  const photos = areas
    .filter((a) => capturedNames.some(([r, n]) => r === a.room && n === a.name))
    .map((a) => ({
      area_id: a.id,
      storage_path: `mock://photo/${encodeURIComponent(`${a.room} — ${a.name}`)}`,
      captured_at: `${on}T10:00:00Z`,
    }));

  if (photos.length) must("photos", await supabase.from("inspection_photos").insert(photos));
  return { session, areas };
}

// The bathroom ceiling is deliberately absent — it is what the assistant
// notices, and a demo where nothing is missing shows nothing.
await makeInspection(
  current.tenancy.id,
  "move_in",
  [
    ["Living room", "Walls"],
    ["Living room", "Ceiling"],
    ["Living room", "Floor"],
    ["Living room", "Windows and locks"],
    ["Kitchen", "Sink and taps"],
    ["Kitchen", "Cupboards"],
    ["Bathroom", "Toilet and fittings"],
    ["Bedroom", "Walls"],
    ["Bedroom", "Wardrobe"],
    ["Utilities", "Electricity meter"],
    ["Utilities", "Water meter"],
  ],
  iso(startMonth),
);
console.log(`✓ Move-in evidence — bathroom ceiling deliberately missing`);

// --- maintenance -------------------------------------------------------------

const daysAgo = (n) => {
  const d = new Date(today);
  d.setUTCDate(d.getUTCDate() - n);
  return iso(d);
};

async function makeTicket(t) {
  const ticket = must(
    "ticket",
    await supabase
      .from("maintenance_tickets")
      .insert({
        tenancy_id: current.tenancy.id,
        title: t.title,
        description: t.description,
        category: t.category,
        urgency: t.urgency,
        status: t.status,
        reported_by: "tenant",
        reported_on: daysAgo(t.events[0].daysAgo),
        photo_paths: [`mock://photo/${encodeURIComponent(t.title)}`],
        cost_cents: t.cost ?? null,
      })
      .select()
      .single(),
  );

  must(
    "events",
    await supabase.from("maintenance_events").insert(
      t.events.map((e) => ({
        ticket_id: ticket.id,
        at: `${daysAgo(e.daysAgo)}T09:00:00Z`,
        actor_role: e.by,
        label: e.label,
        note: e.note ?? null,
        status_after: e.status ?? null,
      })),
    ),
  );
  return ticket;
}

const dampTicket = await makeTicket({
  title: "Damp patch spreading on bathroom ceiling",
  description:
    "It started as a small mark about three weeks ago and it is now roughly the size of a dinner plate. The paint has started to flake.",
  category: "structural",
  urgency: "high",
  status: "in_progress",
  events: [
    { daysAgo: 9, by: "tenant", label: "Reported the issue", status: "reported" },
    {
      daysAgo: 8,
      by: "landlord",
      label: "Acknowledged",
      note: "Will send someone this week.",
      status: "acknowledged",
    },
    { daysAgo: 5, by: "landlord", label: "Approved the repair", status: "approved" },
    {
      daysAgo: 2,
      by: "landlord",
      label: "Plumber visited",
      note: "Leak traced to the upstairs bathroom. Parts ordered.",
      status: "in_progress",
    },
  ],
});

await makeTicket({
  title: "Kitchen tap dripping constantly",
  description: "Drips even when fully closed. Wasting water and the sound carries at night.",
  category: "plumbing",
  urgency: "normal",
  status: "resolved",
  cost: 3_500_00,
  events: [
    { daysAgo: 47, by: "tenant", label: "Reported the issue", status: "reported" },
    { daysAgo: 45, by: "landlord", label: "Approved the repair", status: "approved" },
    {
      daysAgo: 41,
      by: "landlord",
      label: "Marked resolved",
      note: "Washer replaced. Rs. 3,500.",
      status: "resolved",
    },
  ],
});

await makeTicket({
  title: "Bedroom window latch will not close",
  description:
    "The latch turns but does not catch, so the window swings open in wind. Ground floor, so I would rather it locked.",
  category: "structural",
  urgency: "normal",
  status: "reported",
  events: [{ daysAgo: 3, by: "tenant", label: "Reported the issue", status: "reported" }],
});
console.log(`✓ 3 maintenance tickets with full timelines`);

// --- threads -----------------------------------------------------------------

async function makeThread(subject, about, msgs, unread = []) {
  const thread = must(
    "thread",
    await supabase
      .from("threads")
      .insert({
        tenancy_id: current.tenancy.id,
        subject,
        about_type: about.type,
        about_id: about.id ?? null,
        last_message_at: `${daysAgo(msgs[msgs.length - 1].daysAgo)}T09:00:00Z`,
        unread_for: unread,
      })
      .select()
      .single(),
  );

  must(
    "messages",
    await supabase.from("messages").insert(
      msgs.map((m, i) => ({
        thread_id: thread.id,
        actor_role: m.by,
        body: m.body,
        sent_at: `${daysAgo(m.daysAgo)}T${pad(8 + i)}:00:00Z`,
      })),
    ),
  );
}

await makeThread(
  "Bathroom ceiling",
  { type: "maintenance", id: dampTicket.id },
  [
    {
      daysAgo: 9,
      by: "tenant",
      body: "Sent photos of the ceiling. It has got noticeably worse this week.",
    },
    { daysAgo: 8, by: "landlord", body: "Saw them. I will send the plumber Thursday." },
    { daysAgo: 2, by: "landlord", body: "Plumber says it is coming from upstairs. Parts ordered." },
  ],
  ["tenant"],
);

await makeThread("June rent — paying in two parts", { type: "payment" }, [
  {
    daysAgo: 56,
    by: "tenant",
    body: "Salary is late this month. Can I send Rs. 20,000 now and the rest on the 18th?",
  },
  { daysAgo: 56, by: "landlord", body: "That is fine. Please put the reference on the slip." },
]);
console.log(`✓ 2 message threads, one unread`);

// --- previous tenancy: the deposit argument ----------------------------------

const pastStart = monthStart(-20);
const pastEnd = monthStart(-7);

const past = await makeTenancy({
  label: "Boarding room, Ratmalana",
  address: "22 Station Road",
  city: "Ratmalana",
  landlord: "Mrs. Gunawardena",
  phone: "071 335 2201",
  rent: 25_000_00,
  dueDay: 1,
  start: iso(pastStart),
  end: iso(pastEnd),
});

must(
  "past agreement",
  await supabase.from("agreements").insert({
    tenancy_id: past.tenancy.id,
    file_name: "Boarding room agreement.pdf",
    status: "confirmed",
    ends_on: iso(pastEnd),
    notice_period_days: 30,
    deposit_cents: 50_000_00,
  }),
);

// Damp the tenant reported and the landlord never repaired. Without this the
// deposit agent has nothing to find, and it is the whole point of the demo.
const pastDamp = must(
  "past ticket",
  await supabase
    .from("maintenance_tickets")
    .insert({
      tenancy_id: past.tenancy.id,
      title: "Damp coming through the bedroom wall above the bed",
      description:
        "There is a brown patch spreading on the wall behind the bed. It gets worse after heavy rain. It was not there when I moved in.",
      category: "structural",
      urgency: "high",
      status: "acknowledged",
      reported_by: "tenant",
      reported_on: iso(monthStart(-15)),
      photo_paths: ["mock://photo/Bedroom%20wall%20damp"],
    })
    .select()
    .single(),
);

must(
  "past events",
  await supabase.from("maintenance_events").insert([
    {
      ticket_id: pastDamp.id,
      at: `${iso(monthStart(-15))}T09:00:00Z`,
      actor_role: "tenant",
      label: "Reported the issue",
      note: "Sent photos of the wall.",
      status_after: "reported",
    },
    {
      ticket_id: pastDamp.id,
      at: `${iso(monthStart(-14))}T09:00:00Z`,
      actor_role: "landlord",
      label: "Acknowledged",
      note: "Will look into it after the rains.",
      status_after: "acknowledged",
    },
  ]),
);

await makeInspection(
  past.tenancy.id,
  "move_in",
  [
    ["Living room", "Walls"],
    ["Living room", "Ceiling"],
    ["Living room", "Floor"],
    ["Living room", "Windows and locks"],
    ["Kitchen", "Sink and taps"],
    ["Bathroom", "Toilet and fittings"],
    ["Utilities", "Electricity meter"],
    ["Utilities", "Water meter"],
  ],
  iso(pastStart),
);

await makeInspection(
  past.tenancy.id,
  "move_out",
  [
    ["Living room", "Walls"],
    ["Living room", "Ceiling"],
    ["Living room", "Floor"],
    ["Living room", "Windows and locks"],
    ["Kitchen", "Sink and taps"],
    ["Bathroom", "Toilet and fittings"],
    ["Utilities", "Electricity meter"],
    ["Utilities", "Water meter"],
  ],
  iso(pastEnd),
);

const settlement = must(
  "settlement",
  await supabase
    .from("deposit_settlements")
    .insert({ tenancy_id: past.tenancy.id, deposit_cents: 50_000_00, status: "disputed" })
    .select()
    .single(),
);

must(
  "deductions",
  await supabase.from("deductions").insert([
    {
      settlement_id: settlement.id,
      label: "Repaint bedroom wall",
      amount_cents: 12_000_00,
      reason: "Staining above the bed that was not present at move-in.",
      evidence_area_names: ["Walls"],
      proposed_by: "landlord",
      agreed: null,
    },
    {
      settlement_id: settlement.id,
      label: "Replace window latch",
      amount_cents: 4_500_00,
      reason: "Latch broken during the tenancy.",
      evidence_area_names: ["Windows and locks"],
      proposed_by: "landlord",
      agreed: true,
    },
    {
      settlement_id: settlement.id,
      label: "Deep clean",
      amount_cents: 8_000_00,
      reason: "Property required professional cleaning.",
      evidence_area_names: [],
      proposed_by: "landlord",
      agreed: false,
    },
  ]),
);

must(
  "reviews",
  await supabase.from("reviews").insert([
    {
      tenancy_id: past.tenancy.id,
      direction: "tenant_to_landlord",
      rating: 4,
      body: "Responsive about repairs and never late returning calls. Deposit process dragged on longer than it should have.",
    },
    {
      tenancy_id: past.tenancy.id,
      direction: "landlord_to_tenant",
      rating: 5,
      body: "Paid on time every month for 13 months. Left the place clean. Would rent to again.",
    },
  ]),
);
console.log(`✓ Past tenancy with a disputed deposit and an ignored damp report`);

console.log(`\nDone. Sign in as ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
