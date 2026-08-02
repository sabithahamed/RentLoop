/**
 * Seeded demo tenancy.
 *
 * Built relative to today so the ledger always looks alive, and deliberately
 * shaped so every one of the six ledger statuses is on screen at once —
 * including the two awkward ones: a month settled by two separate transfers,
 * and a part-paid month that is past its due date and must still read
 * `partial` rather than `overdue`.
 *
 * One payment is intentionally left without a slip so the "no proof" badge is
 * visible without having to create it by hand.
 */

import { addMonths, dueDateFor, firstOfMonth, todayISO } from '../ledger';
import type {
  ISODate,
  LandlordContact,
  Payment,
  Property,
  RentPeriod,
  Tenancy,
} from '../types';

export const DEMO_USER_ID = 'user-demo';
export const DEMO_EMAIL = 'tenant@rentloop.lk';
export const DEMO_NAME = 'Sabith';

/**
 * Stands in for a photographed bank slip. Rendered as a drawn facsimile by
 * `<SlipImage>` rather than a bundled asset — a real photo picked in-app is a
 * plain file URI and renders as an actual image.
 */
export const MOCK_SLIP_URI = 'mock://slip';

let counter = 0;
const id = (prefix: string): string => `${prefix}-${++counter}`;

const now = new Date().toISOString();
const RENT = 45_000_00;
const DUE_DAY = 5;

export interface SeedData {
  property: Property;
  landlord: LandlordContact;
  tenancy: Tenancy;
  periods: RentPeriod[];
  payments: Payment[];
  /** The tenancy that already ended — see mock/lifecycleSeed.ts for why it exists. */
  pastProperty: Property;
  pastLandlord: LandlordContact;
  pastTenancy: Tenancy;
}

export function buildSeed(today: ISODate = todayISO()): SeedData {
  counter = 0;
  const thisMonth = firstOfMonth(today);
  const startMonth = addMonths(thisMonth, -6);

  const property: Property = {
    id: id('prop'),
    owner_id: DEMO_USER_ID,
    label: 'Annex, Nugegoda',
    address_line: '14/3 Sarana Road',
    city: 'Nugegoda',
    created_at: now,
  };

  const landlord: LandlordContact = {
    id: id('land'),
    owner_id: DEMO_USER_ID,
    full_name: 'Mr. Perera',
    phone: '077 412 8890',
    email: null,
    linked_user_id: null, // tenant-only mode — he has never installed the app
    created_at: now,
  };

  const tenancy: Tenancy = {
    id: id('ten'),
    owner_id: DEMO_USER_ID,
    property_id: property.id,
    landlord_contact_id: landlord.id,
    rent_amount_cents: RENT,
    currency: 'LKR',
    due_day_of_month: DUE_DAY,
    started_on: startMonth,
    ended_on: null,
    status: 'active',
    created_at: now,
  };

  // Ten months: six behind, the current one, three ahead.
  const periods: RentPeriod[] = [];
  for (let offset = -6; offset <= 3; offset++) {
    const month = addMonths(thisMonth, offset);
    periods.push({
      id: id('period'),
      owner_id: DEMO_USER_ID,
      tenancy_id: tenancy.id,
      period_month: month,
      due_date: dueDateFor(month, DUE_DAY),
      amount_due_cents: RENT,
      created_at: now,
    });
  }

  const at = (offset: number): RentPeriod => periods[offset + 6];

  const payment = (
    period: RentPeriod,
    amount: number,
    dayOfMonth: number,
    extra: Partial<Payment> = {},
  ): Payment => ({
    id: id('pay'),
    owner_id: DEMO_USER_ID,
    rent_period_id: period.id,
    tenancy_id: tenancy.id,
    amount_cents: amount,
    paid_on: dueDateFor(period.period_month, dayOfMonth),
    method: 'bank_transfer',
    reference: null,
    note: null,
    receipt_path: MOCK_SLIP_URI,
    created_at: now,
    ...extra,
  });

  const payments: Payment[] = [
    // -6: settled cleanly.
    payment(at(-6), RENT, 4, { reference: 'CT 8842190' }),

    // -5: overpaid — rounded up to clear a small arrears balance.
    payment(at(-5), 46_000_00, 5, {
      reference: 'CT 8901355',
      note: 'Paid extra 1,000 to settle water bill share',
    }),

    // -4: settled by two separate transfers. The second has no slip.
    payment(at(-4), 20_000_00, 5, { reference: 'CT 9013877' }),
    payment(at(-4), 25_000_00, 18, {
      reference: null,
      note: 'Balance after salary',
      receipt_path: null,
    }),

    // -3: paid in cash, so there is no slip to photograph.
    payment(at(-3), RENT, 6, { method: 'cash', receipt_path: null, note: 'Handed over in person' }),

    // -2: part paid and past its due date — must still read `partial`.
    payment(at(-2), 20_000_00, 7, { reference: 'CT 9241006' }),

    // -1: nothing at all — `overdue`.
    // 0: nothing yet — `due` as the 5th approaches.
    // +1..+3: `upcoming`.
  ];

  // The previous place: a boarding room in Ratmalana, ended seven months ago.
  // Its ledger is not seeded — nothing in the app reads it, and inventing a
  // second full payment history would only add noise.
  const pastProperty: Property = {
    id: id('prop'),
    owner_id: DEMO_USER_ID,
    label: 'Boarding room, Ratmalana',
    address_line: '22 Station Road',
    city: 'Ratmalana',
    created_at: now,
  };

  const pastLandlord: LandlordContact = {
    id: id('land'),
    owner_id: DEMO_USER_ID,
    full_name: 'Mrs. Gunawardena',
    phone: '071 335 2201',
    email: null,
    linked_user_id: null,
    created_at: now,
  };

  const pastTenancy: Tenancy = {
    id: id('ten'),
    owner_id: DEMO_USER_ID,
    property_id: pastProperty.id,
    landlord_contact_id: pastLandlord.id,
    rent_amount_cents: 25_000_00,
    currency: 'LKR',
    due_day_of_month: 1,
    started_on: addMonths(thisMonth, -20),
    ended_on: addMonths(thisMonth, -7),
    status: 'ended',
    created_at: now,
  };

  return {
    property,
    landlord,
    tenancy,
    periods,
    payments,
    pastProperty,
    pastLandlord,
    pastTenancy,
  };
}
