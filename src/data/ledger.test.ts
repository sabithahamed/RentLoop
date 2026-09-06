/**
 * The ledger rules.
 *
 * These two functions decide what every tenant sees about their own money, and
 * `deriveLedgerStatus` is duplicated in Postgres (SPEC.md §4.4). If the two
 * ever disagree the app and the database will tell a tenant different things
 * about the same month, so the rule is pinned down here in the form the spec
 * states it.
 */

import {
  addMonths,
  daysInMonth,
  deriveLedgerStatus,
  dueDateFor,
  formatLKR,
  generatePeriods,
  ordinal,
  parseLKRInput,
} from "./ledger";
import type { Tenancy } from "./types";

const period = (due: number, paid: number, dueDate = "2026-06-05") => ({
  amount_due_cents: due,
  paid_cents: paid,
  due_date: dueDate,
});

const RENT = 45_000_00;

describe("deriveLedgerStatus", () => {
  const today = "2026-06-20";

  it("is paid when the amount matches exactly", () => {
    expect(deriveLedgerStatus(period(RENT, RENT), today)).toBe("paid");
  });

  it("is overpaid when more than the rent came in", () => {
    expect(deriveLedgerStatus(period(RENT, RENT + 1), today)).toBe("overpaid");
  });

  it("is partial when some of it came in", () => {
    expect(deriveLedgerStatus(period(RENT, 20_000_00), today)).toBe("partial");
  });

  it("is overdue when nothing came in and the due date has passed", () => {
    expect(deriveLedgerStatus(period(RENT, 0, "2026-06-05"), today)).toBe("overdue");
  });

  it("is due when nothing came in and the due date is within a week", () => {
    expect(deriveLedgerStatus(period(RENT, 0, "2026-06-25"), today)).toBe("due");
  });

  it("is upcoming when the due date is further out than a week", () => {
    expect(deriveLedgerStatus(period(RENT, 0, "2026-07-05"), today)).toBe("upcoming");
  });

  /**
   * The rule people get wrong. A tenant who paid half is not the same as a
   * tenant who paid nothing, and telling them they are is both wrong and
   * insulting.
   */
  it("stays partial past the due date rather than becoming overdue", () => {
    expect(deriveLedgerStatus(period(RENT, 20_000_00, "2026-06-05"), today)).toBe("partial");
  });

  it("treats the due date itself as due, not overdue", () => {
    expect(deriveLedgerStatus(period(RENT, 0, today), today)).toBe("due");
  });

  it("does not call a zero payment 'paid' even when nothing is owed", () => {
    expect(deriveLedgerStatus(period(0, 0, "2026-07-05"), today)).toBe("upcoming");
  });
});

describe("dueDateFor", () => {
  it("uses the requested day when the month is long enough", () => {
    expect(dueDateFor("2026-06-01", 5)).toBe("2026-06-05");
  });

  /** A tenancy due on the 31st still has to be due in February. */
  it("clamps to the last day of a short month", () => {
    expect(dueDateFor("2026-02-01", 31)).toBe("2026-02-28");
    expect(dueDateFor("2026-04-01", 31)).toBe("2026-04-30");
  });

  it("knows February in a leap year", () => {
    expect(daysInMonth(2028, 2)).toBe(29);
    expect(dueDateFor("2028-02-01", 31)).toBe("2028-02-29");
  });
});

describe("addMonths", () => {
  it("moves forward across a year boundary", () => {
    expect(addMonths("2026-11-01", 3)).toBe("2027-02-01");
  });

  it("moves backward across a year boundary", () => {
    expect(addMonths("2026-02-01", -3)).toBe("2025-11-01");
  });

  it("returns the same month for zero", () => {
    expect(addMonths("2026-06-01", 0)).toBe("2026-06-01");
  });
});

describe("generatePeriods", () => {
  const tenancy = (over: Partial<Tenancy> = {}): Tenancy =>
    ({
      id: "t1",
      owner_id: "u1",
      property_id: "p1",
      landlord_contact_id: "l1",
      rent_amount_cents: RENT,
      currency: "LKR",
      due_day_of_month: 5,
      started_on: "2026-01-15",
      ended_on: null,
      status: "active",
      created_at: "",
      ...over,
    }) as Tenancy;

  it("covers the start month through the months-ahead window", () => {
    const periods = generatePeriods(tenancy(), 3, "2026-03-10");
    expect(periods[0].period_month).toBe("2026-01-01");
    expect(periods[periods.length - 1].period_month).toBe("2026-06-01");
    expect(periods).toHaveLength(6);
  });

  it("snapshots the rent onto each period rather than referencing the tenancy", () => {
    const periods = generatePeriods(tenancy(), 1, "2026-02-10");
    expect(periods.every((p) => p.amount_due_cents === RENT)).toBe(true);
  });

  it("stops at ended_on", () => {
    const periods = generatePeriods(tenancy({ ended_on: "2026-02-20" }), 3, "2026-06-10");
    expect(periods[periods.length - 1].period_month).toBe("2026-02-01");
  });

  it("clamps the due day per month for a tenancy due on the 31st", () => {
    const periods = generatePeriods(tenancy({ due_day_of_month: 31 }), 2, "2026-02-10");
    const february = periods.find((p) => p.period_month === "2026-02-01");
    expect(february?.due_date).toBe("2026-02-28");
  });

  it("produces one period per month with no gaps or repeats", () => {
    const periods = generatePeriods(tenancy(), 6, "2026-06-10");
    const months = periods.map((p) => p.period_month);
    expect(new Set(months).size).toBe(months.length);
  });
});

describe("money formatting", () => {
  it("groups thousands and hides meaningless decimals", () => {
    expect(formatLKR(45_000_00)).toBe("Rs. 45,000");
    expect(formatLKR(1_234_567_89)).toBe("Rs. 1,234,567.89");
  });

  it("shows decimals when asked, even when they are zero", () => {
    expect(formatLKR(45_000_00, { showDecimals: true })).toBe("Rs. 45,000.00");
  });

  it("handles negatives, which a balance can be when overpaid", () => {
    expect(formatLKR(-1_000_00)).toBe("-Rs. 1,000");
  });

  it("round-trips what a user types", () => {
    expect(parseLKRInput("45000")).toBe(45_000_00);
    expect(parseLKRInput("45,000")).toBe(45_000_00);
    expect(parseLKRInput("45000.50")).toBe(45_000_50);
  });

  it("rejects input that is not a number", () => {
    expect(parseLKRInput("")).toBeNull();
    expect(parseLKRInput("abc")).toBeNull();
    expect(parseLKRInput("45.999")).toBeNull();
  });
});

describe("ordinal", () => {
  it("handles the ones that are not 'th'", () => {
    expect(ordinal(1)).toBe("1st");
    expect(ordinal(2)).toBe("2nd");
    expect(ordinal(3)).toBe("3rd");
    expect(ordinal(5)).toBe("5th");
  });

  it("handles the teens, which are all 'th' despite ending 1, 2, 3", () => {
    expect(ordinal(11)).toBe("11th");
    expect(ordinal(12)).toBe("12th");
    expect(ordinal(13)).toBe("13th");
  });

  it("handles the 20s and 30s", () => {
    expect(ordinal(21)).toBe("21st");
    expect(ordinal(31)).toBe("31st");
  });
});
