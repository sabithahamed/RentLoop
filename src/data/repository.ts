/**
 * The seam between screens and data.
 *
 * The prototype ships one implementation (`mock/mockRepository.ts`) backed by
 * in-memory state. The real app will ship a second one backed by Supabase.
 * Screens depend on this interface and never on either implementation, which
 * is what makes "keep the prototype, swap the data layer" true rather than
 * aspirational.
 *
 * Every method is async even though the mock is synchronous — otherwise every
 * call site gets rewritten the day real latency arrives.
 */

import type {
  Cents,
  ISODate,
  LedgerRow,
  Payment,
  PaymentMethod,
  PeriodDetail,
  TenancyDraft,
  TenancySummary,
  UUID,
} from './types';
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
  Receipt,
  Reminder,
  Renewal,
  RenewalIntent,
  Review,
  Role,
  Thread,
} from './lifecycleTypes';

export interface Session {
  userId: UUID;
  email: string;
  displayName: string;
}

export interface SignUpInput {
  email: string;
  password: string;
  displayName: string;
}

export interface RecordPaymentInput {
  rentPeriodId: UUID;
  amountCents: Cents;
  paidOn: ISODate;
  method: PaymentMethod;
  reference: string | null;
  note: string | null;
  /**
   * A local file URI from the image picker, or null.
   *
   * The mock stores it as-is. The Supabase implementation uploads it to the
   * private `receipts` bucket and stores the resulting object path instead —
   * which is why screens must resolve anything they intend to display through
   * `getReceiptUrl` rather than using `payment.receipt_path` directly.
   */
  receiptUri: string | null;
}

export interface Repository {
  // Auth
  getSession(): Promise<Session | null>;
  signIn(email: string, password: string): Promise<Session>;
  signUp(input: SignUpInput): Promise<Session>;
  signOut(): Promise<void>;

  // Tenancy
  /** The active one. Null before onboarding, or once every tenancy has ended. */
  getTenancySummary(): Promise<TenancySummary | null>;
  /** Every tenancy, active and ended — ended ones still hold deposits and evidence. */
  listTenancies(): Promise<TenancySummary[]>;
  createTenancy(draft: TenancyDraft): Promise<TenancySummary>;

  // Ledger
  /** Ensures periods exist through the rolling window, then returns them newest first. */
  listLedger(tenancyId: UUID): Promise<LedgerRow[]>;
  getPeriodDetail(rentPeriodId: UUID): Promise<PeriodDetail>;

  // Payments
  getPayment(paymentId: UUID): Promise<Payment>;
  recordPayment(input: RecordPaymentInput): Promise<Payment>;
  attachSlip(paymentId: UUID, receiptUri: string): Promise<Payment>;

  /** Resolve a stored receipt path into something an `<Image>` can render. */
  getReceiptUrl(receiptPath: string | null): Promise<string | null>;

  // -------------------------------------------------------------------------
  // Lifecycle
  //
  // Everything below is prototype-stage — the shapes come from
  // ./lifecycleTypes.ts and have not been through a spec the way payments has.
  // -------------------------------------------------------------------------

  getOverview(tenancyId: UUID): Promise<LifecycleOverview>;

  // Agreement
  getAgreement(tenancyId: UUID): Promise<Agreement | null>;
  uploadAgreement(tenancyId: UUID, fileName: string): Promise<Agreement>;
  confirmTerm(agreementId: UUID, termId: UUID, value: string): Promise<Agreement>;

  // Inspections
  getInspection(tenancyId: UUID, kind: InspectionKind): Promise<InspectionSession>;
  addInspectionPhoto(areaId: UUID, uri: string, note: string | null): Promise<InspectionSession>;
  completeInspection(sessionId: UUID): Promise<InspectionSession>;
  /** Move-in vs move-out, area by area — the deposit-dispute evidence. */
  compareInspections(tenancyId: UUID): Promise<AreaComparison[]>;

  // Maintenance
  listTickets(tenancyId: UUID | null): Promise<MaintenanceTicket[]>;
  getTicket(ticketId: UUID): Promise<MaintenanceTicket>;
  createTicket(input: {
    tenancyId: UUID;
    title: string;
    description: string;
    photoUris: string[];
    by: Role;
  }): Promise<MaintenanceTicket>;
  /** Applies the assistant's proposed category/urgency, or the human's override. */
  classifyTicket(
    ticketId: UUID,
    category: MaintenanceCategory,
    urgency: MaintenanceUrgency,
  ): Promise<MaintenanceTicket>;
  advanceTicket(
    ticketId: UUID,
    status: MaintenanceStatus,
    by: Role,
    note: string | null,
  ): Promise<MaintenanceTicket>;

  // Communication
  listThreads(tenancyId: UUID): Promise<Thread[]>;
  getThread(threadId: UUID): Promise<Thread>;
  sendMessage(threadId: UUID, by: Role, body: string): Promise<Thread>;
  startThread(input: {
    tenancyId: UUID;
    subject: string;
    about: Thread['about'];
    by: Role;
    body: string;
  }): Promise<Thread>;

  // Deposit settlement
  getSettlement(tenancyId: UUID): Promise<DepositSettlement>;
  proposeDeduction(
    settlementId: UUID,
    input: { label: string; amountCents: Cents; reason: string; evidenceAreaNames: string[] },
    by: Role,
  ): Promise<DepositSettlement>;
  respondToDeduction(deductionId: UUID, agreed: boolean): Promise<DepositSettlement>;
  settleDeposit(settlementId: UUID): Promise<DepositSettlement>;

  // Reviews
  listReviews(tenancyId: UUID): Promise<Review[]>;
  leaveReview(input: {
    tenancyId: UUID;
    direction: Review['direction'];
    rating: number;
    body: string;
  }): Promise<Review>;

  // Reminders — derived from everything above
  listReminders(tenancyId: UUID, forRole: Role): Promise<Reminder[]>;

  // Renewal
  getRenewal(tenancyId: UUID): Promise<Renewal>;
  decideRenewal(tenancyId: UUID, intent: RenewalIntent): Promise<Renewal>;

  // Connected mode
  getInvitation(tenancyId: UUID): Promise<Invitation>;
  sendInvitation(tenancyId: UUID): Promise<Invitation>;
  /** Prototype shortcut: pretend the other side accepted, so connected mode is demoable. */
  acceptInvitation(tenancyId: UUID): Promise<Invitation>;

  // Receipts
  getReceipt(paymentId: UUID): Promise<Receipt>;
  issueReceipt(paymentId: UUID): Promise<Receipt>;

  // Discovery
  listListings(): Promise<Listing[]>;
  getListing(listingId: UUID): Promise<Listing>;
  enquire(listingId: UUID, message: string): Promise<Enquiry>;

  // Landlord side
  getPortfolio(): Promise<PortfolioEntry[]>;
  getPortfolioEntry(tenancyId: UUID): Promise<PortfolioEntry>;
}
