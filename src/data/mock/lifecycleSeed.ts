/**
 * Seed data for the rest of the lifecycle.
 *
 * Two tenancies, on purpose:
 *
 *   - the **current** annex in Nugegoda, mid-tenancy, where payments,
 *     agreement, move-in evidence, maintenance and messages live;
 *   - a **previous** boarding room in Ratmalana that has ended, which is the
 *     only honest way to show move-out comparison, deposit settlement and a
 *     verified review. You cannot demo a deposit dispute on a tenancy that is
 *     still running.
 *
 * The landlord persona is deliberately a *different* account with its own
 * three properties, not the demo tenant's landlord. Mr. Perera has never
 * installed the app — that is the tenant-only story the ledger screen tells,
 * and quietly putting him on the app to populate a dashboard would undercut
 * it.
 */

import { addMonths, firstOfMonth, formatDate, todayISO } from "../ledger";
import type { Cents, ISODate, UUID } from "../types";
import type {
  Agreement,
  DepositSettlement,
  InspectionSession,
  Listing,
  MaintenanceTicket,
  PortfolioEntry,
  Review,
  Thread,
} from "../lifecycleTypes";

export const MOCK_PHOTO = "mock://photo";
export const mockPhoto = (label: string): string => `${MOCK_PHOTO}/${encodeURIComponent(label)}`;

let n = 0;
const id = (p: string): string => `${p}-${++n}`;

const iso = (date: ISODate, hour = 10): string => `${date}T${String(hour).padStart(2, "0")}:00:00Z`;

export interface LifecycleSeed {
  agreements: Agreement[];
  inspections: InspectionSession[];
  tickets: MaintenanceTicket[];
  threads: Thread[];
  settlements: DepositSettlement[];
  reviews: Review[];
  listings: Listing[];
  portfolio: PortfolioEntry[];
}

/** Rooms and areas the assistant expects to see in a move-in inspection. */
export const STANDARD_AREAS: { room: string; name: string; required: boolean }[] = [
  { room: "Living room", name: "Walls", required: true },
  { room: "Living room", name: "Ceiling", required: true },
  { room: "Living room", name: "Floor", required: true },
  { room: "Living room", name: "Windows and locks", required: true },
  { room: "Kitchen", name: "Sink and taps", required: true },
  { room: "Kitchen", name: "Cupboards", required: false },
  { room: "Bathroom", name: "Ceiling", required: true },
  { room: "Bathroom", name: "Toilet and fittings", required: true },
  { room: "Bedroom", name: "Walls", required: true },
  { room: "Bedroom", name: "Wardrobe", required: false },
  { room: "Utilities", name: "Electricity meter", required: true },
  { room: "Utilities", name: "Water meter", required: true },
];

type CapturedArea = {
  room: string;
  name: string;
  note?: string;
  findings?: InspectionSession["areas"][0]["photos"][0]["findings"];
};

function buildAreas(
  sessionId: UUID,
  captured: CapturedArea[],
  capturedOn: ISODate,
): InspectionSession["areas"] {
  return STANDARD_AREAS.map((spec) => {
    const areaId = id("area");
    // Room *and* name — several rooms have a "Ceiling" and matching on the name
    // alone silently photographs all of them.
    const hit = captured.find((c) => c.room === spec.room && c.name === spec.name);
    return {
      id: areaId,
      session_id: sessionId,
      name: spec.name,
      room: spec.room,
      required: spec.required,
      photos: hit
        ? [
            {
              id: id("photo"),
              area_id: areaId,
              uri: mockPhoto(`${spec.room} — ${spec.name}`),
              captured_at: iso(capturedOn),
              note: hit.note ?? null,
              findings: hit.findings ?? [],
            },
          ]
        : [],
    };
  });
}

