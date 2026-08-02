# RentLoop — Slice 1 Spec

**Scope:** a tenant signs up → creates a tenancy → records a payment with a photo of the bank slip → views a payment ledger.

**Stack:** React Native (Expo) + TypeScript. Supabase for auth, Postgres, and storage. The app talks to Supabase directly — no custom backend in this slice.

Background: [docs/VISION.md](docs/VISION.md). This document supersedes the vision doc wherever they disagree about *this* slice.

---

## 1. What is in and out

**In**

- Email + password sign-up and sign-in.
- Creating one tenancy: property, landlord contact, rent amount, due day of month, start date.
- A rent ledger: one row per month from the tenancy start onward, each showing what is owed, what has been paid, and its status.
- Recording a payment against a month, with an optional photo of the bank slip.
- Viewing a payment and its slip.

**Out (named so they are not accidentally designed in)**

- Landlord accounts, invitations, the landlord dashboard, connected mode.
- Agreements, maintenance, inspections, reminders/notifications, AI, deposits, utilities, payment gateways.
- Editing or deleting a tenancy after creation, ending a tenancy, multiple tenancies per user in the UI (the schema permits all of these; the screens do not expose them).

The slice is deliberately single-tenancy in the UI and multi-tenancy in the data. That asymmetry is intentional and is the main thing this spec buys.

---

## 2. Design decisions

Each of these was a real fork. Recording the reasoning so a later change is a decision, not an accident.

### 2.1 Property is its own table

A `properties` row (label, address) is separate from the `tenancies` row that references it.

A lease renewal is a *new tenancy at the same property*. Move-in and move-out inspections compare two moments at the same property. The landlord dashboard in Phase 2 is a list of properties. All three break if the address is a column on the tenancy.

Cost paid now: one extra table, and a join to render a ledger header.

**UI compromise:** the tenancy creation form is a single screen. It creates the property, the landlord contact, and the tenancy in one submit. There is no property picker and no property list in this slice — the table exists, the screen does not.

### 2.2 The landlord is a contact record, not a user

`landlord_contacts` holds a name, phone, and email, is **owned by the tenant**, and has a nullable `linked_user_id`.

This is the tenant-only vs connected-mode problem. In tenant-only mode the landlord may never install the app; the tenant still needs a name to put on a ledger. Modelling the landlord as plain text on the tenancy makes that easy today and expensive later: when the landlord does sign up, every tenancy that named them by string has to be found and backfilled, and there is nothing to attach shared records to.

With a contact row, connected mode is additive:

1. Set `linked_user_id` on the existing contact.
2. Add a `tenancy_members` table and widen the RLS policies (§5.3).

No payment, period, or tenancy row is reshaped. Nothing the tenant already recorded moves.

The contact stays tenant-owned even after linking. The tenant's private note that the landlord's number is a WhatsApp-only line is the tenant's data, not the landlord's profile.

### 2.3 Payments attach to a rent period, not to the tenancy

`rent_periods` are generated from the tenancy's start date and due day. A `payment` references a `rent_period_id`.

The alternative — a payment carrying a `period_label` string — is less code and gives a ledger that is just a list of what was paid. It can never say *"you have not paid July."* Absence of a row is not a fact you can query, sort, badge, or send a reminder about. Every retention mechanism in the vision doc (rent reminders, late-payment flags, AI payment matching) needs an addressable row for a month nobody has paid yet.

So the ledger is a list of **periods**, not a list of payments. Payments hang off periods.

### 2.4 A period holds its own `amount_due_cents`

Snapshotted from `tenancies.rent_amount_cents` when the period is generated, never read through a join at display time.

If the ledger read rent from the tenancy, a mid-lease rent increase would silently rewrite the whole payment history — last year's fully-paid months would recompute as underpaid. A ledger that changes retroactively is worthless as evidence, and deposit-dispute evidence is the reason this product exists.

### 2.5 Payments are partial-friendly and many-to-one

A period may have zero, one, or many payments. Status is **derived** from `sum(payments.amount_cents)` versus `amount_due_cents` — never stored, never hand-maintained.

Rent in Sri Lanka is routinely split: half now, half on payday. A one-payment-settles-one-period model cannot record what actually happened, which puts the app's record at odds with the bank's — the exact failure the product is supposed to remove.

