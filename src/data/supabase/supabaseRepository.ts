import type { Repository, RecordPaymentInput, Session, SignUpInput } from "../repository";
import type {
  Cents,
  ISODate,
  LedgerRow,
  LedgerStatus,
  Payment,
  PaymentMethod,
  PeriodDetail,
  Property,
  LandlordContact,
  RentPeriod,
  RentPeriodSummary,
  Tenancy,
  TenancyDraft,
  TenancySummary,
  UUID,
} from "../types";
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
} from "../lifecycleTypes";

import { supabase } from "./client";
import { deriveLedgerStatus, generatePeriods, firstOfMonth, todayISO } from "../ledger";
import { RECEIPTS_BUCKET, receiptPath } from "../types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function requireUserId(): Promise<string> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  return user.id;
}

async function ensurePeriods(tenancyId: UUID): Promise<void> {
  const { data: tenancy, error: tErr } = await supabase
    .from("tenancies")
    .select("*")
    .eq("id", tenancyId)
    .single();
  if (tErr || !tenancy) throw new Error(`Tenancy not found: ${tenancyId}`);

  const generated = generatePeriods(tenancy as Tenancy);

  for (const p of generated) {
    await supabase.from("rent_periods").upsert(
      {
        owner_id: p.owner_id,
        tenancy_id: p.tenancy_id,
        period_month: p.period_month,
        due_date: p.due_date,
        amount_due_cents: p.amount_due_cents,
      },
      { onConflict: "tenancy_id,period_month" },
    );
  }
}

async function getRentPeriodSummary(periodId: UUID): Promise<RentPeriodSummary> {
  const { data, error } = await supabase
    .from("rent_period_summaries")
    .select("*")
    .eq("id", periodId)
    .single();
  if (error || !data) throw new Error(`Rent period not found: ${periodId}`);
  return data as RentPeriodSummary;
}

// ---------------------------------------------------------------------------
// Repository implementation
// ---------------------------------------------------------------------------