export function buildLifecycleSeed(
  currentTenancyId: UUID,
  pastTenancyId: UUID,
  today: ISODate = todayISO(),
): LifecycleSeed {
  n = 0;
  const thisMonth = firstOfMonth(today);
  const tenancyStart = addMonths(thisMonth, -6);

  // -------------------------------------------------------------------------
  // Agreement — read, but not yet confirmed by a human
  // -------------------------------------------------------------------------

  const agreementId = id("agr");
  const agreement: Agreement = {
    id: agreementId,
    tenancy_id: currentTenancyId,
    file_name: "Rental agreement - Sarana Road.pdf",
    file_uri: null,
    uploaded_at: iso(tenancyStart),
    status: "needs_review",
    endsOn: addMonths(tenancyStart, 12),
    noticePeriodDays: 60,
    depositCents: 90_000_00,
    terms: [
      {
        id: id("term"),
        label: "Monthly rent",
        value: "Rs. 45,000",
        confidence: 0.97,
        confirmed: true,
        sourceQuote: "the Tenant shall pay a monthly rental of Rupees Forty Five Thousand",
      },
      {
        id: id("term"),
        label: "Refundable deposit",
        value: "Rs. 90,000",
        confidence: 0.94,
        confirmed: true,
        sourceQuote: "a refundable deposit equivalent to two months rental",
      },
      {
        id: id("term"),
        label: "Rent due date",
        value: "5th of each month",
        confidence: 0.91,
        confirmed: true,
        sourceQuote: "payable on or before the 5th day of each calendar month",
      },
      {
        id: id("term"),
        label: "Notice period",
        value: "60 days",
        confidence: 0.72,
        confirmed: false,
        sourceQuote: "either party may terminate by giving two months notice in writing",
      },
      {
        id: id("term"),
        label: "Agreement ends",
        value: formatDate(addMonths(tenancyStart, 12)),
        confidence: 0.88,
        confirmed: false,
        sourceQuote: "for a term of twelve (12) months commencing from the date hereof",
      },
      {
        id: id("term"),
        label: "Who pays for repairs",
        value: "Landlord — structural only",
        confidence: 0.58,
        confirmed: false,
        sourceQuote:
          "major repairs of a structural nature shall be borne by the Landlord, all other repairs by the Tenant",
      },
    ],
    flaggedClauses: [
      {
        id: id("clause"),
        text: "All other repairs by the Tenant.",
        reason:
          "Unusually broad. As written this could include plumbing and electrical faults that are normally the landlord’s responsibility. Worth clarifying before you need it.",
      },
      {
        id: id("clause"),
        text: "The deposit shall be refunded subject to satisfactory condition of the premises.",
        reason:
          '"Satisfactory" is not defined anywhere in the document. Your move-in photos are what will decide this.',
      },
    ],
  };

  // -------------------------------------------------------------------------
  // Inspections
  // -------------------------------------------------------------------------

  const moveInId = id("insp");
  const moveIn: InspectionSession = {
    id: moveInId,
    tenancy_id: currentTenancyId,
    kind: "move_in",
    status: "complete",
    started_on: tenancyStart,
    completed_on: tenancyStart,
    // The bathroom ceiling is deliberately absent — it is what the assistant
    // notices below, and a demo where nothing is missing shows nothing.
    areas: buildAreas(
      moveInId,
      [
        { room: "Living room", name: "Walls" },
        { room: "Living room", name: "Ceiling" },
        { room: "Living room", name: "Floor", note: "Small scuff near the door, already there" },
        { room: "Living room", name: "Windows and locks" },
        { room: "Kitchen", name: "Sink and taps" },
        { room: "Kitchen", name: "Cupboards" },
        { room: "Bathroom", name: "Toilet and fittings" },
        { room: "Bedroom", name: "Walls" },
        { room: "Bedroom", name: "Wardrobe" },
        { room: "Utilities", name: "Electricity meter", note: "Reading 41,208 units" },
        { room: "Utilities", name: "Water meter", note: "Reading 00918" },
      ],
      tenancyStart,
    ),
    suggestions: [
      {
        id: id("ai"),
        kind: "missing_area",
        headline: "Bathroom ceiling was never photographed",
        detail:
          "Bathroom ceilings are where damp shows up first, and it is the most commonly disputed area at move-out. Worth adding even now.",
        confidence: 0.93,
        acceptedAt: null,
        rejectedAt: null,
      },
    ],
  };

  // The previous tenancy — both sides captured, which is what makes the
  // comparison and the deposit settlement demonstrable.
  const pastMoveInId = id("insp");
  const pastStart = addMonths(thisMonth, -20);
  const pastEnd = addMonths(thisMonth, -7);

  const pastMoveIn: InspectionSession = {
    id: pastMoveInId,
    tenancy_id: pastTenancyId,
    kind: "move_in",
    status: "complete",
    started_on: pastStart,
    completed_on: pastStart,
    areas: buildAreas(
      pastMoveInId,
      [
        { room: "Living room", name: "Walls" },
        { room: "Living room", name: "Ceiling" },
        { room: "Living room", name: "Floor" },
        { room: "Living room", name: "Windows and locks" },
        { room: "Kitchen", name: "Sink and taps" },
        { room: "Bathroom", name: "Toilet and fittings" },
        { room: "Bedroom", name: "Walls" },
        { room: "Utilities", name: "Electricity meter" },
        { room: "Utilities", name: "Water meter" },
      ],
      pastStart,
    ),
    suggestions: [],
  };

  const pastMoveOutId = id("insp");
  const pastMoveOut: InspectionSession = {
    id: pastMoveOutId,
    tenancy_id: pastTenancyId,
    kind: "move_out",
    status: "complete",
    started_on: pastEnd,
    completed_on: pastEnd,
    areas: buildAreas(
      pastMoveOutId,
      [
        {
          room: "Bedroom",
          name: "Walls",
          note: "Mark above the bed, was not there when I moved in",
          findings: [{ id: id("f"), label: "Stain on wall", severity: "minor", confidence: 0.81 }],
        },
        { room: "Living room", name: "Walls" },
        { room: "Living room", name: "Ceiling" },
        { room: "Living room", name: "Floor" },
        {
          room: "Living room",
          name: "Windows and locks",
          findings: [
            { id: id("f"), label: "Window latch broken", severity: "moderate", confidence: 0.88 },
          ],
        },
        { room: "Kitchen", name: "Sink and taps" },
        { room: "Bathroom", name: "Toilet and fittings" },
        { room: "Utilities", name: "Electricity meter", note: "Final reading 52,760" },
        { room: "Utilities", name: "Water meter", note: "Final reading 01344" },
      ],
      pastEnd,
    ),
    suggestions: [],
  };

  // -------------------------------------------------------------------------
  // Maintenance
  // -------------------------------------------------------------------------

  const ticket = (
    title: string,
    description: string,
    partial: Partial<MaintenanceTicket>,
    events: {
      daysAgo: number;
      by: "tenant" | "landlord";
      label: string;
      note?: string;
      status?: MaintenanceTicket["status"];
    }[],
  ): MaintenanceTicket => {
    const ticketId = id("tkt");
    const dayOf = (daysAgo: number): ISODate => {
      const d = new Date(`${today}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() - daysAgo);
      return d.toISOString().slice(0, 10);
    };
    return {
      id: ticketId,
      tenancy_id: currentTenancyId,
      title,
      description,
      category: "other",
      urgency: "normal",
      status: "reported",
      reported_by: "tenant",
      reported_on: dayOf(events[0]?.daysAgo ?? 0),
      photoUris: [mockPhoto(title)],
      suggestion: null,
      costCents: null,
      events: events.map((e) => ({
        id: id("evt"),
        ticket_id: ticketId,
        at: iso(dayOf(e.daysAgo), 9),
        by: e.by,
        label: e.label,
        note: e.note ?? null,
        status_after: e.status ?? null,
      })),
      ...partial,
    };
  };

  const tickets: MaintenanceTicket[] = [
    ticket(
      "Damp patch spreading on bathroom ceiling",
      "It started as a small mark about three weeks ago and it is now roughly the size of a dinner plate. The paint has started to flake.",
      {
        category: "structural",
        urgency: "high",
        status: "in_progress",
        photoUris: [mockPhoto("Bathroom ceiling damp"), mockPhoto("Flaking paint")],
        suggestion: {
          id: id("ai"),
          kind: "classification",
          headline: "Looks like a water leak from above, not condensation",
          detail:
            "The spread pattern and flaking suggest water ingress rather than humidity. These get worse and more expensive the longer they wait, so this was raised as high urgency.",
          confidence: 0.84,
          acceptedAt: iso(today, 9),
          rejectedAt: null,
        },
      },
      [
        { daysAgo: 9, by: "tenant", label: "Reported the issue", status: "reported" },
        {
          daysAgo: 8,
          by: "landlord",
          label: "Acknowledged",
          note: "Will send someone this week.",
          status: "acknowledged",
        },
        { daysAgo: 5, by: "landlord", label: "Approved the repair", status: "approved" },
        {
          daysAgo: 2,
          by: "landlord",
          label: "Plumber visited",
          note: "Leak traced to the upstairs bathroom. Parts ordered.",
          status: "in_progress",
        },
      ],
    ),
    ticket(
      "Kitchen tap dripping constantly",
      "Drips even when fully closed. Wasting water and the sound carries at night.",
      {
        category: "plumbing",
        urgency: "normal",
        status: "resolved",
        costCents: 3_500_00,
        suggestion: {
          id: id("ai"),
          kind: "classification",
          headline: "Plumbing — likely a worn washer",
          detail: "Common and inexpensive to fix. Classified as normal urgency.",
          confidence: 0.91,
          acceptedAt: iso(today, 9),
          rejectedAt: null,
        },
      },
      [
        { daysAgo: 47, by: "tenant", label: "Reported the issue", status: "reported" },
        { daysAgo: 45, by: "landlord", label: "Approved the repair", status: "approved" },
        {
          daysAgo: 41,
          by: "landlord",
          label: "Marked resolved",
          note: "Washer replaced. Rs. 3,500.",
          status: "resolved",
        },
      ],
    ),
    ticket(
      "Bedroom window latch will not close",
      "The latch turns but does not catch, so the window swings open in wind. Ground floor, so I would rather it locked.",
      {
        category: "structural",
        urgency: "normal",
        status: "reported",
        suggestion: {
          id: id("ai"),
          kind: "classification",
          headline: "Security-relevant — suggested raising urgency",
          detail:
            "A ground-floor window that will not lock is a security issue as much as a repair. Consider marking this high.",
          confidence: 0.69,
          acceptedAt: null,
          rejectedAt: null,
        },
      },
      [{ daysAgo: 3, by: "tenant", label: "Reported the issue", status: "reported" }],
    ),
  ];

  // The whole point of the deposit agent: damage the tenant reported during the
  // tenancy and the landlord never repaired. The landlord is now charging for
  // repainting that same wall. Without this in the record there is nothing to
  // argue with, and the agent's best reasoning has nothing to find.
  const pastDampTicketId = id("tkt");
  tickets.push({
    id: pastDampTicketId,
    tenancy_id: pastTenancyId,
    title: "Damp coming through the bedroom wall above the bed",
    description:
      "There is a brown patch spreading on the wall behind the bed. It gets worse after heavy rain. It was not there when I moved in.",
    category: "structural",
    urgency: "high",
    status: "acknowledged",
    reported_by: "tenant",
    reported_on: addMonths(thisMonth, -15),
    photoUris: [mockPhoto("Bedroom wall damp")],
    suggestion: null,
    costCents: null,
    events: [
      {
        id: id("evt"),
        ticket_id: pastDampTicketId,
        at: iso(addMonths(thisMonth, -15), 9),
        by: "tenant",
        label: "Reported the issue",
        note: "Sent photos of the wall.",
        status_after: "reported",
      },
      {
        id: id("evt"),
        ticket_id: pastDampTicketId,
        at: iso(addMonths(thisMonth, -14), 9),
        by: "landlord",
        label: "Acknowledged",
        note: "Will look into it after the rains.",
        status_after: "acknowledged",
      },
    ],
  });

  // And an agreement on the old tenancy, so the agent can check liability there
  // too rather than reporting "no agreement on file".
  const pastAgreementId = id("agr");
  const pastAgreement: Agreement = {
    id: pastAgreementId,
    tenancy_id: pastTenancyId,
    file_name: "Boarding room agreement.pdf",
    file_uri: null,
    uploaded_at: iso(pastStart),
    status: "confirmed",
    endsOn: pastEnd,
    noticePeriodDays: 30,
    depositCents: 50_000_00,
    terms: [
      {
        id: id("term"),
        label: "Refundable deposit",
        value: "Rs. 50,000",
        confidence: 0.95,
        confirmed: true,
        sourceQuote: "a refundable deposit of Rupees Fifty Thousand",
      },
      {
        id: id("term"),
        label: "Who pays for repairs",
        value: "Landlord — anything structural or pre-existing",
        confidence: 0.86,
        confirmed: true,
        sourceQuote:
          "the Landlord shall remain responsible for the structure, roof and walls of the premises",
      },
      {
        id: id("term"),
        label: "Condition at handover",
        value: "Reasonable wear and tear excepted",
        confidence: 0.9,
        confirmed: true,
        sourceQuote:
          "the Tenant shall return the premises in the condition received, reasonable wear and tear excepted",
      },
    ],
    flaggedClauses: [],
  };

  // -------------------------------------------------------------------------
  // Communication — every thread anchored to something
  // -------------------------------------------------------------------------

  const thread = (
    subject: string,
    about: Thread["about"],
    msgs: { daysAgo: number; by: "tenant" | "landlord"; body: string }[],
    unreadFor: Thread["unreadFor"] = [],
  ): Thread => {
    const threadId = id("thr");
    const dayOf = (daysAgo: number): ISODate => {
      const d = new Date(`${today}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() - daysAgo);
      return d.toISOString().slice(0, 10);
    };
    const messages = msgs.map((m, i) => ({
      id: id("msg"),
      thread_id: threadId,
      by: m.by,
      body: m.body,
      sent_at: iso(dayOf(m.daysAgo), 8 + i),
    }));
    return {
      id: threadId,
      tenancy_id: currentTenancyId,
      subject,
      about,
      messages,
      lastMessageAt: messages[messages.length - 1].sent_at,
      unreadFor,
    };
  };

  const threads: Thread[] = [
    thread(
      "Bathroom ceiling",
      { type: "maintenance", id: tickets[0].id },
      [
        {
          daysAgo: 9,
          by: "tenant",
          body: "Sent photos of the ceiling. It has got noticeably worse this week.",
        },
        { daysAgo: 8, by: "landlord", body: "Saw them. I will send the plumber Thursday." },
        {
          daysAgo: 2,
          by: "landlord",
          body: "Plumber says it is coming from upstairs. Parts ordered, should be done next week.",
        },
      ],
      ["tenant"],
    ),
    thread("June rent — paying in two parts", { type: "payment", id: null }, [
      {
        daysAgo: 56,
        by: "tenant",
        body: "Salary is late this month. Can I send Rs. 20,000 now and the rest on the 18th?",
      },
      { daysAgo: 56, by: "landlord", body: "That is fine. Please put the reference on the slip." },
    ]),
    thread("Water bill share", { type: "general", id: null }, [
      {
        daysAgo: 120,
        by: "landlord",
        body: "Water bill came to Rs. 2,400 this quarter. Your share is Rs. 1,000.",
      },
      { daysAgo: 119, by: "tenant", body: "Added it to the March transfer." },
    ]),
  ];

  // -------------------------------------------------------------------------
  // Deposit settlement on the tenancy that ended
  // -------------------------------------------------------------------------

  const settlementId = id("set");
  const settlement: DepositSettlement = {
    id: settlementId,
    tenancy_id: pastTenancyId,
    depositCents: 50_000_00,
    status: "disputed",
    settledOn: null,
    deductions: [
      {
        id: id("ded"),
        settlement_id: settlementId,
        label: "Repaint bedroom wall",
        amountCents: 12_000_00,
        reason: "Staining above the bed that was not present at move-in.",
        evidenceAreaNames: ["Walls"],
        proposedBy: "landlord",
        agreed: null,
      },
      {
        id: id("ded"),
        settlement_id: settlementId,
        label: "Replace window latch",
        amountCents: 4_500_00,
        reason: "Latch broken during the tenancy.",
        evidenceAreaNames: ["Windows and locks"],
        proposedBy: "landlord",
        agreed: true,
      },
      {
        id: id("ded"),
        settlement_id: settlementId,
        label: "Deep clean",
        amountCents: 8_000_00,
        reason: "Property required professional cleaning.",
        evidenceAreaNames: [],
        proposedBy: "landlord",
        agreed: false,
      },
    ],
  };

  // -------------------------------------------------------------------------
  // Reviews, discovery, landlord portfolio
  // -------------------------------------------------------------------------

  const reviews: Review[] = [
    {
      id: id("rev"),
      tenancy_id: pastTenancyId,
      direction: "tenant_to_landlord",
      rating: 4,
      body: "Responsive about repairs and never late returning calls. Deposit process dragged on longer than it should have.",
      created_at: iso(addMonths(thisMonth, -6)),
      verified: true,
    },
    {
      id: id("rev"),
      tenancy_id: pastTenancyId,
      direction: "landlord_to_tenant",
      rating: 5,
      body: "Paid on time every month for 13 months. Left the place clean. Would rent to again.",
      created_at: iso(addMonths(thisMonth, -6)),
      verified: true,
    },
  ];

  const listings: Listing[] = [
    {
      id: id("lst"),
      title: "Annex with separate entrance",
      city: "Nugegoda",
      rentCents: 48_000_00,
      bedrooms: 2,
      landlordName: "S. Wickramasinghe",
      landlordRating: 4.6,
      landlordTenancyCount: 7,
      verified: true,
    },
    {
      id: id("lst"),
      title: "Upstairs unit, quiet lane",
      city: "Dehiwala",
      rentCents: 55_000_00,
      bedrooms: 2,
      landlordName: "M. Fernando",
      landlordRating: 4.9,
      landlordTenancyCount: 12,
      verified: true,
    },
    {
      id: id("lst"),
      title: "Single room, meals optional",
      city: "Ratmalana",
      rentCents: 22_000_00,
      bedrooms: 1,
      landlordName: "K. Gunasekara",
      landlordRating: null,
      landlordTenancyCount: 0,
      verified: false,
    },
    {
      id: id("lst"),
      title: "3BR house with garden",
      city: "Kotte",
      rentCents: 95_000_00,
      bedrooms: 3,
      landlordName: "A. Rajapaksha",
      landlordRating: 3.8,
      landlordTenancyCount: 4,
      verified: true,
    },
  ];

  /**
   * The landlord lens. A separate persona with their own properties — see the
   * note at the top of this file about why this is not Mr. Perera.
   */
  const portfolio: PortfolioEntry[] = [
    {
      tenancyId: id("lt"),
      propertyLabel: "Ground floor, Dehiwala",
      city: "Dehiwala",
      tenantName: "Nimali Fernando",
      rentCents: 52_000_00,
      arrearsCents: 0,
      monthsBehind: 0,
      openTicketCount: 0,
      connected: true,
    },
    {
      tenancyId: id("lt"),
      propertyLabel: "2BR apartment, Kotte",
      city: "Kotte",
      tenantName: "Ruwan Jayasuriya",
      rentCents: 65_000_00,
      arrearsCents: 130_000_00,
      monthsBehind: 2,
      openTicketCount: 1,
      connected: true,
    },
    {
      tenancyId: id("lt"),
      propertyLabel: "Annex, Maharagama",
      city: "Maharagama",
      tenantName: "Fathima Rizwan",
      rentCents: 38_000_00,
      arrearsCents: 0,
      monthsBehind: 0,
      openTicketCount: 0,
      connected: false,
    },
  ];

  return {
    agreements: [agreement, pastAgreement],
    inspections: [moveIn, pastMoveIn, pastMoveOut],
    tickets,
    threads,
    settlements: [settlement],
    reviews,
    listings,
    portfolio,
  };
}

/** Deposit maths, used by both the settlement screen and the overview. */
export function settlementTotals(s: DepositSettlement): {
  proposed: Cents;
  agreed: Cents;
  returning: Cents;
} {
  const proposed = s.deductions.reduce((sum, d) => sum + d.amountCents, 0);
  const agreed = s.deductions
    .filter((d) => d.agreed === true)
    .reduce((sum, d) => sum + d.amountCents, 0);
  return { proposed, agreed, returning: s.depositCents - agreed };
}
