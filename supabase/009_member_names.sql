-- RentLoop — a landlord can see who their tenant is
--
-- getPortfolio embedded `profiles:owner_id(display_name)` to put a name on
-- each property. There is no foreign key from tenancies.owner_id to profiles —
-- owner_id references auth.users — so PostgREST could not resolve it and the
-- query failed outright. The landlord portfolio has therefore been broken
-- since it was written; nobody saw it because the demo account is a tenant and
-- the portfolio was always empty, and an empty list and a failed query render
-- identically.
--
-- Adding the foreign key would not fix it either. profiles is readable only by
-- its owner, so a landlord embedding their tenant's profile would get a null
-- back and put "Tenant" on every card. The name has to be stored where the
-- landlord is allowed to read it, which is the membership itself — the same
-- answer as enquiries in 006 and join requests in 007.

alter table tenancy_members add column if not exists display_name text;

-- Approving is the moment a member appears, and the request already carries
-- the name the requester chose to share.
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

  if not has_tenancy_access(req.tenancy_id) then
    raise exception 'You do not have access to this property';
  end if;

  if req.status <> 'pending' then
    raise exception 'That request has already been decided';
  end if;

  if p_approve then
    insert into tenancy_members (tenancy_id, user_id, role, display_name)
    values (req.tenancy_id, req.user_id, 'tenant', req.from_name)
    on conflict (tenancy_id, user_id) do update set display_name = excluded.display_name;
  end if;

  update tenancy_join_requests r
     set status = case when p_approve then 'approved' else 'declined' end,
         decided_at = now(),
         decided_by = auth.uid()
   where r.id = p_request_id;
end;
$$;

-- Backfill what is already there, from the requests that created them.
update tenancy_members m
   set display_name = r.from_name
  from tenancy_join_requests r
 where r.tenancy_id = m.tenancy_id
   and r.user_id = m.user_id
   and r.status = 'approved'
   and m.display_name is null;