Derived status also means there is no way for the ledger to drift out of sync with its own payments.

### 2.6 Periods come from a Postgres function, not the client

`ensure_rent_periods(tenancy_id, months_ahead)` creates any missing periods from the tenancy start through `months_ahead` months into the future. It is idempotent, protected by a unique constraint, and safe to call on every ledger open.

Client-side generation would work today and produce a tenancy that quietly runs out of ledger after twelve months. A one-shot insert trigger has the same horizon problem. The function is called from two places now (tenancy creation, ledger open) and is reusable later by a cron job or the landlord dashboard without reimplementation.

### 2.7 The bank slip is optional, one per payment

`payments.receipt_path` is nullable and holds a single storage object path.

Requiring a photo would block cash payments outright — normal for annexes and boarding houses, which are named target users. Optional also allows "record it now, add the slip tonight," which is when a tenant actually has the app open.

Because it is nullable, the ledger can badge payments that have no proof. That badge is more useful as a nudge than a hard block is as a gate.

Multiple attachments per payment (slip + WhatsApp screenshot) needs its own table and an attachment-management UI. Not this slice.

---

## 3. Assumptions

Stated rather than asked, and cheap to revisit:

- **Auth is email + password.** Phone OTP fits the market better but costs money per message and needs a provider; deferred.
- **Currency is LKR only.** A `currency` column exists on the tenancy for later; the UI hardcodes `Rs.` and does not offer a choice.
- **Money is stored as integer minor units** (`amount_cents`), never as a float. Postgres `numeric` returns as a string through supabase-js and invites accidental float arithmetic in JS; integers do not.
- **A due day of 29–31 clamps to the last day of a short month.** February's due date for a `31` tenancy is the 28th or 29th.
- **`period_month` is a `date` pinned to the 1st of the month**, not a string. It sorts, ranges, and compares correctly; a `'2026-08'` string does none of those in SQL.
- **Dates are calendar dates in the user's local sense** (`date`, not `timestamptz`). Rent is due on the 5th, not at an instant. Record-keeping columns (`created_at`) are `timestamptz`.
- **Rows are hard-deleted.** No soft delete in this slice.

---

## 4. Data model

### 4.1 Diagram

```
auth.users
    │ 1:1
profiles
    │ owns (owner_id on every row below)
    ├──── properties ─────────┐
    ├──── landlord_contacts ──┤
    │            │ nullable linked_user_id → auth.users  (connected mode, unused now)
    │            │            │
    └──── tenancies ──────────┘
              │ 1:N
          rent_periods          (one per month, generated)
              │ 1:N
           payments             (0..N per period, partial allowed)
              │ 0..1
        storage: receipts/<owner_id>/<payment_id>
```

### 4.2 Schema

