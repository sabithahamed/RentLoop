/**
 * Seeds rental listings with real photographs.
 *
 *   node scripts/seed-listings.mjs
 *
 * Photos come from Wikimedia Commons, filtered to licences that permit reuse
 * (CC0, public domain, CC BY, CC BY-SA), uploaded into the public
 * `listing-photos` bucket. Every credit is written to docs/PHOTO-CREDITS.md,
 * because CC BY and CC BY-SA require attribution and "we used some pictures
 * off the internet" is not a licence position.
 *
 * Listing rows go in over the direct Postgres connection rather than through
 * the API: they are seeded demo stock with no owning account, and the RLS
 * policy quite correctly refuses to let a signed-in user insert a listing
 * they do not own.
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import pg from "pg";
import { createClient } from "@supabase/supabase-js";

for (const l of readFileSync(new URL("../.env", import.meta.url), "utf8").split("\n")) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const UA = "RentLoop/0.1 (IDEALIZE 2026 student project)";
const BUCKET = "listing-photos";
const OK_LICENCES = /^(cc0|public domain|cc by|cc by-sa)/i;

const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { persistSession: false } },
);

const { error: authError } = await supabase.auth.signInWithPassword({
  email: "tenant@rentloop.lk",
  password: "demo1234",
});
if (authError) {
  console.error(`✗ Sign in failed: ${authError.message}. Run seed-demo.mjs first.`);
  process.exit(1);
}

/** Pull candidate photos for one search term. */
async function search(term, limit = 8) {
  const url =
    `https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=search` +
    `&gsrsearch=${encodeURIComponent(`filetype:bitmap ${term}`)}&gsrlimit=${limit}` +
    `&gsrnamespace=6&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=1200`;

  const res = await fetch(url, { headers: { "User-Agent": UA } });
  const json = await res.json();

  return Object.values(json.query?.pages ?? [])
    .map((p) => {
      const ii = p.imageinfo?.[0];
      if (!ii) return null;
      const licence = ii.extmetadata?.LicenseShortName?.value ?? "";
      if (!OK_LICENCES.test(licence)) return null;
      return {
        title: p.title.replace(/^File:/, ""),
        url: ii.thumburl ?? ii.url,
        page: ii.descriptionurl,
        licence,
        author: (ii.extmetadata?.Artist?.value ?? "Unknown")
          .replace(/<[^>]*>/g, "")
          .trim()
          .slice(0, 80),
      };
    })
    .filter(Boolean);
}

console.log("Searching Wikimedia Commons…");

const pools = {
  exterior: [
    ...(await search("house exterior residential building")),
    ...(await search("bungalow house facade")),
  ],
  living: [
    ...(await search("apartment living room interior")),
    ...(await search("modern living room furniture")),
  ],
  bedroom: [
    ...(await search("bedroom interior bed")),
    ...(await search("small bedroom apartment")),
  ],
  kitchen: [...(await search("kitchen interior apartment")), ...(await search("small kitchen"))],
};

for (const [k, v] of Object.entries(pools)) console.log(`  ${k}: ${v.length} usable`);

const credits = [];
const seen = new Set();

/** Download one photo and put it in the public bucket. Returns its path. */
async function upload(photo, slug, index) {
  if (seen.has(photo.url)) return null;
  seen.add(photo.url);

  const res = await fetch(photo.url, { headers: { "User-Agent": UA } });
  if (!res.ok) return null;
  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.length < 5000) return null;

  const path = `${slug}/${index}.jpg`;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, buffer, { contentType: "image/jpeg", upsert: true });
  if (error) {
    console.error(`  ✗ upload ${path}: ${error.message}`);
    return null;
  }

  credits.push({ path, ...photo });
  return path;
}

// --- the listings ------------------------------------------------------------

