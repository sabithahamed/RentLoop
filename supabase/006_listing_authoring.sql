-- RentLoop — landlords posting their own listings
--
-- 003 created the listings tables but only ever had seeded stock in mind. Now
-- that a landlord can post from inside the app, the three fields that make
-- RentLoop worth looking at — verified, tenancy_count, rating — are suddenly
-- writable by the very person they are a judgement about. The RLS policy on
-- listings is `for all ... with check (landlord_id = auth.uid())`, which is
-- right about ownership and says nothing about which columns you may set.
--
-- So they are taken away from the client entirely and computed here. A
-- landlord may write their title, their rent and their photos. They may not
-- write their own reputation.

-- ---------------------------------------------------------------------------
-- What RentLoop actually knows about a landlord
-- ---------------------------------------------------------------------------

-- Security definer because a landlord cannot read the reviews table for
-- tenancies they are not a member of, and the count has to be over all of
-- them. search_path is pinned: a definer function without it is an
-- escalation waiting for someone to create a `public.reviews` of their own.
create or replace function landlord_track_record(uid uuid)
returns table (tenancies int, avg_rating real, is_verified boolean)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with mine as (
    select tenancy_id from tenancy_members where user_id = uid and role = 'landlord'
  )
  select
    (select count(*)::int from mine),
    (select avg(r.rating)::real
       from reviews r
      where r.tenancy_id in (select tenancy_id from mine)
        and r.direction = 'tenant_to_landlord'),
    -- Verified means this app watched them run a tenancy. Not that anyone
    -- checked the photos, and the listing screen says so.
    (select count(*) from mine) > 0;
$$;

-- ---------------------------------------------------------------------------
-- Overwrite whatever the client sent
-- ---------------------------------------------------------------------------

create or replace function listings_apply_track_record()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  record_row record;
begin
  -- Seeded demo stock has no owning account (003 allows landlord_id null so a
  -- listing outlives its poster). Nothing to compute, so leave it alone.
  if new.landlord_id is null then
    return new;
  end if;

  select * into record_row from landlord_track_record(new.landlord_id);

  new.tenancy_count := coalesce(record_row.tenancies, 0);
  new.rating        := record_row.avg_rating;
  new.verified      := coalesce(record_row.is_verified, false);

  return new;
end;
$$;

drop trigger if exists listings_track_record on listings;
create trigger listings_track_record
  before insert or update on listings
  for each row execute function listings_apply_track_record();

-- ---------------------------------------------------------------------------
-- Storage: a landlord may remove a photo they uploaded
-- ---------------------------------------------------------------------------
--
-- 003 granted insert on the public listing-photos bucket and stopped there,
-- which left an author unable to delete their own mistake. Scoped to the
-- uploader rather than the bucket, so removing a photo cannot reach anyone
-- else's.

drop policy if exists listing_photos_owner_delete on storage.objects;
create policy listing_photos_owner_delete on storage.objects for delete
  to authenticated
  using (bucket_id = 'listing-photos' and owner = auth.uid());

drop policy if exists listing_photos_owner_update on storage.objects;
create policy listing_photos_owner_update on storage.objects for update
  to authenticated
  using (bucket_id = 'listing-photos' and owner = auth.uid());

-- A landlord's own listings screen reads inactive rows too; the read policy in
-- 003 is `using (is_active)`, which hides them from their own author.
drop policy if exists listings_read on listings;
create policy listings_read on listings for select
  using (is_active or landlord_id = auth.uid());

create index if not exists idx_listings_landlord on listings(landlord_id);

-- ---------------------------------------------------------------------------
-- Enquiries have to be answerable
-- ---------------------------------------------------------------------------
--
-- profiles is readable only by its owner, which is the right default and
-- leaves a landlord holding an enquiry from nobody. Rather than opening
-- profiles up, the sender's own name and phone are stamped onto the enquiry
-- at the moment they choose to send it — the landlord they wrote to can read
-- those, and nobody else can.
--
-- Filled by a trigger, not by the client, so the name on an enquiry is the
-- name on the account that sent it.

alter table enquiries add column if not exists from_name  text;
alter table enquiries add column if not exists from_phone text;

create or replace function enquiries_stamp_sender()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  select p.display_name, p.phone into new.from_name, new.from_phone
    from profiles p where p.id = new.from_user;
  return new;
end;
$$;

drop trigger if exists enquiries_sender on enquiries;
create trigger enquiries_sender
  before insert on enquiries
  for each row execute function enquiries_stamp_sender();