```sql
-- Money is integer minor units (cents). Dates are calendar dates.

create table profiles (
  id           uuid primary key references auth.users on delete cascade,
  display_name text not null check (length(trim(display_name)) > 0),
  phone        text,
  created_at   timestamptz not null default now()
);

create table properties (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references auth.users on delete cascade,
  label        text not null check (length(trim(label)) > 0),  -- "Annex, Nugegoda"
  address_line text,
  city         text,
  created_at   timestamptz not null default now()
);

create table landlord_contacts (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null references auth.users on delete cascade,
  full_name      text not null check (length(trim(full_name)) > 0),
  phone          text,
  email          text,
  linked_user_id uuid references auth.users on delete set null,  -- connected mode
  created_at     timestamptz not null default now()
);

create type tenancy_status as enum ('active', 'ended');

create table tenancies (
  id                  uuid primary key default gen_random_uuid(),
  owner_id            uuid not null references auth.users on delete cascade,
  property_id         uuid not null references properties on delete restrict,
  landlord_contact_id uuid not null references landlord_contacts on delete restrict,
  rent_amount_cents   integer not null check (rent_amount_cents > 0),
  currency            text not null default 'LKR',
  due_day_of_month    smallint not null check (due_day_of_month between 1 and 31),
  started_on          date not null,
  ended_on            date,
  status              tenancy_status not null default 'active',
  created_at          timestamptz not null default now(),
  check (ended_on is null or ended_on >= started_on)
);

create table rent_periods (
  id               uuid primary key default gen_random_uuid(),
  owner_id         uuid not null references auth.users on delete cascade,
  tenancy_id       uuid not null references tenancies on delete cascade,
  period_month     date not null,     -- always the 1st: 2026-08-01
  due_date         date not null,     -- due_day_of_month, clamped to month length
  amount_due_cents integer not null check (amount_due_cents >= 0),  -- snapshot, see 2.4
  created_at       timestamptz not null default now(),
  unique (tenancy_id, period_month),
  check (period_month = date_trunc('month', period_month)::date)
);

create type payment_method as enum ('bank_transfer', 'cash', 'online', 'other');

create table payments (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null references auth.users on delete cascade,
  rent_period_id uuid not null references rent_periods on delete cascade,
  tenancy_id     uuid not null references tenancies on delete cascade,  -- denormalised, see note
  amount_cents   integer not null check (amount_cents > 0),
  paid_on        date not null,
  method         payment_method not null default 'bank_transfer',
  reference      text,            -- bank reference / slip number
  note           text,
  receipt_path   text,            -- storage object path, null = no proof yet
  created_at     timestamptz not null default now()
);

create index on rent_periods (tenancy_id, period_month desc);
create index on payments (rent_period_id);
create index on payments (tenancy_id, paid_on desc);
```

`payments.tenancy_id` is denormalised so "all payments for this tenancy" and the RLS check do not need a join through `rent_periods`. It must always equal `rent_periods.tenancy_id` for the referenced period; the insert path is the only writer and sets both from the same object. Enforce with a trigger if a second writer ever appears.

### 4.3 Ledger view

Status is derived here, in one place, so the app cannot invent a second definition.

```sql
create view rent_period_summary as
select
  p.id,
  p.owner_id,
  p.tenancy_id,
  p.period_month,
  p.due_date,
  p.amount_due_cents,
  coalesce(sum(pay.amount_cents), 0)::integer as paid_cents,
  (p.amount_due_cents - coalesce(sum(pay.amount_cents), 0))::integer as balance_cents,
  count(pay.id)::integer as payment_count,
  count(pay.id) filter (where pay.receipt_path is null)::integer as unproven_payment_count,
  max(pay.paid_on) as last_paid_on
from rent_periods p
left join payments pay on pay.rent_period_id = p.id
group by p.id;
```

The view inherits RLS from `rent_periods` and `payments` when created with `security_invoker = true`. Set it.

### 4.4 Status rules

`LedgerStatus` is computed from the summary row plus today's date, in this order — first match wins:

| Status     | Condition                                                    |
| ---------- | ------------------------------------------------------------ |
| `overpaid` | `paid_cents > amount_due_cents`                               |
| `paid`     | `paid_cents === amount_due_cents` (and `> 0`)                 |
| `partial`  | `0 < paid_cents < amount_due_cents`                           |
| `overdue`  | `paid_cents === 0` and `due_date < today`                     |
| `due`      | `paid_cents === 0` and `due_date` is today or within 7 days   |
| `upcoming` | otherwise                                                     |

A partially paid month that is past its due date shows as `partial`, not `overdue` — the tenant did pay something, and telling them otherwise is wrong. The remaining balance is shown alongside.

This table is the single source of truth for the rule. It is implemented once, in `src/data/ledger.ts`, and consumed by every screen.

### 4.5 Period generation

```sql
create or replace function ensure_rent_periods(
  p_tenancy_id  uuid,
  p_months_ahead integer default 3
) returns integer
language plpgsql
security invoker
as $$
declare
  t          tenancies%rowtype;
  m          date;
  last_month date;
  created    integer := 0;
begin
  select * into t from tenancies where id = p_tenancy_id;
  if not found then
    raise exception 'tenancy % not found or not visible', p_tenancy_id;
  end if;

  m := date_trunc('month', t.started_on)::date;
  last_month := date_trunc(
    'month',
    least(coalesce(t.ended_on, 'infinity'::date),
          (current_date + (p_months_ahead || ' months')::interval)::date)
  )::date;

  while m <= last_month loop
    insert into rent_periods (owner_id, tenancy_id, period_month, due_date, amount_due_cents)
    values (
      t.owner_id,
      t.id,
      m,
      -- clamp the due day to the length of this month
      m + (least(t.due_day_of_month,
                 extract(day from (m + interval '1 month' - interval '1 day'))::int) - 1),
      t.rent_amount_cents
    )
    on conflict (tenancy_id, period_month) do nothing;
    created := created + 1;
    m := (m + interval '1 month')::date;
  end loop;

  return created;
end;
$$;
```