const LISTINGS = [
  {
    slug: "nugegoda-annex",
    title: "Annex with separate entrance",
    city: "Nugegoda",
    address_line: "Off Sarana Road",
    rent: 48_000_00,
    deposit: 96_000_00,
    beds: 2,
    baths: 1,
    type: "annex",
    furnished: "semi",
    landlord: "S. Wickramasinghe",
    verified: true,
    tenancies: 7,
    rating: 4.6,
    description:
      "Two-bedroom annex on a quiet lane, with its own gate and entrance so you are not walking through the owner's house. Water and electricity are separately metered — you pay only what you use. Fifteen minutes from Nugegoda junction on foot.",
  },
  {
    slug: "dehiwala-upstairs",
    title: "Upstairs unit, quiet lane",
    city: "Dehiwala",
    address_line: "Hill Street",
    rent: 55_000_00,
    deposit: 110_000_00,
    beds: 2,
    baths: 2,
    type: "apartment",
    furnished: "furnished",
    landlord: "M. Fernando",
    verified: true,
    tenancies: 12,
    rating: 4.9,
    description:
      "Fully furnished upper floor with a private staircase. Comes with beds, wardrobes, a fridge and a washing machine. The landlord has completed twelve tenancies on RentLoop and every deposit was settled without dispute.",
  },
  {
    slug: "ratmalana-room",
    title: "Single room, meals optional",
    city: "Ratmalana",
    address_line: "Station Road",
    rent: 22_000_00,
    deposit: 22_000_00,
    beds: 1,
    baths: 1,
    type: "boarding",
    furnished: "furnished",
    landlord: "K. Gunasekara",
    verified: false,
    tenancies: 0,
    rating: null,
    description:
      "Single room in a family home, suitable for a student or someone working nearby. Meals can be arranged for an extra Rs. 12,000 a month. Shared bathroom. No RentLoop history yet, so nothing here is verified.",
  },
  {
    slug: "kotte-house",
    title: "3BR house with garden",
    city: "Kotte",
    address_line: "Pagoda Road",
    rent: 95_000_00,
    deposit: 190_000_00,
    beds: 3,
    baths: 2,
    type: "house",
    furnished: "unfurnished",
    landlord: "A. Rajapaksha",
    verified: true,
    tenancies: 4,
    rating: 3.8,
    description:
      "Detached three-bedroom house with a small garden and parking for two cars. Unfurnished. Long lease preferred — the owner is looking for two years rather than one.",
  },
  {
    slug: "maharagama-annex",
    title: "Newly built annex, ground floor",
    city: "Maharagama",
    address_line: "High Level Road",
    rent: 38_000_00,
    deposit: 76_000_00,
    beds: 1,
    baths: 1,
    type: "annex",
    furnished: "unfurnished",
    landlord: "P. Jayasuriya",
    verified: true,
    tenancies: 2,
    rating: 4.4,
    description:
      "Built last year and not yet lived in. One bedroom, open kitchen, ground floor with no stairs. Close to the bus route into town.",
  },
  {
    slug: "colombo-apartment",
    title: "2BR apartment, city centre",
    city: "Colombo 05",
    address_line: "Havelock Road",
    rent: 125_000_00,
    deposit: 250_000_00,
    beds: 2,
    baths: 2,
    type: "apartment",
    furnished: "furnished",
    landlord: "N. de Silva",
    verified: true,
    tenancies: 9,
    rating: 4.7,
    description:
      "Serviced apartment on the sixth floor with a lift, back-up generator and 24-hour security. Fully furnished including air conditioning in both bedrooms.",
  },
  {
    slug: "moratuwa-student",
    title: "Room near the university",
    city: "Moratuwa",
    address_line: "Katubedda",
    rent: 18_000_00,
    deposit: 18_000_00,
    beds: 1,
    baths: 1,
    type: "room",
    furnished: "semi",
    landlord: "H. Peiris",
    verified: true,
    tenancies: 15,
    rating: 4.5,
    description:
      "Walking distance to the University of Moratuwa. Desk, bed and wardrobe provided. Wi-Fi included. The owner has rented to students for years and most stay the full degree.",
  },
  {
    slug: "kelaniya-upper",
    title: "Upper floor, two bedrooms",
    city: "Kelaniya",
    address_line: "Temple Road",
    rent: 42_000_00,
    deposit: 84_000_00,
    beds: 2,
    baths: 1,
    type: "apartment",
    furnished: "unfurnished",
    landlord: "R. Bandara",
    verified: false,
    tenancies: 1,
    rating: 4.0,
    description:
      "Two bedrooms on the upper floor of a two-storey house, with a separate entrance and a small balcony. Quiet residential area near the temple.",
  },
];

console.log("\nUploading photos…");

const withPhotos = [];
for (const listing of LISTINGS) {
  const picks = [
    pools.exterior.shift(),
    pools.living.shift(),
    pools.bedroom.shift(),
    pools.kitchen.shift(),
  ].filter(Boolean);

  const paths = [];
  for (let i = 0; i < picks.length; i++) {
    const path = await upload(picks[i], listing.slug, i);
    if (path) paths.push({ path, caption: ["Exterior", "Living area", "Bedroom", "Kitchen"][i] });
  }
  withPhotos.push({ ...listing, paths });
  console.log(`  ${listing.slug}: ${paths.length} photos`);
}

// --- rows --------------------------------------------------------------------

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await client.connect();

await client.query("delete from listings");

for (const l of withPhotos) {
  const { rows } = await client.query(
    `insert into listings
       (landlord_name, title, description, city, address_line, rent_cents, deposit_cents,
        bedrooms, bathrooms, property_type, furnished, available_from, verified,
        tenancy_count, rating)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11, current_date + 14, $12,$13,$14)
     returning id`,
    [
      l.landlord,
      l.title,
      l.description,
      l.city,
      l.address_line,
      l.rent,
      l.deposit,
      l.beds,
      l.baths,
      l.type,
      l.furnished,
      l.verified,
      l.tenancies,
      l.rating,
    ],
  );

  const id = rows[0].id;
  for (let i = 0; i < l.paths.length; i++) {
    await client.query(
      "insert into listing_photos (listing_id, storage_path, caption, position) values ($1,$2,$3,$4)",
      [id, l.paths[i].path, l.paths[i].caption, i],
    );
  }
}

const { rows: counts } = await client.query(
  "select (select count(*) from listings) as listings, (select count(*) from listing_photos) as photos",
);
await client.end();

// --- credits -----------------------------------------------------------------

mkdirSync(new URL("../docs", import.meta.url), { recursive: true });
writeFileSync(
  new URL("../docs/PHOTO-CREDITS.md", import.meta.url),
  `# Photo credits

Listing photographs are from Wikimedia Commons, used under licences that permit
reuse. Where the licence requires attribution (CC BY, CC BY-SA), the author and
licence are given below. Generated by \`scripts/seed-listings.mjs\`.

These are demonstration images standing in for real property photographs. No
listing in this prototype is a real property offered for rent.

| File | Author | Licence | Source |
| --- | --- | --- | --- |
${credits
  .map((c) => `| \`${c.path}\` | ${c.author} | ${c.licence} | [Commons](${c.page}) |`)
  .join("\n")}
`,
  "utf8",
);

console.log(`\n✓ ${counts[0].listings} listings, ${counts[0].photos} photos`);
console.log(`✓ Credits written to docs/PHOTO-CREDITS.md`);
