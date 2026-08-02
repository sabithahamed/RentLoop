/**
 * RentLoop — slice 1 data contract.
 *
 * Mirrors the schema in SPEC.md §4. Two conventions run through the whole file:
 *
 *   - Money is an integer count of minor units (cents), never a float and never
 *     a string. Postgres `numeric` arrives from PostgREST as a string and
 *     invites accidental float arithmetic in JS; integers do not.
 *   - Calendar dates (`ISODate`) and instants (`ISODateTime`) are different
 *     things. Rent is due on the 5th, not at an instant.
 *
 * Nullable columns are typed `| null` rather than optional, because that is
 * what the database actually returns.
 *
 * When a real Supabase project exists, `supabase gen types` becomes the source
 * of truth for the row types below and this file should re-export from it
 * rather than duplicate it. Until then the duplication is deliberate.
 */

export type UUID = string;

/** Calendar date, `YYYY-MM-DD`. Sorts and compares correctly as a string. */
export type ISODate = string;

/** Instant, ISO-8601 with offset. Record-keeping only (`created_at`). */
export type ISODateTime = string;

/** Integer minor units. 45_000_00 is Rs. 45,000.00 */
export type Cents = number;

// ---------------------------------------------------------------------------
// Domain unions
// ---------------------------------------------------------------------------

export type TenancyStatus = 'active' | 'ended';

export type PaymentMethod = 'bank_transfer' | 'cash' | 'online' | 'other';

export const PAYMENT_METHODS: readonly PaymentMethod[] = [
  'bank_transfer',
  'cash',
  'online',
  'other',
] as const;

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  bank_transfer: 'Bank transfer',
  cash: 'Cash',
  online: 'Online',
  other: 'Other',
};

/**
 * Derived status of a rent period. Never stored, never selected from the
 * database — computed from the money and today's date by
 * `deriveLedgerStatus` in ./ledger.ts, which is its only implementation.
 *
 * First match wins (SPEC.md §4.4):
 *
 *   overpaid   paid > due
 *   paid       paid === due (and > 0)
 *   partial    0 < paid < due
 *   overdue    paid === 0 and due_date is in the past
 *   due        paid === 0 and due_date is today or within 7 days
 *   upcoming   otherwise
 *
 * Note that a part-paid month past its due date reads `partial`, not
 * `overdue`. The tenant did pay something; saying otherwise is false.
 */
export type LedgerStatus = 'paid' | 'overpaid' | 'partial' | 'overdue' | 'due' | 'upcoming';

// ---------------------------------------------------------------------------
// Table rows
// ---------------------------------------------------------------------------

export interface Profile {
  id: UUID; // = auth.users.id
  display_name: string;
  phone: string | null;
  created_at: ISODateTime;
}

export interface Property {
  id: UUID;
  owner_id: UUID;
  /** Human label the tenant recognises: "Annex, Nugegoda". */
  label: string;
  address_line: string | null;
  city: string | null;
  created_at: ISODateTime;
}

/**
 * The landlord as the *tenant* knows them — a contact, not a user.
 *
 * This is the tenant-only vs connected-mode answer (SPEC.md §2.2). In
 * tenant-only mode the landlord may never install the app, and the tenant
 * still needs a name on the ledger. When the landlord does sign up,
 * `linked_user_id` is filled in and a membership row is added; no payment,
 * period, or tenancy row is reshaped.
 *
 * The contact stays tenant-owned even after linking.
 */
export interface LandlordContact {
  id: UUID;
  owner_id: UUID;
  full_name: string;
  phone: string | null;
  email: string | null;
  /** Connected mode. Always null in this slice. */
  linked_user_id: UUID | null;
  created_at: ISODateTime;
}

export interface Tenancy {
  id: UUID;
  owner_id: UUID;
  property_id: UUID;
  landlord_contact_id: UUID;
  rent_amount_cents: Cents;
  /** ISO 4217. 'LKR' throughout this slice. */
  currency: string;
  /** 1–31. Clamped to the length of a short month when a due date is computed. */
  due_day_of_month: number;
  started_on: ISODate;
  ended_on: ISODate | null;
  status: TenancyStatus;
  created_at: ISODateTime;
}

