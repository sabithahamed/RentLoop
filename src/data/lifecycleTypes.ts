/**
 * The rest of the rental lifecycle — agreements, inspections, maintenance,
 * communication, deposit settlement, reviews, discovery.
 *
 * Deliberately kept out of `types.ts`. That file mirrors SPEC.md, where every
 * column was argued for. Nothing here has been through that yet: these are
 * prototype shapes, chosen to make screens real enough to judge. Expect them
 * to change once a stage is actually specced.
 *
 * Same conventions as types.ts: money in integer cents, `ISODate` for calendar
 * dates, `| null` rather than optional for absent values.
 */

import type { Cents, ISODate, ISODateTime, UUID } from './types';

// ---------------------------------------------------------------------------
// Roles
// ---------------------------------------------------------------------------

/**
 * Which side of the tenancy the current view is showing.
 *
 * In the real app this comes from `tenancy_members.role` (SPEC.md §5.3). In
 * the prototype it is a lens the user flips, so connected mode can be
 * demonstrated without two devices and two accounts.
 */
export type Role = 'tenant' | 'landlord';

// ---------------------------------------------------------------------------
// Mocked AI
// ---------------------------------------------------------------------------

/**
 * Anything the assistant produced rather than a person.
 *
 * Every surface that renders one of these must show it as a suggestion a human
 * confirms — the vision doc's hard rule is that AI never makes a legal or
 * financial decision. `confidence` exists so the UI can be honest when the
 * model is guessing.
 */
export interface AiSuggestion {
  id: UUID;
  kind: 'extraction' | 'missing_area' | 'defect' | 'classification' | 'payment_match';
  headline: string;
  detail: string;
  /** 0–1. Below ~0.7 the UI should visibly hedge. */
  confidence: number;
  /** Null until a human accepts or rejects it. */
  acceptedAt: ISODateTime | null;
  rejectedAt: ISODateTime | null;
}

// ---------------------------------------------------------------------------
// Agreement
// ---------------------------------------------------------------------------

export type AgreementStatus = 'none' | 'processing' | 'needs_review' | 'confirmed';

/** Terms the assistant read out of the document, each awaiting human confirmation. */
export interface ExtractedTerm {
  id: UUID;
  label: string;
  value: string;
  confidence: number;
  confirmed: boolean;
  /** Where in the document it came from — shown so the tenant can check it. */
  sourceQuote: string | null;
}

export interface Agreement {
  id: UUID;
  tenancy_id: UUID;
  file_name: string;
  file_uri: string | null;
  uploaded_at: ISODateTime;
  status: AgreementStatus;
  terms: ExtractedTerm[];
  /** Clauses the assistant could not read confidently, or that look one-sided. */
  flaggedClauses: { id: UUID; text: string; reason: string }[];
  /** Derived from the terms once confirmed. */
  endsOn: ISODate | null;
  noticePeriodDays: number | null;
  depositCents: Cents | null;
}

// ---------------------------------------------------------------------------
// Inspections
// ---------------------------------------------------------------------------

export type InspectionKind = 'move_in' | 'move_out';
export type InspectionStatus = 'not_started' | 'in_progress' | 'complete';

export type DefectSeverity = 'minor' | 'moderate' | 'severe';

export interface InspectionPhoto {
  id: UUID;
  area_id: UUID;
  uri: string;
  captured_at: ISODateTime;
  note: string | null;
  /** What the assistant thinks it sees. Always presented as "check this", never as fact. */
  findings: { id: UUID; label: string; severity: DefectSeverity; confidence: number }[];
}

/** One thing to photograph — "Bathroom ceiling", "Electricity meter". */
export interface InspectionArea {
  id: UUID;
  session_id: UUID;
  name: string;
  room: string;
  /** Checklist areas the assistant insists on before letting the session complete. */
  required: boolean;
  photos: InspectionPhoto[];
}

export interface InspectionSession {
  id: UUID;
  tenancy_id: UUID;
  kind: InspectionKind;
  status: InspectionStatus;
  started_on: ISODate | null;
  completed_on: ISODate | null;
  areas: InspectionArea[];
  /** Missing-area prompts — the assistant's main job here. */
  suggestions: AiSuggestion[];
}

