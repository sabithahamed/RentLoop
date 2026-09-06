-- RentLoop — lifecycle schema
--
-- Everything beyond the payments slice: agreements, inspections, maintenance,
-- messages, deposit settlement, reviews, renewal, and the membership table
-- that makes connected mode real.
--
-- Access is expressed once, in has_tenancy_access(), rather than repeated in
-- twenty policies. That function is the single place the tenant-only vs
-- connected-mode rule lives, so widening it later cannot miss a table.

-- ---------------------------------------------------------------------------
-- Connected mode: who can see a tenancy
-- ---------------------------------------------------------------------------

create table if not exists tenancy_members (
  tenancy_id  uuid not null references tenancies(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        text not null check (role in ('tenant', 'landlord')),
  joined_at   timestamptz not null default now(),
  primary key (tenancy_id, user_id)
);

create index if not exists idx_tenancy_members_user on tenancy_members(user_id);

-- security definer so the function can read tenancies/tenancy_members without
-- the caller needing policies on them — which is what would otherwise recurse.
-- search_path is pinned: a security definer function without it is a privilege
-- escalation waiting for someone to create a shadowing table.
create or replace function has_tenancy_access(t uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (select 1 from tenancies where id = t and owner_id = auth.uid())
      or exists (select 1 from tenancy_members where tenancy_id = t and user_id = auth.uid());
$$;

revoke all on function has_tenancy_access(uuid) from public;
grant execute on function has_tenancy_access(uuid) to authenticated;

alter table tenancy_members enable row level security;

-- Deliberately NOT using has_tenancy_access here: that function reads this
-- table, and a policy calling it would recurse.
drop policy if exists "Members visible to the tenancy owner and to themselves" on tenancy_members;
create policy "Members visible to the tenancy owner and to themselves"
  on tenancy_members for all
  using (
    user_id = auth.uid()
    or exists (select 1 from tenancies where id = tenancy_id and owner_id = auth.uid())
  )
  with check (
    exists (select 1 from tenancies where id = tenancy_id and owner_id = auth.uid())
  );

-- ---------------------------------------------------------------------------
-- Agreements
-- ---------------------------------------------------------------------------

create table if not exists agreements (
  id                  uuid primary key default gen_random_uuid(),
  tenancy_id          uuid not null references tenancies(id) on delete cascade,
  file_name           text not null,
  file_path           text,
  uploaded_at         timestamptz not null default now(),
  status              text not null default 'needs_review'
                      check (status in ('none', 'processing', 'needs_review', 'confirmed')),
  ends_on             date,
  notice_period_days  int,
  deposit_cents       bigint,
  unique (tenancy_id)
);

create table if not exists agreement_terms (
  id            uuid primary key default gen_random_uuid(),
  agreement_id  uuid not null references agreements(id) on delete cascade,
  label         text not null,
  value         text not null,
  confidence    real not null default 0.5,
  confirmed     boolean not null default false,
  source_quote  text,
  position      int not null default 0
);

create table if not exists agreement_clauses (
  id            uuid primary key default gen_random_uuid(),
  agreement_id  uuid not null references agreements(id) on delete cascade,
  text          text not null,
  reason        text not null
);

create index if not exists idx_agreement_terms_agreement on agreement_terms(agreement_id);
create index if not exists idx_agreement_clauses_agreement on agreement_clauses(agreement_id);

-- ---------------------------------------------------------------------------
-- Inspections
-- ---------------------------------------------------------------------------

create table if not exists inspection_sessions (
  id            uuid primary key default gen_random_uuid(),
  tenancy_id    uuid not null references tenancies(id) on delete cascade,
  kind          text not null check (kind in ('move_in', 'move_out')),
  status        text not null default 'not_started'
                check (status in ('not_started', 'in_progress', 'complete')),
  started_on    date,
  completed_on  date,
  unique (tenancy_id, kind)
);

create table if not exists inspection_areas (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references inspection_sessions(id) on delete cascade,
  room        text not null,
  name        text not null,
  required    boolean not null default false,
  position    int not null default 0,
  unique (session_id, room, name)
);

create table if not exists inspection_photos (
  id           uuid primary key default gen_random_uuid(),
  area_id      uuid not null references inspection_areas(id) on delete cascade,
  storage_path text not null,
  captured_at  timestamptz not null default now(),
  note         text,
  -- What the assistant thinks it sees. Advisory only; a human decides.
  findings     jsonb not null default '[]'::jsonb
);

create index if not exists idx_inspection_areas_session on inspection_areas(session_id);
create index if not exists idx_inspection_photos_area on inspection_photos(area_id);

-- ---------------------------------------------------------------------------
-- Maintenance
-- ---------------------------------------------------------------------------

create table if not exists maintenance_tickets (
  id           uuid primary key default gen_random_uuid(),
  tenancy_id   uuid not null references tenancies(id) on delete cascade,
  title        text not null,
  description  text not null default '',
  category     text not null default 'other'
               check (category in ('plumbing','electrical','structural','appliance','pest','other')),
  urgency      text not null default 'normal'
               check (urgency in ('low','normal','high','emergency')),
  status       text not null default 'reported'
               check (status in ('reported','acknowledged','approved','in_progress','resolved','declined')),
  reported_by  text not null check (reported_by in ('tenant','landlord')),
  reported_on  date not null default current_date,
  photo_paths  text[] not null default '{}',
  cost_cents   bigint,
  -- The agent's triage, kept as written so the trace stays auditable.
  suggestion   jsonb,
  created_at   timestamptz not null default now()
);

create table if not exists maintenance_events (
  id            uuid primary key default gen_random_uuid(),
  ticket_id     uuid not null references maintenance_tickets(id) on delete cascade,
  at            timestamptz not null default now(),
  actor_role    text not null check (actor_role in ('tenant','landlord')),
  label         text not null,
  note          text,
  status_after  text
);

create index if not exists idx_tickets_tenancy on maintenance_tickets(tenancy_id);
create index if not exists idx_events_ticket on maintenance_events(ticket_id);

-- ---------------------------------------------------------------------------
-- Communication
-- ---------------------------------------------------------------------------

create table if not exists threads (
  id              uuid primary key default gen_random_uuid(),
  tenancy_id      uuid not null references tenancies(id) on delete cascade,
  subject         text not null,
  about_type      text not null default 'general'
                  check (about_type in ('general','payment','maintenance','inspection')),
  about_id        uuid,
  last_message_at timestamptz not null default now(),
  -- Roles that have not read the latest message.
  unread_for      text[] not null default '{}',
  created_at      timestamptz not null default now()
);

create table if not exists messages (
  id          uuid primary key default gen_random_uuid(),
  thread_id   uuid not null references threads(id) on delete cascade,
  actor_role  text not null check (actor_role in ('tenant','landlord')),
  body        text not null,
  sent_at     timestamptz not null default now()
);

create index if not exists idx_threads_tenancy on threads(tenancy_id);
create index if not exists idx_messages_thread on messages(thread_id);

-- ---------------------------------------------------------------------------
-- Deposit settlement
-- ---------------------------------------------------------------------------

create table if not exists deposit_settlements (
  id            uuid primary key default gen_random_uuid(),
  tenancy_id    uuid not null references tenancies(id) on delete cascade,
  deposit_cents bigint not null default 0,
  status        text not null default 'not_started'
                check (status in ('not_started','proposed','disputed','agreed','settled')),
  settled_on    date,
  unique (tenancy_id)
);

create table if not exists deductions (
  id                  uuid primary key default gen_random_uuid(),
  settlement_id       uuid not null references deposit_settlements(id) on delete cascade,
  label               text not null,
  amount_cents        bigint not null check (amount_cents >= 0),
  reason              text not null default '',
  evidence_area_names text[] not null default '{}',
  proposed_by         text not null check (proposed_by in ('tenant','landlord')),
  -- null = the other side has not answered yet. That is a real state, not a gap.
  agreed              boolean,
  created_at          timestamptz not null default now()
);

create index if not exists idx_deductions_settlement on deductions(settlement_id);

-- ---------------------------------------------------------------------------
-- Renewal, invitations, reviews
-- ---------------------------------------------------------------------------

create table if not exists renewals (
  tenancy_id          uuid primary key references tenancies(id) on delete cascade,
  intent              text not null default 'undecided'
                      check (intent in ('undecided','renewing','leaving')),
  notice_given_on     date,
  earliest_leave_date date,
  decided_on          date
);

create table if not exists invitations (
  tenancy_id   uuid primary key references tenancies(id) on delete cascade,
  status       text not null default 'none' check (status in ('none','sent','accepted')),
  -- Readable over the phone: no O/0, no I/1.
  code         text not null unique,
  invited_name text not null default '',
  sent_on      date,
  accepted_on  date
);

create table if not exists reviews (
  id         uuid primary key default gen_random_uuid(),
  tenancy_id uuid not null references tenancies(id) on delete cascade,
  direction  text not null check (direction in ('tenant_to_landlord','landlord_to_tenant')),
  rating     int not null check (rating between 1 and 5),
  body       text not null,
  verified   boolean not null default true,
  created_at timestamptz not null default now(),
  unique (tenancy_id, direction)
);

create index if not exists idx_reviews_tenancy on reviews(tenancy_id);

-- ---------------------------------------------------------------------------
-- RLS
--
-- Every rule is the same sentence: you can see a tenancy's records if you can
-- see the tenancy. Child tables reach their tenancy through their parent.
-- ---------------------------------------------------------------------------

alter table agreements            enable row level security;
alter table agreement_terms       enable row level security;
alter table agreement_clauses     enable row level security;
alter table inspection_sessions   enable row level security;
alter table inspection_areas      enable row level security;
alter table inspection_photos     enable row level security;
alter table maintenance_tickets   enable row level security;
alter table maintenance_events    enable row level security;
alter table threads               enable row level security;
alter table messages              enable row level security;
alter table deposit_settlements   enable row level security;
alter table deductions            enable row level security;
alter table renewals              enable row level security;
alter table invitations           enable row level security;
alter table reviews               enable row level security;

do $$
declare
  direct text[] := array[
    'agreements','inspection_sessions','maintenance_tickets','threads',
    'deposit_settlements','renewals','invitations','reviews'
  ];
  t text;
begin
  -- Tables holding tenancy_id directly.
  foreach t in array direct loop
    execute format('drop policy if exists tenancy_access on %I', t);
    execute format(
      'create policy tenancy_access on %I for all
         using (has_tenancy_access(tenancy_id))
         with check (has_tenancy_access(tenancy_id))', t);
  end loop;
end $$;

-- Child tables: reachable through their parent.
drop policy if exists tenancy_access on agreement_terms;
create policy tenancy_access on agreement_terms for all
  using (exists (select 1 from agreements a where a.id = agreement_id and has_tenancy_access(a.tenancy_id)))
  with check (exists (select 1 from agreements a where a.id = agreement_id and has_tenancy_access(a.tenancy_id)));

drop policy if exists tenancy_access on agreement_clauses;
create policy tenancy_access on agreement_clauses for all
  using (exists (select 1 from agreements a where a.id = agreement_id and has_tenancy_access(a.tenancy_id)))
  with check (exists (select 1 from agreements a where a.id = agreement_id and has_tenancy_access(a.tenancy_id)));

drop policy if exists tenancy_access on inspection_areas;
create policy tenancy_access on inspection_areas for all
  using (exists (select 1 from inspection_sessions s where s.id = session_id and has_tenancy_access(s.tenancy_id)))
  with check (exists (select 1 from inspection_sessions s where s.id = session_id and has_tenancy_access(s.tenancy_id)));

drop policy if exists tenancy_access on inspection_photos;
create policy tenancy_access on inspection_photos for all
  using (exists (
    select 1 from inspection_areas ar
    join inspection_sessions s on s.id = ar.session_id
    where ar.id = area_id and has_tenancy_access(s.tenancy_id)))
  with check (exists (
    select 1 from inspection_areas ar
    join inspection_sessions s on s.id = ar.session_id
    where ar.id = area_id and has_tenancy_access(s.tenancy_id)));

drop policy if exists tenancy_access on maintenance_events;
create policy tenancy_access on maintenance_events for all
  using (exists (select 1 from maintenance_tickets t where t.id = ticket_id and has_tenancy_access(t.tenancy_id)))
  with check (exists (select 1 from maintenance_tickets t where t.id = ticket_id and has_tenancy_access(t.tenancy_id)));

drop policy if exists tenancy_access on messages;
create policy tenancy_access on messages for all
  using (exists (select 1 from threads th where th.id = thread_id and has_tenancy_access(th.tenancy_id)))
  with check (exists (select 1 from threads th where th.id = thread_id and has_tenancy_access(th.tenancy_id)));

drop policy if exists tenancy_access on deductions;
create policy tenancy_access on deductions for all
  using (exists (select 1 from deposit_settlements s where s.id = settlement_id and has_tenancy_access(s.tenancy_id)))
  with check (exists (select 1 from deposit_settlements s where s.id = settlement_id and has_tenancy_access(s.tenancy_id)));

-- ---------------------------------------------------------------------------
-- The payments slice predates connected mode and is still owner-only. Widen it
-- to the same rule, so a connected landlord sees the ledger rather than a
-- blank screen.
-- ---------------------------------------------------------------------------

drop policy if exists "Owners can manage tenancies" on tenancies;
create policy tenancy_access on tenancies for all
  using (owner_id = auth.uid() or has_tenancy_access(id))
  with check (owner_id = auth.uid());

drop policy if exists "Owners can manage rent periods" on rent_periods;
create policy tenancy_access on rent_periods for all
  using (has_tenancy_access(tenancy_id))
  with check (has_tenancy_access(tenancy_id));

drop policy if exists "Owners can manage payments" on payments;
create policy tenancy_access on payments for all
  using (has_tenancy_access(tenancy_id))
  with check (has_tenancy_access(tenancy_id));

drop policy if exists "Owners can manage properties" on properties;
create policy tenancy_access on properties for all
  using (
    owner_id = auth.uid()
    or exists (select 1 from tenancies t where t.property_id = properties.id and has_tenancy_access(t.id))
  )
  with check (owner_id = auth.uid());

drop policy if exists "Owners can manage landlord contacts" on landlord_contacts;
create policy tenancy_access on landlord_contacts for all
  using (
    owner_id = auth.uid()
    or exists (select 1 from tenancies t where t.landlord_contact_id = landlord_contacts.id and has_tenancy_access(t.id))
  )
  with check (owner_id = auth.uid());
