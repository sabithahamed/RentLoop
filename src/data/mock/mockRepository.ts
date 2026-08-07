/**
 * In-memory Repository for the prototype.
 *
 * State lives in module scope and is lost on reload — that is fine and even
 * useful, since it means every reload returns to a known seeded ledger.
 *
 * The artificial latency is deliberate: loading states designed against an
 * instant mock are loading states that were never really designed.
 */

import {
  daysBetween,
  deriveLedgerStatus,
  formatDate,
  formatLKR,
  formatPeriodMonth,
  generatePeriods,
  todayISO,
} from "../ledger";
import type {
  LandlordContact,
  LedgerRow,
  Payment,
  PeriodDetail,
  Property,
  RentPeriod,
  RentPeriodSummary,
  TenancyDraft,
  Tenancy,
  TenancySummary,
  UUID,
} from "../types";
import type { Repository, RecordPaymentInput, Session, SignUpInput } from "../repository";
import type {
  Agreement,
  AreaComparison,
  DepositSettlement,
  Enquiry,
  InspectionKind,
  InspectionSession,
  Invitation,
  LifecycleOverview,
  Listing,
  MaintenanceCategory,
  MaintenanceStatus,
  MaintenanceTicket,
  MaintenanceUrgency,
  PortfolioEntry,
  Reminder,
  Renewal,
  RenewalIntent,
  Review,
  Role,
  Thread,
} from "../lifecycleTypes";
import { buildSeed, DEMO_EMAIL, DEMO_NAME, DEMO_USER_ID } from "./seed";
import { buildLifecycleSeed, mockPhoto, STANDARD_AREAS } from "./lifecycleSeed";

const LATENCY_MS = 250;

const delay = <T>(value: T): Promise<T> =>
  new Promise((resolve) => setTimeout(() => resolve(value), LATENCY_MS));

interface State {
  session: Session | null;
  properties: Property[];
  landlords: LandlordContact[];
  tenancies: Tenancy[];
  periods: RentPeriod[];
  payments: Payment[];
  agreements: Agreement[];
  inspections: InspectionSession[];
  tickets: MaintenanceTicket[];
  threads: Thread[];
  settlements: DepositSettlement[];
  reviews: Review[];
  listings: Listing[];
  portfolio: PortfolioEntry[];
  renewals: Renewal[];
  invitations: Invitation[];
  enquiries: Enquiry[];
  /** paymentId → date the landlord confirmed receipt. */
  issuedReceipts: Record<string, string>;
}

let counter = 1000;
const newId = (prefix: string): string => `${prefix}-${++counter}`;

function seededState(session: Session | null): State {
  const seed = buildSeed();
  const lifecycle = buildLifecycleSeed(seed.tenancy.id, seed.pastTenancy.id);
  return {
    session,
    properties: [seed.property, seed.pastProperty],
    landlords: [seed.landlord, seed.pastLandlord],
    tenancies: [seed.tenancy, seed.pastTenancy],
    periods: seed.periods,
    payments: seed.payments,
    ...lifecycle,
    renewals: [],
    invitations: [],
    enquiries: [],
    issuedReceipts: {},
  };
}

function emptyState(session: Session | null): State {
  return {
    session,
    properties: [],
    landlords: [],
    tenancies: [],
    periods: [],
    payments: [],
    agreements: [],
    inspections: [],
    tickets: [],
    threads: [],
    settlements: [],
    reviews: [],
    // Discovery and the landlord lens are not per-account in the prototype.
    listings: buildLifecycleSeed("none", "none").listings,
    portfolio: buildLifecycleSeed("none", "none").portfolio,
    renewals: [],
    invitations: [],
    enquiries: [],
    issuedReceipts: {},
  };
}

const demoSession: Session = {
  userId: DEMO_USER_ID,
  email: DEMO_EMAIL,
  displayName: DEMO_NAME,
};

/** Starts signed in on the seeded tenancy — the design is judged there. */
let state: State = seededState(demoSession);

function summarise(period: RentPeriod, payments: Payment[]): RentPeriodSummary {
  const mine = payments.filter((p) => p.rent_period_id === period.id);
  const paid = mine.reduce((sum, p) => sum + p.amount_cents, 0);
  return {
    id: period.id,
    owner_id: period.owner_id,
    tenancy_id: period.tenancy_id,
    period_month: period.period_month,
    due_date: period.due_date,
    amount_due_cents: period.amount_due_cents,
    paid_cents: paid,
    balance_cents: period.amount_due_cents - paid,
    payment_count: mine.length,
    unproven_payment_count: mine.filter((p) => p.receipt_path === null).length,
    last_paid_on: mine.reduce<string | null>(
      (latest, p) => (latest === null || p.paid_on > latest ? p.paid_on : latest),
      null,
    ),
  };
}

function toLedgerRow(period: RentPeriod, payments: Payment[]): LedgerRow {
  const summary = summarise(period, payments);
  return { ...summary, status: deriveLedgerStatus(summary) };
}

