-- RentLoop — Supabase schema (Slice 1: payments)
--
-- Run this in the Supabase SQL editor or via `supabase db push`.
-- RLS policies are per-table and assume `auth.uid()` returns the current user.

-- ---------------------------------------------------------------------------
-- Profiles (extends auth.users)
-- ---------------------------------------------------------------------------

create table if not exists profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  phone       text,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Properties
-- ---------------------------------------------------------------------------

create table if not exists properties (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references auth.users(id) on delete cascade,
  label        text not null,
  address_line text,
  city         text,
  created_at   timestamptz not null default now()
);

create index if not exists idx_properties_owner on properties(owner_id);

-- ---------------------------------------------------------------------------
-- Landlord contacts (tenant-owned)
-- ---------------------------------------------------------------------------

create table if not exists landlord_contacts (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null references auth.users(id) on delete cascade,
  full_name      text not null,
  phone          text,
  email          text,
  linked_user_id uuid references auth.users(id),
  created_at     timestamptz not null default now()
);

create index if not exists idx_landlord_contacts_owner on landlord_contacts(owner_id);

-- ---------------------------------------------------------------------------
-- Tenancies
-- ---------------------------------------------------------------------------

create table if not exists tenancies (
  id                   uuid primary key default gen_random_uuid(),
  owner_id             uuid not null references auth.users(id) on delete cascade,
  property_id          uuid not null references properties(id),
  landlord_contact_id  uuid not null references landlord_contacts(id),
  rent_amount_cents    bigint not null,
  currency             text not null default 'LKR',
  due_day_of_month     smallint not null check (due_day_of_month between 1 and 31),
  started_on           date not null,
  ended_on             date,
  status               text not null default 'active' check (status in ('active', 'ended')),
  created_at           timestamptz not null default now()
);

create index if not exists idx_tenancies_owner on tenancies(owner_id);
create index if not exists idx_tenancies_status on tenancies(status);

-- ---------------------------------------------------------------------------
-- Rent periods (generated, never hand-created)
-- ---------------------------------------------------------------------------

create table if not exists rent_periods (
  id                uuid primary key default gen_random_uuid(),
  owner_id          uuid not null references auth.users(id) on delete cascade,
  tenancy_id        uuid not null references tenancies(id) on delete cascade,
  period_month      date not null,  -- always the 1st of the month
  due_date          date not null,
  amount_due_cents  bigint not null,
  created_at        timestamptz not null default now(),
  unique (tenancy_id, period_month)
);

create index if not exists idx_rent_periods_tenancy on rent_periods(tenancy_id);

-- ---------------------------------------------------------------------------
-- Payments
-- ---------------------------------------------------------------------------

create table if not exists payments (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null references auth.users(id) on delete cascade,
  rent_period_id  uuid not null references rent_periods(id),
  tenancy_id      uuid not null references tenancies(id),
  amount_cents    bigint not null,
  paid_on         date not null,
  method          text not null default 'bank_transfer'
                    check (method in ('bank_transfer', 'cash', 'online', 'other')),
  reference       text,
  note            text,
  receipt_path    text,
  created_at      timestamptz not null default now()
);

create index if not exists idx_payments_period on payments(rent_period_id);
create index if not exists idx_payments_tenancy on payments(tenancy_id);

-- ---------------------------------------------------------------------------
-- Rent period summary view (SPEC.md §4.3)
-- ---------------------------------------------------------------------------

create or replace view rent_period_summaries as
select
  rp.id,
  rp.owner_id,
  rp.tenancy_id,
  rp.period_month,
  rp.due_date,
  rp.amount_due_cents,
  coalesce sum(p.amount_cents)::bigint as paid_cents,
  (rp.amount_due_cents - coalesce sum(p.amount_cents)::bigint) as balance_cents,
  count(p.id)::int as payment_count,
  count(p.id) filter (where p.receipt_path is null)::int as unproven_payment_count,
  max(p.paid_on) as last_paid_on
from rent_periods rp
left join payments p on p.rent_period_id = rp.id
group by rp.id;

-- ---------------------------------------------------------------------------
-- RLS — owner-scoped, simplest possible policies
-- ---------------------------------------------------------------------------

alter table profiles enable row level security;
alter table properties enable row level security;
alter table landlord_contacts enable row level security;
alter table tenancies enable row level security;
alter table rent_periods enable row level security;
alter table payments enable row level security;

-- Profiles: users can read/update their own
create policy "Users can view own profile"
  on profiles for select using (auth.uid() = id);
create policy "Users can update own profile"
  on profiles for update using (auth.uid() = id);
create policy "Users can insert own profile"
  on profiles for insert with check (auth.uid() = id);

-- Properties: owner-only
create policy "Owners can manage properties"
  on properties for all using (auth.uid() = owner_id);

-- Landlord contacts: owner-only
create policy "Owners can manage landlord contacts"
  on landlord_contacts for all using (auth.uid() = owner_id);

-- Tenancies: owner-only
create policy "Owners can manage tenancies"
  on tenancies for all using (auth.uid() = owner_id);

-- Rent periods: owner-only
create policy "Owners can manage rent periods"
  on rent_periods for all using (auth.uid() = owner_id);

-- Payments: owner-only
create policy "Owners can manage payments"
  on payments for all using (auth.uid() = owner_id);

-- ---------------------------------------------------------------------------
-- Storage — receipts bucket (private)
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
  values ('receipts', 'receipts', false)
  on conflict (id) do nothing;

-- Users can only upload/read their own receipts
create policy "Users can upload own receipts"
  on storage.objects for insert
  with check (
    bucket_id = 'receipts'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users can read own receipts"
  on storage.objects for select
  using (
    bucket_id = 'receipts'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