/** One row of the move-in vs move-out comparison. */
export interface AreaComparison {
  areaName: string;
  room: string;
  moveInPhoto: InspectionPhoto | null;
  moveOutPhoto: InspectionPhoto | null;
  /** New damage the assistant believes appeared between the two. */
  changes: { label: string; severity: DefectSeverity; confidence: number }[];
}

// ---------------------------------------------------------------------------
// Maintenance
// ---------------------------------------------------------------------------

export type MaintenanceStatus =
  | 'reported'
  | 'acknowledged'
  | 'approved'
  | 'in_progress'
  | 'resolved'
  | 'declined';

export type MaintenanceUrgency = 'low' | 'normal' | 'high' | 'emergency';

export type MaintenanceCategory =
  | 'plumbing'
  | 'electrical'
  | 'structural'
  | 'appliance'
  | 'pest'
  | 'other';

export interface MaintenanceEvent {
  id: UUID;
  ticket_id: UUID;
  at: ISODateTime;
  by: Role;
  /** Past-tense, human readable: "Approved the repair". */
  label: string;
  note: string | null;
  status_after: MaintenanceStatus | null;
}

export interface MaintenanceTicket {
  id: UUID;
  tenancy_id: UUID;
  title: string;
  description: string;
  category: MaintenanceCategory;
  urgency: MaintenanceUrgency;
  status: MaintenanceStatus;
  reported_by: Role;
  reported_on: ISODate;
  photoUris: string[];
  /** Category and urgency the assistant proposed; the reporter can override. */
  suggestion: AiSuggestion | null;
  events: MaintenanceEvent[];
  /** Costs agreed during the repair — feed deposit settlement if unresolved. */
  costCents: Cents | null;
}

// ---------------------------------------------------------------------------
// Communication
// ---------------------------------------------------------------------------

export type ThreadSubjectType = 'general' | 'payment' | 'maintenance' | 'inspection';

export interface Message {
  id: UUID;
  thread_id: UUID;
  by: Role;
  body: string;
  sent_at: ISODateTime;
}

/**
 * Every thread is anchored to something. The vision doc is explicit that
 * communication should hang off a payment or a maintenance issue rather than
 * floating free — that is what makes it evidence later.
 */
export interface Thread {
  id: UUID;
  tenancy_id: UUID;
  subject: string;
  about: { type: ThreadSubjectType; id: UUID | null };
  messages: Message[];
  lastMessageAt: ISODateTime;
  unreadFor: Role[];
}

// ---------------------------------------------------------------------------
// Deposit settlement
// ---------------------------------------------------------------------------

export type SettlementStatus = 'not_started' | 'proposed' | 'disputed' | 'agreed' | 'settled';

export interface Deduction {
  id: UUID;
  settlement_id: UUID;
  label: string;
  amountCents: Cents;
  /** Why the landlord says this is owed. */
  reason: string;
  /** Inspection areas backing it up — the whole point of the evidence chain. */
  evidenceAreaNames: string[];
  proposedBy: Role;
  agreed: boolean | null;
}

export interface DepositSettlement {
  id: UUID;
  tenancy_id: UUID;
  depositCents: Cents;
  status: SettlementStatus;
  deductions: Deduction[];
  /** Null until both sides agree. */
  settledOn: ISODate | null;
}

// ---------------------------------------------------------------------------
// Reviews
// ---------------------------------------------------------------------------

export type ReviewDirection = 'tenant_to_landlord' | 'landlord_to_tenant';

/** Only writable after a verified, ended tenancy — reputation has to mean something. */
export interface Review {
  id: UUID;
  tenancy_id: UUID;
  direction: ReviewDirection;
  rating: number; // 1–5
  body: string;
  created_at: ISODateTime;
  /** Always true here: a review can only exist off a tenancy RentLoop recorded. */
  verified: boolean;
}

// ---------------------------------------------------------------------------
// Discovery
// ---------------------------------------------------------------------------

/**
 * Deliberately thin. The vision doc is emphatic that RentLoop is not a listing
 * app; discovery exists only as the entry point to a tenancy, and the useful
 * difference is that a listing carries the landlord's RentLoop track record.
 */