Called from the client as `supabase.rpc('ensure_rent_periods', { p_tenancy_id })`:

- immediately after creating a tenancy;
- on every ledger screen mount, before fetching (cheap: it is `on conflict do nothing`).

`security invoker` means the caller's RLS applies — a user cannot generate periods for someone else's tenancy.

**Existing periods are never modified.** Changing `tenancies.rent_amount_cents` later affects only periods created after the change (see §2.4). Repricing already-generated future periods is a separate, deliberate operation and is out of scope.

---

## 5. Security

### 5.1 Ownership

Every table carries `owner_id`. In this slice, `owner_id = auth.uid()` for every row the app writes. This denormalisation keeps RLS to a single index-friendly predicate with no recursive joins, which matters because RLS runs on every row of every query.

### 5.2 Policies (this slice)

For each of `properties`, `landlord_contacts`, `tenancies`, `rent_periods`, `payments`:

```sql
alter table <t> enable row level security;

create policy owner_all on <t>
  for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());
```

`profiles`: same, keyed on `id = auth.uid()`. A profile row is created on first sign-in if absent.

### 5.3 How connected mode changes this (not built now)

Recorded so the current policies are recognisably a starting point rather than something to tear out:

```sql
-- later
create table tenancy_members (
  tenancy_id uuid references tenancies on delete cascade,
  user_id    uuid references auth.users on delete cascade,
  role       text not null check (role in ('tenant', 'landlord')),
  primary key (tenancy_id, user_id)
);
```

Policies widen from `owner_id = auth.uid()` to `owner_id = auth.uid() OR exists (select 1 from tenancy_members ...)`. Reads open up; writes stay owner-only until the landlord genuinely needs to write. No table is reshaped and no data migrates.

### 5.4 Storage

Bucket `receipts`, **private**.

Path convention: `{owner_id}/{payment_id}.jpg`.

The first path segment is the owner, so the storage policy is a string comparison with no lookup:

```sql
create policy receipts_owner on storage.objects
  for all
  using (bucket_id = 'receipts' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'receipts' and (storage.foldername(name))[1] = auth.uid()::text);
```

Display uses **signed URLs** (`createSignedUrl`, ~60 min). Never a public URL: a bank slip carries an account number, a name, and a balance.

Upload order matters. Insert the payment row first, then upload to `receipts/{owner}/{payment.id}.jpg`, then patch `receipt_path`. A failed upload leaves a payment with no proof — recoverable, and the ledger already has a badge for it. The reverse order can orphan a file with no row pointing at it.

Images are resized to max 1600px and JPEG quality ~0.7 before upload (`expo-image-manipulator`). A raw phone photo is 3–8 MB; a slip is legible far below that, and the target user is on mobile data.

---

## 6. Screens

Six screens. Each maps to a step in the sentence this slice implements.

**1. Sign up / Sign in** — email, password, display name (sign-up only). On success, ensure a `profiles` row exists, then route: no tenancy → Create Tenancy; has tenancy → Ledger.

**2. Create Tenancy** (one screen, one submit)
Fields: property label\*, address, city; landlord name\*, landlord phone; monthly rent\*; due day of month\* (1–31, default 1); start date\* (default: 1st of current month).
On submit, in order: insert `property` → insert `landlord_contact` → insert `tenancy` → `rpc('ensure_rent_periods')` → navigate to Ledger.
Not a transaction — supabase-js has no client-side multi-statement transaction. A failure after step 1 leaves an orphan property row with no tenancy pointing at it. Harmless, invisible, and cleaned up if this ever moves to an RPC. Do not paper over it with cleanup logic that can itself fail.

