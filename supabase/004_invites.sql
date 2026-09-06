-- Redeeming an invite.
--
-- The tenant creates the invite; the landlord joins by typing the code. That
-- landlord cannot read the invitations table — they have no access to the
-- tenancy yet, which is the whole point — so redemption has to happen inside a
-- security definer function that checks the code and creates the membership in
-- one step.
--
-- Output columns are prefixed `out_`: a RETURNS TABLE column named tenancy_id
-- becomes an OUT variable that collides with the identically named column on
-- tenancy_members and invitations, and Postgres rejects the whole statement as
-- ambiguous.

drop function if exists redeem_invitation(text);

create or replace function redeem_invitation(p_code text)
returns table (out_tenancy_id uuid, out_property_label text, out_invited_name text)
language plpgsql
security definer
set search_path = public
as $$
declare
  inv invitations%rowtype;
  prop text;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to join a tenancy';
  end if;

  select * into inv from invitations i
   where upper(i.code) = upper(trim(p_code)) and i.status = 'sent';

  if not found then
    raise exception 'That code is not valid, or it has already been used';
  end if;

  -- The tenant who owns the tenancy cannot also join it as the landlord.
  if exists (select 1 from tenancies t where t.id = inv.tenancy_id and t.owner_id = auth.uid()) then
    raise exception 'This is your own tenancy — send the code to your landlord instead';
  end if;

  insert into tenancy_members (tenancy_id, user_id, role)
  values (inv.tenancy_id, auth.uid(), 'landlord')
  on conflict (tenancy_id, user_id) do nothing;

  update invitations i
     set status = 'accepted', accepted_on = current_date
   where i.tenancy_id = inv.tenancy_id;

  -- Connected mode in the data: the contact stops being a name and becomes a user.
  update landlord_contacts lc
     set linked_user_id = auth.uid()
    from tenancies t
   where t.id = inv.tenancy_id and lc.id = t.landlord_contact_id;

  select p.label into prop
    from tenancies t join properties p on p.id = t.property_id
   where t.id = inv.tenancy_id;

  return query select inv.tenancy_id, prop, inv.invited_name;
end;
$$;

revoke all on function redeem_invitation(text) from public;
grant execute on function redeem_invitation(text) to authenticated;