export interface Listing {
  id: UUID;
  title: string;
  city: string;
  rentCents: Cents;
  bedrooms: number;
  landlordName: string;
  landlordRating: number | null;
  landlordTenancyCount: number;
  verified: boolean;
}

// ---------------------------------------------------------------------------
// Reminders
// ---------------------------------------------------------------------------

export type ReminderKind =
  | 'rent_due'
  | 'rent_overdue'
  | 'notice_deadline'
  | 'agreement_ending'
  | 'repair_waiting'
  | 'agreement_unconfirmed'
  | 'inspection_incomplete'
  | 'deposit_unanswered';

export type ReminderSeverity = 'info' | 'soon' | 'urgent';

/**
 * Derived, never stored.
 *
 * The vision doc's retention argument rests on RentLoop having a reason to
 * speak to you every month. That reason has to be computed from the tenancy's
 * actual state rather than authored by hand, or it becomes noise the moment
 * something changes.
 */
export interface Reminder {
  id: string;
  kind: ReminderKind;
  title: string;
  detail: string;
  severity: ReminderSeverity;
  /** Null when the reminder is about a state rather than a date. */
  on: ISODate | null;
  daysAway: number | null;
  /** Where tapping it should go. */
  route: string;
  /** Which side needs to act. */
  forRole: Role;
}

// ---------------------------------------------------------------------------
// Renewal
// ---------------------------------------------------------------------------

export type RenewalIntent = 'undecided' | 'renewing' | 'leaving';

export interface Renewal {
  tenancy_id: UUID;
  intent: RenewalIntent;
  /** Set when the tenant chooses to leave — the notice clock starts here. */
  noticeGivenOn: ISODate | null;
  /** Derived from the agreement's notice period. */
  earliestLeaveDate: ISODate | null;
  decidedOn: ISODate | null;
}

// ---------------------------------------------------------------------------
// Connected mode
// ---------------------------------------------------------------------------

export type InvitationStatus = 'none' | 'sent' | 'accepted';

/**
 * The bridge from tenant-only to connected mode.
 *
 * In the real app accepting this would create the `tenancy_members` row from
 * SPEC.md §5.3 and widen RLS. Here it just flips a flag, but the screens around
 * it are the part that needed designing.
 */
export interface Invitation {
  tenancy_id: UUID;
  status: InvitationStatus;
  /** What the other party types in, or receives by link. */
  code: string;
  sentOn: ISODate | null;
  acceptedOn: ISODate | null;
  /** Who was invited. */
  invitedName: string;
}

// ---------------------------------------------------------------------------
// Receipts
// ---------------------------------------------------------------------------

/**
 * A receipt is derived from a payment, not stored separately — it is a view of
 * a record both sides already share. Issuing one is the landlord confirming
 * they received it, which is the bit a bank slip alone cannot prove.
 */
export interface Receipt {
  paymentId: UUID;
  reference: string;
  issuedOn: ISODate | null;
  issuedBy: string | null;
  amountCents: Cents;
  paidOn: ISODate;
  periodLabel: string;
  propertyLabel: string;
  tenantName: string;
  landlordName: string;
  method: string;
}

// ---------------------------------------------------------------------------
// Landlord-side aggregates
// ---------------------------------------------------------------------------

/** An enquiry against a listing — the one action discovery actually needs. */
export interface Enquiry {
  listingId: UUID;
  sentOn: ISODate;
  message: string;
}

/** One row of the landlord's portfolio: a property, its tenant, and how rent is going. */
export interface PortfolioEntry {
  tenancyId: UUID;
  propertyLabel: string;
  city: string | null;
  tenantName: string;
  rentCents: Cents;
  /** Across the whole tenancy, not just this month. */
  arrearsCents: Cents;
  monthsBehind: number;
  openTicketCount: number;
  /** Null when the tenant has not linked their account — tenant-only mode. */
  connected: boolean;
}

/** What the tenant home screen and landlord dashboard both need up front. */
export interface LifecycleOverview {
  agreementStatus: AgreementStatus;
  moveInStatus: InspectionStatus;
  moveOutStatus: InspectionStatus;
  openTickets: number;
  unreadThreads: number;
  /** Renewal / notice deadlines derived from the agreement. */
  upcomingDeadlines: { label: string; on: ISODate; daysAway: number }[];
}