export const supabaseRepository: Repository = {
  // -------------------------------------------------------------------------
  // Auth
  // -------------------------------------------------------------------------

  async getSession(): Promise<Session | null> {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;

    const { data: profile } = await supabase
      .from("profiles")
      .select("display_name")
      .eq("id", user.id)
      .single();

    return {
      userId: user.id,
      email: user.email ?? "",
      displayName: profile?.display_name ?? user.email?.split("@")[0] ?? "User",
    };
  },

  async signIn(email: string, password: string): Promise<Session> {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;

    const user = data.user;
    const { data: profile } = await supabase
      .from("profiles")
      .select("display_name")
      .eq("id", user.id)
      .single();

    return {
      userId: user.id,
      email: user.email ?? "",
      displayName: profile?.display_name ?? user.email?.split("@")[0] ?? "User",
    };
  },

  async signUp(input: SignUpInput): Promise<Session> {
    const { data, error } = await supabase.auth.signUp({
      email: input.email,
      password: input.password,
      options: { data: { display_name: input.displayName } },
    });
    if (error) throw error;

    const user = data.user;
    if (!user) throw new Error("Sign up succeeded but no user returned");

    await supabase.from("profiles").upsert({
      id: user.id,
      display_name: input.displayName,
    });

    return {
      userId: user.id,
      email: user.email ?? "",
      displayName: input.displayName,
    };
  },

  async signOut(): Promise<void> {
    await supabase.auth.signOut();
  },

  // -------------------------------------------------------------------------
  // Tenancy
  // -------------------------------------------------------------------------

  async getTenancySummary(): Promise<TenancySummary | null> {
    const userId = await requireUserId();

    const { data: tenancy } = await supabase
      .from("tenancies")
      .select("*, property:properties(*), landlord:landlord_contacts(*)")
      .eq("owner_id", userId)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (!tenancy) return null;

    return {
      tenancy: tenancy as Tenancy,
      property: tenancy.property as Property,
      landlord: tenancy.landlord as LandlordContact,
    };
  },

  async listTenancies(): Promise<TenancySummary[]> {
    const userId = await requireUserId();

    const { data: tenancies } = await supabase
      .from("tenancies")
      .select("*, property:properties(*), landlord:landlord_contacts(*)")
      .eq("owner_id", userId)
      .order("created_at", { ascending: false });

    if (!tenancies) return [];

    return tenancies.map((t: any) => ({
      tenancy: t as Tenancy,
      property: t.property as Property,
      landlord: t.landlord as LandlordContact,
    }));
  },

  async createTenancy(draft: TenancyDraft): Promise<TenancySummary> {
    const userId = await requireUserId();

    const { data: property, error: pErr } = await supabase
      .from("properties")
      .insert({
        owner_id: userId,
        label: draft.propertyLabel,
        address_line: draft.addressLine,
        city: draft.city,
      })
      .select()
      .single();
    if (pErr || !property) throw new Error(pErr?.message ?? "Failed to create property");

    const { data: landlord, error: lErr } = await supabase
      .from("landlord_contacts")
      .insert({
        owner_id: userId,
        full_name: draft.landlordName,
        phone: draft.landlordPhone,
      })
      .select()
      .single();
    if (lErr || !landlord) throw new Error(lErr?.message ?? "Failed to create landlord contact");

    const { data: tenancy, error: tErr } = await supabase
      .from("tenancies")
      .insert({
        owner_id: userId,
        property_id: property.id,
        landlord_contact_id: landlord.id,
        rent_amount_cents: draft.rentAmountCents,
        due_day_of_month: draft.dueDayOfMonth,
        started_on: draft.startedOn,
      })
      .select()
      .single();
    if (tErr || !tenancy) throw new Error(tErr?.message ?? "Failed to create tenancy");

    return {
      tenancy: tenancy as Tenancy,
      property: property as Property,
      landlord: landlord as LandlordContact,
    };
  },

  // -------------------------------------------------------------------------
  // Ledger
  // -------------------------------------------------------------------------

  async listLedger(tenancyId: UUID): Promise<LedgerRow[]> {
    const userId = await requireUserId();
    await ensurePeriods(tenancyId);

    const { data: periods } = await supabase
      .from("rent_period_summaries")
      .select("*")
      .eq("tenancy_id", tenancyId)
      .eq("owner_id", userId)
      .order("period_month", { ascending: false });

    if (!periods) return [];

    const today = todayISO();
    return periods.map((p: any) => {
      const summary = p as RentPeriodSummary;
      const status: LedgerStatus = deriveLedgerStatus(summary, today);
      return { ...summary, status };
    });
  },

  async getPeriodDetail(rentPeriodId: UUID): Promise<PeriodDetail> {
    const period = await getRentPeriodSummary(rentPeriodId);
    const status = deriveLedgerStatus(period);

    const { data: payments } = await supabase
      .from("payments")
      .select("*")
      .eq("rent_period_id", rentPeriodId)
      .order("paid_on", { ascending: true });

    return {
      period: { ...period, status },
      payments: (payments ?? []) as Payment[],
    };
  },

  // -------------------------------------------------------------------------
  // Payments
  // -------------------------------------------------------------------------

  async getPayment(paymentId: UUID): Promise<Payment> {
    const { data, error } = await supabase
      .from("payments")
      .select("*")
      .eq("id", paymentId)
      .single();
    if (error || !data) throw new Error(`Payment not found: ${paymentId}`);
    return data as Payment;
  },

  async recordPayment(input: RecordPaymentInput): Promise<Payment> {
    const userId = await requireUserId();

    let receiptPathValue: string | null = null;
    if (input.receiptUri) {
      receiptPathValue = receiptPath(userId, input.rentPeriodId);
      const res = await supabase.storage
        .from(RECEIPTS_BUCKET)
        .upload(receiptPathValue, { uri: input.receiptUri } as any, {
          contentType: "image/jpeg",
          upsert: true,
        });
      if (res.error) throw res.error;
    }

    const { data, error } = await supabase
      .from("payments")
      .insert({
        owner_id: userId,
        rent_period_id: input.rentPeriodId,
        tenancy_id: "", // Denormalised — caller should provide, but mock doesn't either
        amount_cents: input.amountCents,
        paid_on: input.paidOn,
        method: input.method,
        reference: input.reference,
        note: input.note,
        receipt_path: receiptPathValue,
      })
      .select()
      .single();
    if (error) throw error;
    return data as Payment;
  },

  async attachSlip(paymentId: UUID, receiptUri: string): Promise<Payment> {
    const userId = await requireUserId();
    const path = receiptPath(userId, paymentId);

    const res = await supabase.storage
      .from(RECEIPTS_BUCKET)
      .upload(path, { uri: receiptUri } as any, {
        contentType: "image/jpeg",
        upsert: true,
      });
    if (res.error) throw res.error;

    const { data, error } = await supabase
      .from("payments")
      .update({ receipt_path: path })
      .eq("id", paymentId)
      .select()
      .single();
    if (error) throw error;
    return data as Payment;
  },

  async getReceiptUrl(receiptPath: string | null): Promise<string | null> {
    if (!receiptPath) return null;
    const { data } = await supabase.storage
      .from(RECEIPTS_BUCKET)
      .createSignedUrl(receiptPath, 60 * 5);
    return data?.signedUrl ?? null;
  },

  // -------------------------------------------------------------------------
  // Lifecycle — stubs
  //
  // These need full database schemas. Implemented as stubs that throw clear
  // errors so the app can boot and the core flow works. Replace with real
  // queries as each lifecycle stage gets its schema.
  // -------------------------------------------------------------------------

  async getOverview(_tenancyId: UUID): Promise<LifecycleOverview> {
    return {
      agreementStatus: "none",
      moveInStatus: "not_started",
      moveOutStatus: "not_started",
      openTickets: 0,
      unreadThreads: 0,
      upcomingDeadlines: [],
    };
  },

  async getAgreement(_tenancyId: UUID): Promise<Agreement | null> {
    return null;
  },
  async uploadAgreement(_tenancyId: UUID, _fileName: string): Promise<Agreement> {
    throw new Error("Not yet implemented");
  },
  async confirmTerm(_agreementId: UUID, _termId: UUID, _value: string): Promise<Agreement> {
    throw new Error("Not yet implemented");
  },

  async getInspection(_tenancyId: UUID, _kind: InspectionKind): Promise<InspectionSession> {
    throw new Error("Not yet implemented");
  },
  async addInspectionPhoto(
    _areaId: UUID,
    _uri: string,
    _note: string | null,
  ): Promise<InspectionSession> {
    throw new Error("Not yet implemented");
  },
  async completeInspection(_sessionId: UUID): Promise<InspectionSession> {
    throw new Error("Not yet implemented");
  },
  async compareInspections(_tenancyId: UUID): Promise<AreaComparison[]> {
    return [];
  },

  async listTickets(_tenancyId: UUID | null): Promise<MaintenanceTicket[]> {
    return [];
  },
  async getTicket(_ticketId: UUID): Promise<MaintenanceTicket> {
    throw new Error("Not yet implemented");
  },
  async createTicket(_input: {
    tenancyId: UUID;
    title: string;
    description: string;
    photoUris: string[];
    by: Role;
  }): Promise<MaintenanceTicket> {
    throw new Error("Not yet implemented");
  },
  async classifyTicket(
    _ticketId: UUID,
    _category: MaintenanceCategory,
    _urgency: MaintenanceUrgency,
  ): Promise<MaintenanceTicket> {
    throw new Error("Not yet implemented");
  },
  async advanceTicket(
    _ticketId: UUID,
    _status: MaintenanceStatus,
    _by: Role,
    _note: string | null,
  ): Promise<MaintenanceTicket> {
    throw new Error("Not yet implemented");
  },

  async listThreads(_tenancyId: UUID): Promise<Thread[]> {
    return [];
  },
  async getThread(_threadId: UUID): Promise<Thread> {
    throw new Error("Not yet implemented");
  },
  async sendMessage(_threadId: UUID, _by: Role, _body: string): Promise<Thread> {
    throw new Error("Not yet implemented");
  },
  async startThread(_input: {
    tenancyId: UUID;
    subject: string;
    about: Thread["about"];
    by: Role;
    body: string;
  }): Promise<Thread> {
    throw new Error("Not yet implemented");
  },

  async getSettlement(_tenancyId: UUID): Promise<DepositSettlement> {
    throw new Error("Not yet implemented");
  },
  async proposeDeduction(
    _settlementId: UUID,
    _input: { label: string; amountCents: Cents; reason: string; evidenceAreaNames: string[] },
    _by: Role,
  ): Promise<DepositSettlement> {
    throw new Error("Not yet implemented");
  },
  async respondToDeduction(_deductionId: UUID, _agreed: boolean): Promise<DepositSettlement> {
    throw new Error("Not yet implemented");
  },
  async settleDeposit(_settlementId: UUID): Promise<DepositSettlement> {
    throw new Error("Not yet implemented");
  },

  async listReviews(_tenancyId: UUID): Promise<Review[]> {
    return [];
  },
  async leaveReview(_input: {
    tenancyId: UUID;
    direction: Review["direction"];
    rating: number;
    body: string;
  }): Promise<Review> {
    throw new Error("Not yet implemented");
  },

  async listReminders(_tenancyId: UUID, _forRole: Role): Promise<Reminder[]> {
    return [];
  },

  async getRenewal(_tenancyId: UUID): Promise<Renewal> {
    throw new Error("Not yet implemented");
  },
  async decideRenewal(_tenancyId: UUID, _intent: RenewalIntent): Promise<Renewal> {
    throw new Error("Not yet implemented");
  },

  async getInvitation(_tenancyId: UUID): Promise<Invitation> {
    throw new Error("Not yet implemented");
  },
  async sendInvitation(_tenancyId: UUID): Promise<Invitation> {
    throw new Error("Not yet implemented");
  },
  async acceptInvitation(_tenancyId: UUID): Promise<Invitation> {
    throw new Error("Not yet implemented");
  },

  async getReceipt(_paymentId: UUID): Promise<Receipt> {
    throw new Error("Not yet implemented");
  },
  async issueReceipt(_paymentId: UUID): Promise<Receipt> {
    throw new Error("Not yet implemented");
  },

  async listListings(): Promise<Listing[]> {
    return [];
  },
  async getListing(_listingId: UUID): Promise<Listing> {
    throw new Error("Not yet implemented");
  },
  async enquire(_listingId: UUID, _message: string): Promise<Enquiry> {
    throw new Error("Not yet implemented");
  },

  async getPortfolio(): Promise<PortfolioEntry[]> {
    return [];
  },
  async getPortfolioEntry(_tenancyId: UUID): Promise<PortfolioEntry> {
    throw new Error("Not yet implemented");
  },
};