/** The mock's `ensure_rent_periods` — idempotent on (tenancy_id, period_month). */
function ensurePeriods(tenancy: Tenancy): void {
  const existing = new Set(
    state.periods.filter((p) => p.tenancy_id === tenancy.id).map((p) => p.period_month),
  );
  for (const generated of generatePeriods(tenancy)) {
    if (existing.has(generated.period_month)) continue;
    state.periods.push({
      ...generated,
      id: newId("period"),
      created_at: new Date().toISOString(),
    });
  }
}

function requireSession(): Session {
  if (!state.session) throw new Error("Not signed in");
  return state.session;
}

export const mockRepository: Repository = {
  async getSession() {
    return delay(state.session);
  },

  async signIn(email) {
    // The prototype accepts anything. Signing in as the demo address returns
    // the seeded ledger; any other address starts empty, which is how the
    // onboarding flow gets exercised.
    const isDemo = email.trim().toLowerCase() === DEMO_EMAIL;
    const session: Session = isDemo
      ? demoSession
      : {
          userId: newId("user"),
          email: email.trim(),
          displayName: email.split("@")[0] || "Tenant",
        };
    state = isDemo ? seededState(session) : emptyState(session);
    return delay(session);
  },

  async signUp({ email, displayName }: SignUpInput) {
    const session: Session = {
      userId: newId("user"),
      email: email.trim(),
      displayName: displayName.trim() || "Tenant",
    };
    state = emptyState(session);
    return delay(session);
  },

  async signOut() {
    state = emptyState(null);
    return delay(undefined);
  },

  async getTenancySummary() {
    const session = state.session;
    if (!session) return delay(null);

    // The active one — a user may have ended tenancies behind them.
    const tenancy =
      state.tenancies.find((t) => t.owner_id === session.userId && t.status === "active") ?? null;
    if (!tenancy) return delay(null);

    const property = state.properties.find((p) => p.id === tenancy.property_id)!;
    const landlord = state.landlords.find((l) => l.id === tenancy.landlord_contact_id)!;
    return delay<TenancySummary>({ tenancy, property, landlord });
  },

  async listTenancies() {
    const session = state.session;
    if (!session) return delay<TenancySummary[]>([]);

    const summaries = state.tenancies
      .filter((t) => t.owner_id === session.userId)
      .map((tenancy) => ({
        tenancy,
        property: state.properties.find((p) => p.id === tenancy.property_id)!,
        landlord: state.landlords.find((l) => l.id === tenancy.landlord_contact_id)!,
      }))
      .sort((a, b) => (a.tenancy.started_on < b.tenancy.started_on ? 1 : -1));

    return delay(summaries);
  },

  async createTenancy(draft: TenancyDraft) {
    const session = requireSession();
    const created_at = new Date().toISOString();

    const property: Property = {
      id: newId("prop"),
      owner_id: session.userId,
      label: draft.propertyLabel.trim(),
      address_line: draft.addressLine.trim() || null,
      city: draft.city.trim() || null,
      created_at,
    };

    const landlord: LandlordContact = {
      id: newId("land"),
      owner_id: session.userId,
      full_name: draft.landlordName.trim(),
      phone: draft.landlordPhone.trim() || null,
      email: null,
      linked_user_id: null,
      created_at,
    };

    const tenancy: Tenancy = {
      id: newId("ten"),
      owner_id: session.userId,
      property_id: property.id,
      landlord_contact_id: landlord.id,
      rent_amount_cents: draft.rentAmountCents,
      currency: "LKR",
      due_day_of_month: draft.dueDayOfMonth,
      started_on: draft.startedOn,
      ended_on: null,
      status: "active",
      created_at,
    };

    state.properties.push(property);
    state.landlords.push(landlord);
    state.tenancies.push(tenancy);
    ensurePeriods(tenancy);

    return delay<TenancySummary>({ tenancy, property, landlord });
  },

  async listLedger(tenancyId: UUID) {
    const tenancy = state.tenancies.find((t) => t.id === tenancyId);
    if (!tenancy) throw new Error(`Tenancy ${tenancyId} not found`);

    ensurePeriods(tenancy);

    const rows = state.periods
      .filter((p) => p.tenancy_id === tenancyId)
      .sort((a, b) => (a.period_month < b.period_month ? 1 : -1)) // newest first
      .map((p) => toLedgerRow(p, state.payments));

    return delay(rows);
  },

  async getPeriodDetail(rentPeriodId: UUID) {
    const period = state.periods.find((p) => p.id === rentPeriodId);
    if (!period) throw new Error(`Period ${rentPeriodId} not found`);

    const payments = state.payments
      .filter((p) => p.rent_period_id === rentPeriodId)
      .sort((a, b) => (a.paid_on < b.paid_on ? -1 : 1));

    return delay<PeriodDetail>({ period: toLedgerRow(period, state.payments), payments });
  },

  async getPayment(paymentId: UUID) {
    const payment = state.payments.find((p) => p.id === paymentId);
    if (!payment) throw new Error(`Payment ${paymentId} not found`);
    return delay(payment);
  },

  async recordPayment(input: RecordPaymentInput) {
    const session = requireSession();
    const period = state.periods.find((p) => p.id === input.rentPeriodId);
    if (!period) throw new Error(`Period ${input.rentPeriodId} not found`);

    const payment: Payment = {
      id: newId("pay"),
      owner_id: session.userId,
      rent_period_id: period.id,
      tenancy_id: period.tenancy_id,
      amount_cents: input.amountCents,
      paid_on: input.paidOn,
      method: input.method,
      reference: input.reference?.trim() || null,
      note: input.note?.trim() || null,
      // The real implementation uploads first and stores the object path.
      receipt_path: input.receiptUri,
      created_at: new Date().toISOString(),
    };

    state.payments.push(payment);
    return delay(payment);
  },

  async attachSlip(paymentId: UUID, receiptUri: string) {
    const payment = state.payments.find((p) => p.id === paymentId);
    if (!payment) throw new Error(`Payment ${paymentId} not found`);
    payment.receipt_path = receiptUri;
    return delay(payment);
  },

  async getReceiptUrl(receiptPath) {
    // The mock stores a directly renderable URI. Supabase will store an object
    // path here and mint a short-lived signed URL instead — never a public one,
    // since a bank slip carries an account number and a balance.
    return receiptPath;
  },

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  async getOverview(tenancyId: UUID) {
    const agreement = state.agreements.find((a) => a.tenancy_id === tenancyId) ?? null;
    const moveIn = state.inspections.find(
      (i) => i.tenancy_id === tenancyId && i.kind === "move_in",
    );
    const moveOut = state.inspections.find(
      (i) => i.tenancy_id === tenancyId && i.kind === "move_out",
    );

    const today = todayISO();
    const deadlines: LifecycleOverview["upcomingDeadlines"] = [];
    if (agreement?.endsOn) {
      deadlines.push({
        label: "Agreement ends",
        on: agreement.endsOn,
        daysAway: daysBetween(today, agreement.endsOn),
      });
      if (agreement.noticePeriodDays !== null) {
        const notice = new Date(`${agreement.endsOn}T00:00:00Z`);
        notice.setUTCDate(notice.getUTCDate() - agreement.noticePeriodDays);
        const on = notice.toISOString().slice(0, 10);
        deadlines.push({
          label: "Last day to give notice",
          on,
          daysAway: daysBetween(today, on),
        });
      }
    }
    deadlines.sort((a, b) => a.daysAway - b.daysAway);

    return delay<LifecycleOverview>({
      agreementStatus: agreement?.status ?? "none",
      moveInStatus: moveIn?.status ?? "not_started",
      moveOutStatus: moveOut?.status ?? "not_started",
      openTickets: state.tickets.filter(
        (t) => t.tenancy_id === tenancyId && t.status !== "resolved" && t.status !== "declined",
      ).length,
      unreadThreads: state.threads.filter(
        (t) => t.tenancy_id === tenancyId && t.unreadFor.length > 0,
      ).length,
      upcomingDeadlines: deadlines,
    });
  },

  // Agreement ----------------------------------------------------------------

  async getAgreement(tenancyId: UUID) {
    return delay(state.agreements.find((a) => a.tenancy_id === tenancyId) ?? null);
  },

  async uploadAgreement(tenancyId: UUID, fileName: string) {
    // A real upload would hand the document to an extraction pipeline. Here the
    // "extraction" is a fixed set of terms — enough to design the review screen,
    // which is the part that actually needs deciding.
    const agreement: Agreement = {
      id: newId("agr"),
      tenancy_id: tenancyId,
      file_name: fileName,
      file_uri: null,
      uploaded_at: new Date().toISOString(),
      status: "needs_review",
      endsOn: null,
      noticePeriodDays: null,
      depositCents: null,
      terms: [],
      flaggedClauses: [],
    };
    state.agreements.push(agreement);
    return delay(agreement);
  },

  async confirmTerm(agreementId: UUID, termId: UUID, value: string) {
    const agreement = state.agreements.find((a) => a.id === agreementId);
    if (!agreement) throw new Error("Agreement not found");
    const term = agreement.terms.find((t) => t.id === termId);
    if (term) {
      term.value = value;
      term.confirmed = true;
    }
    agreement.status = agreement.terms.every((t) => t.confirmed) ? "confirmed" : "needs_review";
    return delay(agreement);
  },

  async applyExtractedAgreement(tenancyId: UUID, extracted) {
    let agreement = state.agreements.find((a) => a.tenancy_id === tenancyId);
    if (!agreement) {
      agreement = await this.uploadAgreement(tenancyId, "Rental agreement (photo)");
    }

    // Nothing arrives confirmed. Extraction is a proposal, and a term the
    // tenant has not checked must never silently become a deadline.
    agreement.terms = extracted.terms.map((t) => ({
      id: newId("term"),
      label: t.label,
      value: t.value,
      confidence: t.confidence,
      confirmed: false,
      sourceQuote: t.sourceQuote,
    }));
    agreement.flaggedClauses = extracted.flaggedClauses.map((c) => ({
      id: newId("clause"),
      text: c.text,
      reason: c.reason,
    }));
    agreement.depositCents = extracted.depositCents;
    agreement.noticePeriodDays = extracted.noticePeriodDays;
    agreement.endsOn = extracted.endsOn;
    agreement.status = "needs_review";

    return delay(agreement);
  },

  // Inspections --------------------------------------------------------------

  async getInspection(tenancyId: UUID, kind: InspectionKind) {
    let session = state.inspections.find((i) => i.tenancy_id === tenancyId && i.kind === kind);
    if (!session) {
      // Start one lazily, with the standard checklist already laid out.
      const sessionId = newId("insp");
      session = {
        id: sessionId,
        tenancy_id: tenancyId,
        kind,
        status: "not_started",
        started_on: null,
        completed_on: null,
        suggestions: [],
        areas: STANDARD_AREAS.map((spec) => ({
          id: newId("area"),
          session_id: sessionId,
          name: spec.name,
          room: spec.room,
          required: spec.required,
          photos: [],
        })),
      };
      state.inspections.push(session);
    }
    return delay(session);
  },

  async addInspectionPhoto(areaId: UUID, uri: string, note: string | null) {
    const session = state.inspections.find((i) => i.areas.some((a) => a.id === areaId));
    if (!session) throw new Error("Inspection area not found");
    const area = session.areas.find((a) => a.id === areaId)!;

    area.photos.push({
      id: newId("photo"),
      area_id: areaId,
      uri,
      captured_at: new Date().toISOString(),
      note,
      findings: [],
    });

    if (session.status === "not_started") {
      session.status = "in_progress";
      session.started_on = todayISO();
    }
    refreshInspectionSuggestions(session);
    return delay(session);
  },

  async completeInspection(sessionId: UUID) {
    const session = state.inspections.find((i) => i.id === sessionId);
    if (!session) throw new Error("Inspection not found");
    session.status = "complete";
    session.completed_on = todayISO();
    refreshInspectionSuggestions(session);
    return delay(session);
  },

  async compareInspections(tenancyId: UUID) {
    const moveIn = state.inspections.find(
      (i) => i.tenancy_id === tenancyId && i.kind === "move_in",
    );
    const moveOut = state.inspections.find(
      (i) => i.tenancy_id === tenancyId && i.kind === "move_out",
    );

    const comparisons: AreaComparison[] = STANDARD_AREAS.map((spec) => {
      const inArea = moveIn?.areas.find((a) => a.name === spec.name && a.room === spec.room);
      const outArea = moveOut?.areas.find((a) => a.name === spec.name && a.room === spec.room);
      const before = inArea?.photos[0] ?? null;
      const after = outArea?.photos[0] ?? null;

      // "New damage" means a finding at move-out that was not there at move-in.
      const wasThere = new Set((before?.findings ?? []).map((f) => f.label));
      const changes = (after?.findings ?? [])
        .filter((f) => !wasThere.has(f.label))
        .map((f) => ({ label: f.label, severity: f.severity, confidence: f.confidence }));

      return {
        areaName: spec.name,
        room: spec.room,
        moveInPhoto: before,
        moveOutPhoto: after,
        changes,
      };
    }).filter((c) => c.moveInPhoto || c.moveOutPhoto);

    return delay(comparisons);
  },

  // Maintenance --------------------------------------------------------------

  async listTickets(tenancyId: UUID | null) {
    const list = tenancyId
      ? state.tickets.filter((t) => t.tenancy_id === tenancyId)
      : state.tickets;
    return delay([...list].sort((a, b) => (a.reported_on < b.reported_on ? 1 : -1)));
  },

  async getTicket(ticketId: UUID) {
    const ticket = state.tickets.find((t) => t.id === ticketId);
    if (!ticket) throw new Error("Ticket not found");
    return delay(ticket);
  },

  async createTicket(input) {
    const ticketId = newId("tkt");
    const now = new Date().toISOString();
    // Deliberately NOT an AI suggestion. The real agent runs from the report
    // screen and produces a proper triage; this is only a coarse starting
    // category so a ticket saved without asking the assistant is not blank.
    const guess = coarseCategory(`${input.title} ${input.description}`);

    const ticket: MaintenanceTicket = {
      id: ticketId,
      tenancy_id: input.tenancyId,
      title: input.title,
      description: input.description,
      category: guess.category,
      urgency: guess.urgency,
      status: "reported",
      reported_by: input.by,
      reported_on: todayISO(),
      photoUris: input.photoUris,
      costCents: null,
      suggestion: null,
      events: [
        {
          id: newId("evt"),
          ticket_id: ticketId,
          at: now,
          by: input.by,
          label: "Reported the issue",
          note: null,
          status_after: "reported",
        },
      ],
    };
    state.tickets.push(ticket);
    return delay(ticket);
  },

  async classifyTicket(ticketId: UUID, category: MaintenanceCategory, urgency: MaintenanceUrgency) {
    const ticket = state.tickets.find((t) => t.id === ticketId);
    if (!ticket) throw new Error("Ticket not found");
    ticket.category = category;
    ticket.urgency = urgency;
    if (ticket.suggestion) ticket.suggestion.acceptedAt = new Date().toISOString();
    return delay(ticket);
  },

  async advanceTicket(ticketId: UUID, status: MaintenanceStatus, by: Role, note: string | null) {
    const ticket = state.tickets.find((t) => t.id === ticketId);
    if (!ticket) throw new Error("Ticket not found");
    ticket.status = status;
    ticket.events.push({
      id: newId("evt"),
      ticket_id: ticketId,
      at: new Date().toISOString(),
      by,
      label: STATUS_EVENT_LABEL[status],
      note,
      status_after: status,
    });
    return delay(ticket);
  },

  // Communication ------------------------------------------------------------

  async listThreads(tenancyId: UUID) {
    const list = state.threads.filter((t) => t.tenancy_id === tenancyId);
    return delay([...list].sort((a, b) => (a.lastMessageAt < b.lastMessageAt ? 1 : -1)));
  },

  async getThread(threadId: UUID) {
    const thread = state.threads.find((t) => t.id === threadId);
    if (!thread) throw new Error("Thread not found");
    // Opening it is what marks it read.
    thread.unreadFor = [];
    return delay(thread);
  },

  async sendMessage(threadId: UUID, by: Role, body: string) {
    const thread = state.threads.find((t) => t.id === threadId);
    if (!thread) throw new Error("Thread not found");
    const now = new Date().toISOString();
    thread.messages.push({ id: newId("msg"), thread_id: threadId, by, body, sent_at: now });
    thread.lastMessageAt = now;
    thread.unreadFor = [by === "tenant" ? "landlord" : "tenant"];
    return delay(thread);
  },

  async startThread(input) {
    const threadId = newId("thr");
    const now = new Date().toISOString();
    const thread: Thread = {
      id: threadId,
      tenancy_id: input.tenancyId,
      subject: input.subject,
      about: input.about,
      messages: [
        { id: newId("msg"), thread_id: threadId, by: input.by, body: input.body, sent_at: now },
      ],
      lastMessageAt: now,
      unreadFor: [input.by === "tenant" ? "landlord" : "tenant"],
    };
    state.threads.push(thread);
    return delay(thread);
  },

  // Deposit settlement -------------------------------------------------------

  async getSettlement(tenancyId: UUID) {
    let settlement = state.settlements.find((s) => s.tenancy_id === tenancyId);
    if (!settlement) {
      settlement = {
        id: newId("set"),
        tenancy_id: tenancyId,
        depositCents: 0,
        status: "not_started",
        deductions: [],
        settledOn: null,
      };
      state.settlements.push(settlement);
    }
    return delay(settlement);
  },

  async proposeDeduction(settlementId: UUID, input, by: Role) {
    const settlement = state.settlements.find((s) => s.id === settlementId);
    if (!settlement) throw new Error("Settlement not found");
    settlement.deductions.push({
      id: newId("ded"),
      settlement_id: settlementId,
      label: input.label,
      amountCents: input.amountCents,
      reason: input.reason,
      evidenceAreaNames: input.evidenceAreaNames,
      proposedBy: by,
      agreed: null,
    });
    if (settlement.status === "not_started") settlement.status = "proposed";
    return delay(settlement);
  },

  async respondToDeduction(deductionId: UUID, agreed: boolean) {
    const settlement = state.settlements.find((s) =>
      s.deductions.some((d) => d.id === deductionId),
    );
    if (!settlement) throw new Error("Deduction not found");
    settlement.deductions.find((d) => d.id === deductionId)!.agreed = agreed;

    const answered = settlement.deductions.every((d) => d.agreed !== null);
    const anyRejected = settlement.deductions.some((d) => d.agreed === false);
    settlement.status = !answered ? "disputed" : anyRejected ? "disputed" : "agreed";
    return delay(settlement);
  },

  async settleDeposit(settlementId: UUID) {
    const settlement = state.settlements.find((s) => s.id === settlementId);
    if (!settlement) throw new Error("Settlement not found");
    settlement.status = "settled";
    settlement.settledOn = todayISO();
    return delay(settlement);
  },

  // Reviews ------------------------------------------------------------------

  async listReviews(tenancyId: UUID) {
    return delay(state.reviews.filter((r) => r.tenancy_id === tenancyId));
  },

  async leaveReview(input) {
    const review: Review = {
      id: newId("rev"),
      tenancy_id: input.tenancyId,
      direction: input.direction,
      rating: input.rating,
      body: input.body,
      created_at: new Date().toISOString(),
      verified: true,
    };
    state.reviews.push(review);
    return delay(review);
  },

  // Reminders ----------------------------------------------------------------

  async listReminders(tenancyId: UUID, forRole: Role) {
    return delay(buildReminders(tenancyId, forRole));
  },

  // Renewal ------------------------------------------------------------------

  async getRenewal(tenancyId: UUID) {
    let renewal = state.renewals.find((r) => r.tenancy_id === tenancyId);
    if (!renewal) {
      const agreement = state.agreements.find((a) => a.tenancy_id === tenancyId);
      renewal = {
        tenancy_id: tenancyId,
        intent: "undecided",
        noticeGivenOn: null,
        earliestLeaveDate: null,
        decidedOn: null,
      };
      // Leaving is only possible once the notice period has run from today.
      if (agreement?.noticePeriodDays != null) {
        renewal.earliestLeaveDate = shiftDays(todayISO(), agreement.noticePeriodDays);
      }
      state.renewals.push(renewal);
    }
    return delay(renewal);
  },

  async decideRenewal(tenancyId: UUID, intent: RenewalIntent) {
    const renewal = await this.getRenewal(tenancyId);
    renewal.intent = intent;
    renewal.decidedOn = todayISO();
    renewal.noticeGivenOn = intent === "leaving" ? todayISO() : null;
    return delay(renewal);
  },

  // Connected mode -----------------------------------------------------------

  async getInvitation(tenancyId: UUID) {
    let invitation = state.invitations.find((i) => i.tenancy_id === tenancyId);
    if (!invitation) {
      const tenancy = state.tenancies.find((t) => t.id === tenancyId);
      const landlord = state.landlords.find((l) => l.id === tenancy?.landlord_contact_id);
      invitation = {
        tenancy_id: tenancyId,
        status: "none",
        code: makeInviteCode(),
        sentOn: null,
        acceptedOn: null,
        invitedName: landlord?.full_name ?? "your landlord",
      };
      state.invitations.push(invitation);
    }
    return delay(invitation);
  },

  async sendInvitation(tenancyId: UUID) {
    const invitation = await this.getInvitation(tenancyId);
    invitation.status = "sent";
    invitation.sentOn = todayISO();
    return delay(invitation);
  },

  async acceptInvitation(tenancyId: UUID) {
    const invitation = await this.getInvitation(tenancyId);
    invitation.status = "accepted";
    invitation.acceptedOn = todayISO();

    // This is what connected mode actually means in the data: the contact stops
    // being just a name and starts being a user.
    const tenancy = state.tenancies.find((t) => t.id === tenancyId);
    const landlord = state.landlords.find((l) => l.id === tenancy?.landlord_contact_id);
    if (landlord) landlord.linked_user_id = newId("user");

    return delay(invitation);
  },

  // Receipts -----------------------------------------------------------------

  async getReceipt(paymentId: UUID) {
    return delay(buildReceipt(paymentId));
  },

  async issueReceipt(paymentId: UUID) {
    state.issuedReceipts[paymentId] = todayISO();
    return delay(buildReceipt(paymentId));
  },

  // Discovery / landlord -----------------------------------------------------

  async listListings() {
    return delay(state.listings);
  },

  async getListing(listingId: UUID) {
    const listing = state.listings.find((l) => l.id === listingId);
    if (!listing) throw new Error("Listing not found");
    return delay(listing);
  },

  async enquire(listingId: UUID, message: string) {
    const enquiry = { listingId, sentOn: todayISO(), message };
    state.enquiries.push(enquiry);
    return delay(enquiry);
  },

  async getPortfolio() {
    return delay(state.portfolio);
  },

  async getPortfolioEntry(tenancyId: UUID) {
    const entry = state.portfolio.find((p) => p.tenancyId === tenancyId);
    if (!entry) throw new Error("Property not found");
    return delay(entry);
  },
};

