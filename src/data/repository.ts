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
} from "./types";
import type {
  Agreement,
  AreaComparison,
  DepositSettlement,
  Enquiry,
  InspectionKind,
  InspectionSession,
  Invitation,
  LifecycleOverview,
  JoinRequest,
  LandlordTenancyDraft,
  Listing,
  ListingDraft,
  ListingEnquiry,
  ListingFilters,
  TenantInvite,
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
} from "./lifecycleTypes";

export interface Session {
  userId: UUID;
  email: string;
  displayName: string;
}

export interface SignUpInput {
  email: string;
  password: string;
  displayName: string;
  /** Chosen at sign-up. Decides which setup path the account lands in. */
  role: Role;
}

/** What the agreement agent produces. Shaped here so the repository does not import the agent. */
export interface ExtractedAgreementInput {
  terms: { label: string; value: string; confidence: number; sourceQuote: string | null }[];
  flaggedClauses: { text: string; reason: string }[];
  depositCents: number | null;
  noticePeriodDays: number | null;
  endsOn: string | null;
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
  /**
   * Replace an agreement's terms with what the extraction agent read from the
   * document. Nothing arrives confirmed — the tenant still checks each term
   * against their own copy before it drives a reminder.
   */
  applyExtractedAgreement(tenancyId: UUID, extracted: ExtractedAgreementInput): Promise<Agreement>;

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
    about: Thread["about"];
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
    direction: Review["direction"];
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
  acceptInvitation(tenancyId: UUID): Promise<Invitation>;
  /**
   * Join a tenancy from the other side, by code.
   *
   * The person redeeming cannot read the invitation — they have no access to
   * the tenancy yet — so this resolves server-side and creates the membership
   * in one step.
   */
  redeemInvitation(code: string): Promise<{ tenancyId: UUID; propertyLabel: string }>;

  // Receipts
  getReceipt(paymentId: UUID): Promise<Receipt>;
  issueReceipt(paymentId: UUID): Promise<Receipt>;

  // Discovery
  listListings(filters?: ListingFilters): Promise<Listing[]>;
  getListing(listingId: UUID): Promise<Listing>;
  enquire(listingId: UUID, message: string): Promise<Enquiry>;
  /** Cities that actually have listings, for the filter row. */
  listListingCities(): Promise<string[]>;
  toggleSavedListing(listingId: UUID, saved: boolean): Promise<void>;
  /**
   * The number a landlord can call back on. Read and written by the enquiry
   * form: an enquiry from someone unreachable is not an enquiry.
   */
  getContactPhone(): Promise<string | null>;
  setContactPhone(phone: string): Promise<void>;

  // Which kind of account this is
  /** Null for accounts created before roles existed — the app then asks. */
  getAccountRole(): Promise<Role | null>;
  setAccountRole(role: Role): Promise<void>;

  // A landlord putting up their own property
  createLandlordTenancy(draft: LandlordTenancyDraft): Promise<TenancySummary>;

  // Landlord invites a tenant onto a property
  listTenantInvites(tenancyId: UUID): Promise<TenantInvite[]>;
  createTenantInvite(tenancyId: UUID, label: string): Promise<TenantInvite>;
  revokeTenantInvite(inviteId: UUID): Promise<void>;

  // The tenant side of that: ask, then wait to be approved
  requestToJoin(
    code: string,
    message: string,
  ): Promise<{ tenancyId: UUID; propertyLabel: string; landlordName: string }>;
  listMyJoinRequests(): Promise<JoinRequest[]>;

  // The landlord side: the queue, and the decision
  listJoinRequests(): Promise<JoinRequest[]>;
  decideJoinRequest(requestId: UUID, approve: boolean): Promise<void>;

  // Posting a place — the landlord side of discovery
  /** The signed-in landlord's own listings, including ones taken down. */
  listMyListings(): Promise<Listing[]>;
  createListing(draft: ListingDraft): Promise<Listing>;
  updateListing(listingId: UUID, draft: ListingDraft): Promise<Listing>;
  removeListingPhoto(listingId: UUID, photoId: UUID): Promise<Listing>;
  /** Taking a listing down rather than deleting it — enquiries outlive it. */
  setListingActive(listingId: UUID, active: boolean): Promise<Listing>;
  /** Enquiries received on one of the landlord's own listings. */
  listEnquiries(listingId: UUID): Promise<ListingEnquiry[]>;

  // Landlord side
  getPortfolio(): Promise<PortfolioEntry[]>;
  getPortfolioEntry(tenancyId: UUID): Promise<PortfolioEntry>;
}