/**
 * One month of rent. Generated, never hand-created — which is why there is no
 * `NewRentPeriod` below.
 */
export interface RentPeriod {
  id: UUID;
  owner_id: UUID;
  tenancy_id: UUID;
  /** Always the 1st of the month: `2026-08-01`. */
  period_month: ISODate;
  due_date: ISODate;
  /**
   * Snapshotted from the tenancy when the period was generated, never read
   * back through a join (SPEC.md §2.4). A rent increase must not retroactively
   * rewrite a ledger that is meant to serve as evidence.
   */
  amount_due_cents: Cents;
  created_at: ISODateTime;
}

export interface Payment {
  id: UUID;
  owner_id: UUID;
  rent_period_id: UUID;
  /** Denormalised from the period so tenancy-wide queries need no join. */
  tenancy_id: UUID;
  amount_cents: Cents;
  paid_on: ISODate;
  method: PaymentMethod;
  /** Bank reference or slip number. */
  reference: string | null;
  note: string | null;
  /** Storage object path, `{owner_id}/{payment_id}.jpg`. Null = no proof yet. */
  receipt_path: string | null;
  created_at: ISODateTime;
}

// ---------------------------------------------------------------------------
// Inserts
// ---------------------------------------------------------------------------

export type NewProperty = Omit<Property, 'id' | 'created_at'>;

export type NewLandlordContact = Omit<LandlordContact, 'id' | 'created_at' | 'linked_user_id'>;

export type NewTenancy = Omit<Tenancy, 'id' | 'created_at' | 'currency' | 'status' | 'ended_on'> & {
  currency?: string;
  status?: TenancyStatus;
  ended_on?: ISODate | null;
};

export type NewPayment = Omit<Payment, 'id' | 'created_at' | 'method' | 'receipt_path'> & {
  method?: PaymentMethod;
  receipt_path?: string | null;
};

/** What the create-tenancy screen collects, before it is split across three tables. */
export interface TenancyDraft {
  propertyLabel: string;
  addressLine: string;
  city: string;
  landlordName: string;
  landlordPhone: string;
  rentAmountCents: Cents;
  dueDayOfMonth: number;
  startedOn: ISODate;
}

// ---------------------------------------------------------------------------
// Read shapes
// ---------------------------------------------------------------------------

/** The `rent_period_summary` view (SPEC.md §4.3). Aggregates, no status. */
export interface RentPeriodSummary {
  id: UUID;
  owner_id: UUID;
  tenancy_id: UUID;
  period_month: ISODate;
  due_date: ISODate;
  amount_due_cents: Cents;
  paid_cents: Cents;
  /** `amount_due_cents - paid_cents`. Negative when overpaid. */
  balance_cents: Cents;
  payment_count: number;
  /** Payments on this period with no slip attached. Drives the "no proof" badge. */
  unproven_payment_count: number;
  /** Most recent `paid_on` against this period, or null if nothing is recorded. */
  last_paid_on: ISODate | null;
}

/** A tenancy with the two rows every screen header needs alongside it. */
export interface TenancySummary {
  tenancy: Tenancy;
  property: Property;
  landlord: LandlordContact;
}

/** One row of the ledger: the view, plus the client-derived status. */
export interface LedgerRow extends RentPeriodSummary {
  status: LedgerStatus;
}

export interface PeriodDetail {
  period: LedgerRow;
  payments: Payment[];
}

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

/** Private bucket. Slips are served through short-lived signed URLs only. */
export const RECEIPTS_BUCKET = 'receipts';

/**
 * `{owner_id}/{payment_id}.jpg` — the owner is the first path segment so the
 * storage policy is a string comparison with no lookup (SPEC.md §5.4).
 */
export function receiptPath(ownerId: UUID, paymentId: UUID): string {
  return `${ownerId}/${paymentId}.jpg`;
}
