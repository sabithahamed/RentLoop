/**
 * Ledger logic — pure, no React, no data source.
 *
 * `deriveLedgerStatus` and `generatePeriods` are the TypeScript twins of rules
 * that will also live in Postgres (SPEC.md §4.4 and §4.5). Duplicated
 * deliberately: the prototype has no database, and the real app still needs to
 * derive status client-side because it depends on today's date. If either rule
 * changes, both sides change together.
 */

import type { Cents, ISODate, LedgerStatus, RentPeriod, RentPeriodSummary, Tenancy } from "./types";

// ---------------------------------------------------------------------------
// Calendar dates
//
// Deliberately string arithmetic rather than `Date` where possible: a
// `YYYY-MM-DD` string has no timezone to shift under it, and rent due on the
// 5th must not become the 4th because the device is east of UTC.
// ---------------------------------------------------------------------------

const pad = (n: number): string => (n < 10 ? `0${n}` : String(n));

export function toISODate(year: number, month: number, day: number): ISODate {
  return `${year}-${pad(month)}-${pad(day)}`;
}

export function parseISODate(date: ISODate): { year: number; month: number; day: number } {
  const [year, month, day] = date.split("-").map(Number);
  return { year, month, day };
}

export function todayISO(): ISODate {
  const now = new Date();
  return toISODate(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

/** Month is 1-based. */
export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** The 1st of the month containing `date`. */
export function firstOfMonth(date: ISODate): ISODate {
  const { year, month } = parseISODate(date);
  return toISODate(year, month, 1);
}

/** `n` may be negative. Input should be a month start; output always is. */
export function addMonths(monthStart: ISODate, n: number): ISODate {
  const { year, month } = parseISODate(monthStart);
  const total = year * 12 + (month - 1) + n;
  return toISODate(Math.floor(total / 12), (total % 12) + 1, 1);
}

/** Whole days from `a` to `b`. Negative when `b` is earlier. */
export function daysBetween(a: ISODate, b: ISODate): number {
  const from = parseISODate(a);
  const to = parseISODate(b);
  const ms =
    Date.UTC(to.year, to.month - 1, to.day) - Date.UTC(from.year, from.month - 1, from.day);
  return Math.round(ms / 86_400_000);
}

/**
 * The due date for a given month, with the tenancy's due day clamped to the
 * length of that month. A tenancy due on the 31st is due on the 28th in
 * February — or the 29th in a leap year.
 */
export function dueDateFor(monthStart: ISODate, dueDayOfMonth: number): ISODate {
  const { year, month } = parseISODate(monthStart);
  return toISODate(year, month, Math.min(dueDayOfMonth, daysInMonth(year, month)));
}

// ---------------------------------------------------------------------------
// Period generation — the twin of ensure_rent_periods() (SPEC.md §4.5)
// ---------------------------------------------------------------------------

export type GeneratedPeriod = Omit<RentPeriod, "id" | "created_at">;

/**
 * Every month from the tenancy start through `monthsAhead` months from today,
 * stopping at `ended_on` if set. Idempotency is the caller's job — the real
 * implementation leans on `unique (tenancy_id, period_month)`.
 *
 * `amount_due_cents` is snapshotted here and never revisited.
 */
export function generatePeriods(
  tenancy: Tenancy,
  monthsAhead = 3,
  today: ISODate = todayISO(),
): GeneratedPeriod[] {
  const first = firstOfMonth(tenancy.started_on);
  let last = addMonths(firstOfMonth(today), monthsAhead);
  if (tenancy.ended_on) {
    const end = firstOfMonth(tenancy.ended_on);
    if (end < last) last = end;
  }

  const periods: GeneratedPeriod[] = [];
  for (let month = first; month <= last; month = addMonths(month, 1)) {
    periods.push({
      owner_id: tenancy.owner_id,
      tenancy_id: tenancy.id,
      period_month: month,
      due_date: dueDateFor(month, tenancy.due_day_of_month),
      amount_due_cents: tenancy.rent_amount_cents,
    });
  }
  return periods;
}

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

/** Days before the due date at which an unpaid month starts reading as `due`. */
export const DUE_SOON_DAYS = 7;

/**
 * SPEC.md §4.4, first match wins. The single implementation of this rule —
 * screens must call it rather than re-testing amounts themselves.
 */
export function deriveLedgerStatus(
  summary: Pick<RentPeriodSummary, "amount_due_cents" | "paid_cents" | "due_date">,
  today: ISODate = todayISO(),
): LedgerStatus {
  const { amount_due_cents: due, paid_cents: paid, due_date: dueDate } = summary;

  if (paid > due) return "overpaid";
  if (paid > 0 && paid === due) return "paid";
  if (paid > 0) return "partial";

  // Nothing paid.
  if (dueDate < today) return "overdue";
  if (daysBetween(today, dueDate) <= DUE_SOON_DAYS) return "due";
  return "upcoming";
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const MONTH_SHORT = MONTH_NAMES.map((m) => m.slice(0, 3));

/**
 * `Rs. 45,000` — decimals only when they carry information. Grouping is done
 * by hand rather than via Intl, which is not reliably present in Hermes.
 */
export function formatLKR(cents: Cents, options: { showDecimals?: boolean } = {}): string {
  const negative = cents < 0;
  const abs = Math.abs(cents);
  const whole = Math.floor(abs / 100);
  const fraction = abs % 100;
  const showDecimals = options.showDecimals ?? fraction !== 0;

  const grouped = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const body = showDecimals ? `${grouped}.${pad(fraction)}` : grouped;
  return `${negative ? "-" : ""}Rs. ${body}`;
}

/** Parse what a user typed into a rent field. Returns null if unusable. */
export function parseLKRInput(input: string): Cents | null {
  const cleaned = input.replace(/[,\s]/g, "");
  if (!/^\d*\.?\d{0,2}$/.test(cleaned) || cleaned === "" || cleaned === ".") return null;
  return Math.round(Number(cleaned) * 100);
}

/** `August 2026` */
export function formatPeriodMonth(monthStart: ISODate): string {
  const { year, month } = parseISODate(monthStart);
  return `${MONTH_NAMES[month - 1]} ${year}`;
}

/** `Aug 2026` */
export function formatPeriodMonthShort(monthStart: ISODate): string {
  const { year, month } = parseISODate(monthStart);
  return `${MONTH_SHORT[month - 1]} ${year}`;
}

/** `5 Aug 2026` */
export function formatDate(date: ISODate): string {
  const { year, month, day } = parseISODate(date);
  return `${day} ${MONTH_SHORT[month - 1]} ${year}`;
}

/** `1st`, `2nd`, `5th` — for "due on the 5th". */
export function ordinal(n: number): string {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

/** Human relative phrasing for a due date, e.g. `Due in 3 days`, `12 days late`. */
export function describeDueDate(dueDate: ISODate, today: ISODate = todayISO()): string {
  const days = daysBetween(today, dueDate);
  if (days === 0) return "Due today";
  if (days === 1) return "Due tomorrow";
  if (days > 1) return `Due in ${days} days`;
  if (days === -1) return "1 day late";
  return `${Math.abs(days)} days late`;
}
