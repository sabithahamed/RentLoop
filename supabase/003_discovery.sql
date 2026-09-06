-- RentLoop — discovery
--
-- The one part of the lifecycle that happens *before* a tenancy. RentLoop is
-- not trying to out-listing the listing sites, so this stays deliberately
-- small: the thing it can show that they cannot is the landlord's verified
-- track record on completed tenancies.
--
-- Listings are readable by anyone signed in — that is the point of a listing —
-- and writable only by the landlord who posted it.

create table if not exists listings (
  id               uuid primary key default gen_random_uuid(),
  landlord_id      uuid references auth.users(id) on delete set null,
  -- Denormalised so a listing survives its poster deleting their account, and
  -- so seeded demo listings need no backing user.
  landlord_name    text not null,
  title            text not null,
  description      text not null default '',
  city             text not null,
  address_line     text,
  rent_cents       bigint not null check (rent_cents > 0),
  deposit_cents    bigint,
  bedrooms         int not null default 1 check (bedrooms >= 0),
  bathrooms        int not null default 1 check (bathrooms >= 0),
  property_type    text not null default 'annex'
                   check (property_type in ('annex','apartment','house','room','boarding')),
  furnished        text not null default 'unfurnished'
                   check (furnished in ('unfurnished','semi','furnished')),
  available_from   date,
  -- Verified means RentLoop has seen this landlord complete a tenancy, not
  -- that anyone checked the photos.
  verified         boolean not null default false,
  tenancy_count    int not null default 0,
  rating           real,
  is_active        boolean not null default true,
  created_at       timestamptz not null default now()
);

create table if not exists listing_photos (
  id           uuid primary key default gen_random_uuid(),
  listing_id   uuid not null references listings(id) on delete cascade,
  storage_path text not null,
  caption      text,
  position     int not null default 0
);

create table if not exists enquiries (
  id          uuid primary key default gen_random_uuid(),
  listing_id  uuid not null references listings(id) on delete cascade,
  from_user   uuid not null references auth.users(id) on delete cascade,
  message     text not null,
  sent_on     date not null default current_date,
  created_at  timestamptz not null default now()
);

create table if not exists saved_listings (
  user_id    uuid not null references auth.users(id) on delete cascade,
  listing_id uuid not null references listings(id) on delete cascade,
  saved_at   timestamptz not null default now(),
  primary key (user_id, listing_id)
);

create index if not exists idx_listings_city on listings(city);
create index if not exists idx_listings_rent on listings(rent_cents);
create index if not exists idx_listing_photos_listing on listing_photos(listing_id);
create index if not exists idx_enquiries_listing on enquiries(listing_id);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table listings       enable row level security;
alter table listing_photos enable row level security;
alter table enquiries      enable row level security;
alter table saved_listings enable row level security;

drop policy if exists listings_read on listings;
create policy listings_read on listings for select
  using (is_active);

drop policy if exists listings_write on listings;
create policy listings_write on listings for all
  using (landlord_id = auth.uid())
  with check (landlord_id = auth.uid());

drop policy if exists listing_photos_read on listing_photos;
create policy listing_photos_read on listing_photos for select
  using (exists (select 1 from listings l where l.id = listing_id and l.is_active));

drop policy if exists listing_photos_write on listing_photos;
create policy listing_photos_write on listing_photos for all
  using (exists (select 1 from listings l where l.id = listing_id and l.landlord_id = auth.uid()))
  with check (exists (select 1 from listings l where l.id = listing_id and l.landlord_id = auth.uid()));

-- An enquiry is private to the person who sent it and the landlord it was
-- sent to. Nobody else, including other people enquiring on the same place.
drop policy if exists enquiries_access on enquiries;
create policy enquiries_access on enquiries for all
  using (
    from_user = auth.uid()
    or exists (select 1 from listings l where l.id = listing_id and l.landlord_id = auth.uid())
  )
  with check (from_user = auth.uid());

drop policy if exists saved_own on saved_listings;
create policy saved_own on saved_listings for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Public bucket for listing photos.
--
-- Deliberately public, unlike receipts: a listing photo is advertising, and
-- signing every thumbnail in a scrolling list would be slow for no benefit.
-- Bank slips and inspection photos stay in the private bucket.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('listing-photos', 'listing-photos', true)
on conflict (id) do update set public = true;

drop policy if exists listing_photos_public_read on storage.objects;
create policy listing_photos_public_read on storage.objects for select
  using (bucket_id = 'listing-photos');

drop policy if exists listing_photos_owner_write on storage.objects;
create policy listing_photos_owner_write on storage.objects for insert
  to authenticated
  with check (bucket_id = 'listing-photos');