// ---------------------------------------------------------------------------
// Derivations
// ---------------------------------------------------------------------------

function shiftDays(from: string, days: number): string {
  const d = new Date(`${from}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function makeInviteCode(): string {
  // Readable over the phone: no O/0, no I/1.
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from(
    { length: 6 },
    () => alphabet[Math.floor(Math.random() * alphabet.length)],
  ).join("");
}

function buildReceipt(paymentId: UUID) {
  const payment = state.payments.find((p) => p.id === paymentId);
  if (!payment) throw new Error("Payment not found");

  const period = state.periods.find((p) => p.id === payment.rent_period_id);
  const tenancy = state.tenancies.find((t) => t.id === payment.tenancy_id);
  const property = state.properties.find((p) => p.id === tenancy?.property_id);
  const landlord = state.landlords.find((l) => l.id === tenancy?.landlord_contact_id);

  return {
    paymentId,
    // Stable and human-quotable: the payment id is not something to read aloud.
    // Punctuation is stripped first so the suffix cannot come out as "Y-14".
    reference: `RL-${payment.paid_on.replace(/-/g, "")}-${paymentId
      .replace(/[^a-z0-9]/gi, "")
      .slice(-4)
      .toUpperCase()
      .padStart(4, "0")}`,
    issuedOn: state.issuedReceipts[paymentId] ?? null,
    issuedBy: state.issuedReceipts[paymentId] ? (landlord?.full_name ?? null) : null,
    amountCents: payment.amount_cents,
    paidOn: payment.paid_on,
    periodLabel: period ? formatPeriodMonth(period.period_month) : "Unknown month",
    propertyLabel: property?.label ?? "Property",
    tenantName: state.session?.displayName ?? "Tenant",
    landlordName: landlord?.full_name ?? "Landlord",
    method: payment.method,
  };
}

/**
 * Everything the app has a reason to nudge about, computed from current state.
 *
 * Ordered by how much it costs the user to ignore it: money you owe, then
 * deadlines you cannot undo, then records that are merely incomplete.
 */
function buildReminders(tenancyId: UUID, forRole: Role): Reminder[] {
  const today = todayISO();
  const reminders: Reminder[] = [];

  const tenancy = state.tenancies.find((t) => t.id === tenancyId);
  if (!tenancy) return reminders;

  // Rent
  const periods = state.periods.filter((p) => p.tenancy_id === tenancyId);
  for (const period of periods) {
    const summary = summarise(period, state.payments);
    const status = deriveLedgerStatus(summary);

    if (status === "overdue" || status === "partial") {
      reminders.push({
        id: `rent-late-${period.id}`,
        kind: "rent_overdue",
        title:
          status === "overdue"
            ? `${formatPeriodMonth(period.period_month)} rent is unpaid`
            : `${formatPeriodMonth(period.period_month)} is part paid`,
        detail: `${formatLKR(summary.balance_cents)} outstanding. Due ${formatDate(period.due_date)}.`,
        severity: "urgent",
        on: period.due_date,
        daysAway: daysBetween(today, period.due_date),
        route: `/period/${period.id}`,
        forRole: "tenant",
      });
    } else if (status === "due") {
      reminders.push({
        id: `rent-due-${period.id}`,
        kind: "rent_due",
        title: `${formatPeriodMonth(period.period_month)} rent is due soon`,
        detail: `${formatLKR(summary.amount_due_cents)} due ${formatDate(period.due_date)}.`,
        severity: "soon",
        on: period.due_date,
        daysAway: daysBetween(today, period.due_date),
        route: `/period/${period.id}`,
        forRole: "tenant",
      });
    }
  }

  // Agreement deadlines
  const agreement = state.agreements.find((a) => a.tenancy_id === tenancyId);
  if (agreement?.endsOn) {
    const daysToEnd = daysBetween(today, agreement.endsOn);
    if (agreement.noticePeriodDays !== null) {
      const noticeBy = shiftDays(agreement.endsOn, -agreement.noticePeriodDays);
      const daysToNotice = daysBetween(today, noticeBy);
      const renewal = state.renewals.find((r) => r.tenancy_id === tenancyId);
      if (daysToNotice >= 0 && (!renewal || renewal.intent === "undecided")) {
        reminders.push({
          id: "notice-deadline",
          kind: "notice_deadline",
          title: "Decide whether you are staying",
          detail: `If you want to leave when the agreement ends, you must give notice by ${formatDate(noticeBy)}.`,
          severity: daysToNotice < 45 ? "urgent" : "info",
          on: noticeBy,
          daysAway: daysToNotice,
          route: "/renewal",
          forRole: "tenant",
        });
      }
    }
    if (daysToEnd >= 0 && daysToEnd < 120) {
      reminders.push({
        id: "agreement-ending",
        kind: "agreement_ending",
        title: "Agreement ends soon",
        detail: `Your tenancy agreement runs to ${formatDate(agreement.endsOn)}.`,
        severity: daysToEnd < 60 ? "soon" : "info",
        on: agreement.endsOn,
        daysAway: daysToEnd,
        route: "/agreement",
        forRole: "tenant",
      });
    }
  }

  if (agreement && agreement.status === "needs_review") {
    const unconfirmed = agreement.terms.filter((t) => !t.confirmed).length;
    reminders.push({
      id: "agreement-unconfirmed",
      kind: "agreement_unconfirmed",
      title: `${unconfirmed} agreement ${unconfirmed === 1 ? "term needs" : "terms need"} confirming`,
      detail: "Confirmed terms become your reminders. Unconfirmed ones do nothing.",
      severity: "info",
      on: null,
      daysAway: null,
      route: "/agreement",
      forRole: "tenant",
    });
  }

  // Repairs — whoever is holding it up
  for (const ticket of state.tickets.filter((t) => t.tenancy_id === tenancyId)) {
    if (ticket.status === "reported") {
      reminders.push({
        id: `repair-${ticket.id}`,
        kind: "repair_waiting",
        title:
          forRole === "landlord"
            ? `A repair needs your decision`
            : "Your landlord has not responded yet",
        detail: ticket.title,
        severity: ticket.urgency === "emergency" ? "urgent" : "soon",
        on: ticket.reported_on,
        daysAway: daysBetween(today, ticket.reported_on),
        route: `/maintenance/${ticket.id}`,
        forRole: forRole === "landlord" ? "landlord" : "tenant",
      });
    }
  }

  // Evidence gaps
  const moveIn = state.inspections.find((i) => i.tenancy_id === tenancyId && i.kind === "move_in");
  if (moveIn) {
    const missing = moveIn.areas.filter((a) => a.required && a.photos.length === 0).length;
    if (missing > 0) {
      reminders.push({
        id: "move-in-incomplete",
        kind: "inspection_incomplete",
        title: `${missing} move-in ${missing === 1 ? "area was" : "areas were"} never photographed`,
        detail: "Gaps in the move-in record are what deposit arguments are made of.",
        severity: "info",
        on: null,
        daysAway: null,
        route: "/inspection/move_in",
        forRole: "tenant",
      });
    }
  }

  // Deposit
  for (const settlement of state.settlements) {
    const unanswered = settlement.deductions.filter((d) => d.agreed === null).length;
    if (unanswered > 0) {
      reminders.push({
        id: `deposit-${settlement.id}`,
        kind: "deposit_unanswered",
        title: `${unanswered} deposit ${unanswered === 1 ? "deduction needs" : "deductions need"} an answer`,
        detail: "Your deposit is not settled until you respond to each one.",
        severity: "soon",
        on: null,
        daysAway: null,
        route: `/deposit?tenancyId=${settlement.tenancy_id}`,
        forRole: "tenant",
      });
    }
  }

  const weight: Record<Reminder["severity"], number> = { urgent: 0, soon: 1, info: 2 };
  return reminders
    .filter((r) => r.forRole === forRole)
    .sort((a, b) => weight[a.severity] - weight[b.severity]);
}

const STATUS_EVENT_LABEL: Record<MaintenanceStatus, string> = {
  reported: "Reported the issue",
  acknowledged: "Acknowledged",
  approved: "Approved the repair",
  in_progress: "Work started",
  resolved: "Marked resolved",
  declined: "Declined",
};

/**
 * A coarse first guess at a category, used only so a ticket saved without
 * asking the assistant is not completely unlabelled.
 *
 * This is deliberately NOT presented as AI anywhere in the UI. It is keyword
 * matching, it is worse than the agent at everything, and dressing it up as
 * intelligence was the thing that made the earlier version dishonest.
 */
function coarseCategory(text: string): {
  category: MaintenanceCategory;
  urgency: MaintenanceUrgency;
} {
  const t = text.toLowerCase();
  const has = (...words: string[]): boolean => words.some((w) => t.includes(w));

  if (has("leak", "water", "tap", "pipe", "drip", "flood", "drain"))
    return { category: "plumbing", urgency: "normal" };
  if (has("electric", "socket", "wiring", "shock", "power", "switch", "spark"))
    return { category: "electrical", urgency: "high" };
  if (has("damp", "mould", "mold", "crack", "ceiling", "wall", "roof"))
    return { category: "structural", urgency: "normal" };
  if (has("fridge", "oven", "washing", "machine", "heater", "ac"))
    return { category: "appliance", urgency: "normal" };
  if (has("rat", "mice", "cockroach", "termite", "ants", "pest"))
    return { category: "pest", urgency: "high" };

  return { category: "other", urgency: "normal" };
}

/** Missing-area prompts — recomputed whenever an inspection changes. */
function refreshInspectionSuggestions(session: InspectionSession): void {
  const missing = session.areas.filter((a) => a.required && a.photos.length === 0);

  session.suggestions = missing.slice(0, 3).map((area) => ({
    id: newId("ai"),
    kind: "missing_area" as const,
    headline: `${area.room} — ${area.name.toLowerCase()} not photographed`,
    detail: MISSING_AREA_REASON[area.name] ?? "This is a commonly disputed area at move-out.",
    confidence: 0.9,
    acceptedAt: null,
    rejectedAt: null,
  }));
}

const MISSING_AREA_REASON: Record<string, string> = {
  Ceiling: "Ceilings are where damp appears first, and the hardest thing to argue about later.",
  "Electricity meter":
    "A meter reading at move-in settles any argument about unpaid utility bills.",
  "Water meter": "Same as the electricity meter — a photo now is one less dispute at move-out.",
  "Windows and locks": "Latches and handles break during a tenancy and are routinely charged for.",
  "Sink and taps": "Existing chips and stains get blamed on the tenant if they are not recorded.",
  Walls: "Marks and scuffs are the single most common deduction from a deposit.",
  Floor: "Scratches and stains on flooring are frequently disputed.",
  "Toilet and fittings":
    "Cracks in ceramic are expensive and easy to blame on whoever leaves last.",
};

/** Photo placeholder helper, re-exported so screens can seed capture flows. */
export { mockPhoto };

/** Prototype affordance: jump back to the seeded ledger from anywhere. */
export function resetToSeed(): void {
  state = seededState(demoSession);
}

export function todayForDebug(): string {
  return todayISO();
}