**3. Ledger** — the home screen.
Header: property label, landlord name, rent amount, "due on the Nth".
Body: `rent_period_summary` for the tenancy, newest month first, each row showing month, amount due, amount paid, balance if nonzero, and a status chip (§4.4). Current month is visually anchored.
Empty state cannot occur — a tenancy always has at least one period.

**4. Period detail** — one month. Amount due, total paid, balance, status, and the list of payments against it. Primary action: *Record payment*, prefilled with the outstanding balance.

**5. Record payment** — amount (prefilled, editable — this is what makes partial payments real), date paid (default today), method, reference, note, and *Attach bank slip* (camera or library, optional). Save → insert → upload → patch → back to Period detail.

**6. Payment detail** — the recorded values and the slip, full-screen and zoomable, via a signed URL. If `receipt_path` is null, an *Add slip* action.

---

## 7. Layout

A clickable prototype exists, driven by an in-memory mock rather than Supabase. The design is being settled there first; the schema in §4 is not wired up until it is.

The prototype has since grown past this slice to cover the whole rental lifecycle and both roles. **Only the payments part is specced** — everything under `lifecycleTypes.ts` is prototype-stage, shaped to make screens judgeable rather than argued for the way §2 argues for the payments model. Each of those stages needs its own pass through this document before it is built for real.

```
app/                          # expo-router
  _layout.tsx  index.tsx      # root stack + routing gate
  sign-in  sign-up  create-tenancy
  tenant/                     # tab shell: home, ledger, repairs, property, more
  landlord/                   # tab shell: portfolio, repairs, inbox, more
  period/[id]  record-payment  payment/[id]        # SPECCED (this document)
  receipt/[paymentId]                              # prototype-stage below here
  agreement  renewal  inspection/[kind]  inspection/compare
  maintenance/new  maintenance/[id]
  thread/index  thread/[id]  thread/new
  deposit  reviews  review/new  reminders  invite
  discover  listing/[id]
  landlord/tenancy/[id]
src/
  theme.ts                    # design tokens
  components/                 # ui, StatusChip, SlipImage, LedgerRowItem, lifecycle
  data/
    types.ts                  # SPECCED contract (§4)
    ledger.ts                 # deriveLedgerStatus (§4.4), generatePeriods (§4.5), LKR
    lifecycleTypes.ts         # prototype-stage domain — not yet specced
    repository.ts             # the seam both data layers implement
    store.tsx                 # React context over the repository
    mock/                     # seed + in-memory implementation
    supabase/                 # client + SupabaseRepository — NOT YET
supabase/
  migrations/                 # the SQL in §4 and §5, in order — NOT YET
```

Wiring up Supabase means writing one more `Repository` implementation and changing which one `store.tsx` instantiates. No screen changes, because screens never import a data layer directly.

Two details in the interface exist purely to keep that swap honest:

- `recordPayment` takes a local `receiptUri`; the Supabase implementation uploads it and stores the object path. Screens never see the difference.
- Anything displaying a slip resolves it through `getReceiptUrl` rather than reading `receipt_path`, so signed URLs drop in without touching a screen.

Secrets: the anon key ships in the app and is meant to. RLS is the security boundary, not key secrecy. The service-role key must never appear in this repository.

---

## 8. Done means

Checked against the prototype (mock data). Re-checked against Supabase when the real data layer lands.

- [x] A new user signs up, creates a tenancy, and lands on a ledger showing every month from the start date to three months ahead.
- [x] Recording a full payment moves that month to `paid`.
- [x] Recording half moves it to `partial` and shows the remaining balance.
- [x] Two payments summing to the rent move it to `paid`.
- [x] A past month with no payment shows `overdue`.
- [x] A part-paid month past its due date reads `partial`, not `overdue`.
- [x] A tenancy starting on the 31st produces a February period due on the 28th (29th in a leap year).
- [x] A payment saved without a slip shows an "add proof" affordance; the ledger row badges it.
- [ ] A payment saved with a slip renders it from a **signed** URL. *(Prototype renders a local URI — signed URLs need Supabase.)*
- [ ] Signed in as user B, no row belonging to user A is readable — verified by query, not by the absence of a UI path to it. *(Needs RLS; the mock has no security boundary at all.)*
