-- RentLoop — account roles, landlord-issued invites, and approvals
--
-- Until now "role" was a lens you flipped from the More screen: a prototype
-- affordance, not a fact about the account. And connection only ran one way —
-- the tenant kept the record and invited their landlord in (004). That is the
-- right flow for a tenant who starts alone, and the wrong one for a landlord
-- who already has six properties and wants their tenants on the app.
--
-- This adds the other direction, and an approval step with it. A code can be
-- forwarded to the wrong person, so a landlord-issued code does not hand out
-- access by itself: it creates a request, and the landlord says yes.

-- ---------------------------------------------------------------------------
-- What kind of account this is
-- ---------------------------------------------------------------------------
--
-- Nullable on purpose. Accounts that existed before this migration have no
-- answer, and guessing one for them would be worse than asking.

alter table profiles add column if not exists role text
  check (role in ('tenant', 'landlord'));

-- ---------------------------------------------------------------------------
-- Codes a landlord hands to a tenant
-- ---------------------------------------------------------------------------
--
-- Separate from `invitations`, which is keyed one-per-tenancy and means the
-- opposite thing (a tenant inviting their landlord). Folding both directions
-- into one row would make "who invited whom" unanswerable, which is exactly
-- the question an approval screen has to answer.

create table if not exists tenant_invites (
  id         uuid primary key default gen_random_uuid(),
  tenancy_id uuid not null references tenancies(id) on delete cascade,
  code       text not null unique,
  -- Who the landlord thinks they are inviting. Shown back to them on the
  -- approval screen next to who actually turned up.
  label      text not null default '',
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  revoked    boolean not null default false
);

create index if not exists idx_tenant_invites_tenancy on tenant_invites(tenancy_id);

-- ---------------------------------------------------------------------------
-- Somebody asking to be let in
-- ---------------------------------------------------------------------------

create table if not exists tenancy_join_requests (
  id           uuid primary key default gen_random_uuid(),
  tenancy_id   uuid not null references tenancies(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  status       text not null default 'pending'
               check (status in ('pending', 'approved', 'declined')),
  -- Copied from the requester's profile at the moment they ask, for the same
  -- reason enquiries carry a name in 006: the landlord cannot read profiles,
  -- and an approval screen listing anonymous user ids is not an approval
  -- screen.
  from_name    text,
  from_phone   text,
  message      text not null default '',
  requested_at timestamptz not null default now(),
  decided_at   timestamptz,
  decided_by   uuid references auth.users(id) on delete set null
);

create index if not exists idx_join_requests_tenancy on tenancy_join_requests(tenancy_id);
create index if not exists idx_join_requests_user on tenancy_join_requests(user_id);

-- One live request per person per tenancy. Re-asking after a decline is
-- allowed; asking twice while the first is still pending is not.
create unique index if not exists idx_join_requests_one_pending
  on tenancy_join_requests(tenancy_id, user_id)
  where status = 'pending';

-- ---------------------------------------------------------------------------
-- Asking to join
-- ---------------------------------------------------------------------------
--
-- Security definer because the whole point is that the asker has no access to
-- the tenancy yet — they cannot read tenant_invites to check their own code.
-- No insert policy is granted on tenancy_join_requests either, so this
-- function is the only way a request can come into being.

create or replace function request_to_join(p_code text, p_message text default '')
returns table (out_tenancy_id uuid, out_property_label text, out_landlord_name text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  inv    tenant_invites%rowtype;
  prop   text;
  land   text;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to join a property';
  end if;

  select * into inv from tenant_invites ti
   where upper(ti.code) = upper(trim(p_code)) and not ti.revoked;

  if not found then
    raise exception 'That code is not valid, or it has been withdrawn';
  end if;

  if exists (select 1 from tenancies t where t.id = inv.tenancy_id and t.owner_id = auth.uid()) then
    raise exception 'This is your own property — give the code to your tenant instead';
  end if;

  if exists (
    select 1 from tenancy_members m
     where m.tenancy_id = inv.tenancy_id and m.user_id = auth.uid()
  ) then
    raise exception 'You are already on this property';
  end if;

  insert into tenancy_join_requests (tenancy_id, user_id, message, from_name, from_phone)
  select inv.tenancy_id, auth.uid(), coalesce(p_message, ''), p.display_name, p.phone
    from profiles p where p.id = auth.uid()
  on conflict do nothing;

  select pr.label into prop
    from tenancies t join properties pr on pr.id = t.property_id
   where t.id = inv.tenancy_id;

  select lc.full_name into land
    from tenancies t join landlord_contacts lc on lc.id = t.landlord_contact_id
   where t.id = inv.tenancy_id;

  return query select inv.tenancy_id, prop, land;
end;
$$;

-- ---------------------------------------------------------------------------
-- Saying yes or no
-- ---------------------------------------------------------------------------

create or replace function decide_join_request(p_request_id uuid, p_approve boolean)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  req tenancy_join_requests%rowtype;
begin
  select * into req from tenancy_join_requests r where r.id = p_request_id;
  if not found then
    raise exception 'That request no longer exists';
  end if;

  -- The only people who may decide are the ones already on the tenancy.
  if not has_tenancy_access(req.tenancy_id) then
    raise exception 'You do not have access to this property';
  end if;

  if req.status <> 'pending' then
    raise exception 'That request has already been decided';
  end if;

  if p_approve then
    insert into tenancy_members (tenancy_id, user_id, role)
    values (req.tenancy_id, req.user_id, 'tenant')
    on conflict (tenancy_id, user_id) do nothing;
  end if;

  update tenancy_join_requests r
     set status = case when p_approve then 'approved' else 'declined' end,
         decided_at = now(),
         decided_by = auth.uid()
   where r.id = p_request_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table tenant_invites        enable row level security;
alter table tenancy_join_requests enable row level security;

-- A code is readable and writable by whoever is already on the tenancy. The
-- person redeeming it never reads this table — request_to_join does.
drop policy if exists tenant_invites_access on tenant_invites;
create policy tenant_invites_access on tenant_invites for all
  using (has_tenancy_access(tenancy_id))
  with check (has_tenancy_access(tenancy_id));

-- Select only, for both sides: the requester watching for an answer, and the
-- landlord deciding. Neither may write — decide_join_request does.
drop policy if exists join_requests_read on tenancy_join_requests;
create policy join_requests_read on tenancy_join_requests for select
  using (user_id = auth.uid() or has_tenancy_access(tenancy_id));

-- A requester may withdraw their own request while it is still pending.
drop policy if exists join_requests_withdraw on tenancy_join_requests;
create policy join_requests_withdraw on tenancy_join_requests for delete
  using (user_id = auth.uid() and status = 'pending');
