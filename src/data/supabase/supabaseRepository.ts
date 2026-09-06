import type { Repository, RecordPaymentInput, Session, SignUpInput } from "../repository";
import type {
  ISODate,
  LedgerRow,
  LedgerStatus,
  Payment,
  PeriodDetail,
  Property,
  LandlordContact,
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
import {
  daysBetween,
  deriveLedgerStatus,
  formatDate,
  formatLKR,
  formatPeriodMonth,
  generatePeriods,
  todayISO,
} from "../ledger";
import { STANDARD_AREAS } from "../mock/lifecycleSeed";
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

    return (tenancies as unknown as JoinedTenancy[]).map((t) => ({
      tenancy: t as unknown as Tenancy,
      property: t.property,
      landlord: t.landlord,
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
    return (periods as unknown as RentPeriodSummary[]).map((p) => {
      const summary = p;
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
        // React Native has no File/Blob for a local uri; supabase-js accepts
        // this shape at runtime but types the body as Blob.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
      // Same React Native upload shape as recordPayment above.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
  // Lifecycle
  //
  // Backed by supabase/002_lifecycle.sql. Access is not checked here — every
  // table's RLS policy resolves through has_tenancy_access(), so a query for a
  // tenancy you cannot see returns nothing rather than someone else's data.
  // -------------------------------------------------------------------------

  async getOverview(tenancyId: UUID): Promise<LifecycleOverview> {
    const [agreement, sessions, tickets, threads] = await Promise.all([
      supabase
        .from("agreements")
        .select("status, ends_on, notice_period_days")
        .eq("tenancy_id", tenancyId)
        .maybeSingle(),
      supabase.from("inspection_sessions").select("kind, status").eq("tenancy_id", tenancyId),
      supabase
        .from("maintenance_tickets")
        .select("id")
        .eq("tenancy_id", tenancyId)
        .not("status", "in", "(resolved,declined)"),
      supabase.from("threads").select("unread_for").eq("tenancy_id", tenancyId),
    ]);

    const moveIn = (sessions.data ?? []).find((s) => s.kind === "move_in");
    const moveOut = (sessions.data ?? []).find((s) => s.kind === "move_out");

    const deadlines: LifecycleOverview["upcomingDeadlines"] = [];
    const endsOn = agreement.data?.ends_on as ISODate | null | undefined;
    if (endsOn) {
      deadlines.push({
        label: "Agreement ends",
        on: endsOn,
        daysAway: daysBetween(todayISO(), endsOn),
      });
      const notice = agreement.data?.notice_period_days as number | null | undefined;
      if (notice != null) {
        const on = shiftDays(endsOn, -notice);
        deadlines.push({
          label: "Last day to give notice",
          on,
          daysAway: daysBetween(todayISO(), on),
        });
      }
    }
    deadlines.sort((a, b) => a.daysAway - b.daysAway);

    return {
      agreementStatus: (agreement.data?.status as LifecycleOverview["agreementStatus"]) ?? "none",
      moveInStatus: (moveIn?.status as LifecycleOverview["moveInStatus"]) ?? "not_started",
      moveOutStatus: (moveOut?.status as LifecycleOverview["moveOutStatus"]) ?? "not_started",
      openTickets: tickets.data?.length ?? 0,
      unreadThreads: (threads.data ?? []).filter((t) => (t.unread_for ?? []).length > 0).length,
      upcomingDeadlines: deadlines,
    };
  },

  // Agreement ----------------------------------------------------------------

  async getAgreement(tenancyId: UUID): Promise<Agreement | null> {
    const { data } = await supabase
      .from("agreements")
      .select("*, agreement_terms(*), agreement_clauses(*)")
      .eq("tenancy_id", tenancyId)
      .maybeSingle();

    return data ? toAgreement(data) : null;
  },

  async uploadAgreement(tenancyId: UUID, fileName: string): Promise<Agreement> {
    const { data, error } = await supabase
      .from("agreements")
      .upsert(
        { tenancy_id: tenancyId, file_name: fileName, status: "needs_review" },
        {
          onConflict: "tenancy_id",
        },
      )
      .select("*, agreement_terms(*), agreement_clauses(*)")
      .single();

    if (error) throw new Error(error.message);
    return toAgreement(data);
  },

  async confirmTerm(agreementId: UUID, termId: UUID, value: string): Promise<Agreement> {
    const { error } = await supabase
      .from("agreement_terms")
      .update({ value, confirmed: true })
      .eq("id", termId);
    if (error) throw new Error(error.message);

    const { data: remaining } = await supabase
      .from("agreement_terms")
      .select("id")
      .eq("agreement_id", agreementId)
      .eq("confirmed", false);

    await supabase
      .from("agreements")
      .update({ status: (remaining ?? []).length === 0 ? "confirmed" : "needs_review" })
      .eq("id", agreementId);

    const { data } = await supabase
      .from("agreements")
      .select("*, agreement_terms(*), agreement_clauses(*)")
      .eq("id", agreementId)
      .single();

    return toAgreement(data);
  },

  async applyExtractedAgreement(tenancyId, extracted): Promise<Agreement> {
    const { data: agreement, error } = await supabase
      .from("agreements")
      .upsert(
        {
          tenancy_id: tenancyId,
          file_name: "Rental agreement (photo)",
          status: "needs_review",
          ends_on: extracted.endsOn,
          notice_period_days: extracted.noticePeriodDays,
          deposit_cents: extracted.depositCents,
        },
        { onConflict: "tenancy_id" },
      )
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    // Replace wholesale: a re-read of the document supersedes the last one.
    await supabase.from("agreement_terms").delete().eq("agreement_id", agreement.id);
    await supabase.from("agreement_clauses").delete().eq("agreement_id", agreement.id);

    if (extracted.terms.length > 0) {
      // Nothing arrives confirmed. Extraction proposes; the tenant decides.
      await supabase.from("agreement_terms").insert(
        extracted.terms.map((t, i) => ({
          agreement_id: agreement.id,
          label: t.label,
          value: t.value,
          confidence: t.confidence,
          confirmed: false,
          source_quote: t.sourceQuote,
          position: i,
        })),
      );
    }
    if (extracted.flaggedClauses.length > 0) {
      await supabase.from("agreement_clauses").insert(
        extracted.flaggedClauses.map((c) => ({
          agreement_id: agreement.id,
          text: c.text,
          reason: c.reason,
        })),
      );
    }

    const { data } = await supabase
      .from("agreements")
      .select("*, agreement_terms(*), agreement_clauses(*)")
      .eq("id", agreement.id)
      .single();

    return toAgreement(data);
  },

  // Inspections --------------------------------------------------------------

  async getInspection(tenancyId: UUID, kind: InspectionKind): Promise<InspectionSession> {
    const existing = await supabase
      .from("inspection_sessions")
      .select("*, inspection_areas(*, inspection_photos(*))")
      .eq("tenancy_id", tenancyId)
      .eq("kind", kind)
      .maybeSingle();

    if (existing.data) return toInspection(existing.data);

    // Lazily create the session with the standard checklist laid out.
    const { data: session, error } = await supabase
      .from("inspection_sessions")
      .insert({ tenancy_id: tenancyId, kind, status: "not_started" })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    await supabase.from("inspection_areas").insert(
      STANDARD_AREAS.map((a, i) => ({
        session_id: session.id,
        room: a.room,
        name: a.name,
        required: a.required,
        position: i,
      })),
    );

    const { data } = await supabase
      .from("inspection_sessions")
      .select("*, inspection_areas(*, inspection_photos(*))")
      .eq("id", session.id)
      .single();

    return toInspection(data);
  },

  async addInspectionPhoto(
    areaId: UUID,
    uri: string,
    note: string | null,
  ): Promise<InspectionSession> {
    const { data: area, error: areaError } = await supabase
      .from("inspection_areas")
      .select("session_id")
      .eq("id", areaId)
      .single();
    if (areaError) throw new Error(areaError.message);

    const path = await uploadImage(uri, "inspections");

    const { error } = await supabase
      .from("inspection_photos")
      .insert({ area_id: areaId, storage_path: path, note });
    if (error) throw new Error(error.message);

    // First photo moves the session from not_started to in_progress.
    await supabase
      .from("inspection_sessions")
      .update({ status: "in_progress", started_on: todayISO() })
      .eq("id", area.session_id)
      .eq("status", "not_started");

    const { data } = await supabase
      .from("inspection_sessions")
      .select("*, inspection_areas(*, inspection_photos(*))")
      .eq("id", area.session_id)
      .single();

    return toInspection(data);
  },

  async completeInspection(sessionId: UUID): Promise<InspectionSession> {
    const { error } = await supabase
      .from("inspection_sessions")
      .update({ status: "complete", completed_on: todayISO() })
      .eq("id", sessionId);
    if (error) throw new Error(error.message);

    const { data } = await supabase
      .from("inspection_sessions")
      .select("*, inspection_areas(*, inspection_photos(*))")
      .eq("id", sessionId)
      .single();

    return toInspection(data);
  },

  async compareInspections(tenancyId: UUID): Promise<AreaComparison[]> {
    const { data } = await supabase
      .from("inspection_sessions")
      .select("kind, inspection_areas(id, room, name, required, inspection_photos(*))")
      .eq("tenancy_id", tenancyId);

    const sessions = (data ?? []) as unknown as { kind: string; inspection_areas: RawArea[] }[];
    const before = sessions.find((s) => s.kind === "move_in");
    const after = sessions.find((s) => s.kind === "move_out");

    const find = (
      session: (typeof sessions)[number] | undefined,
      room: string,
      name: string,
    ): InspectionSession["areas"][0]["photos"][0] | null => {
      const area = (session?.inspection_areas ?? []).find(
        (a) => a.room === room && a.name === name,
      );
      const photo = area?.inspection_photos?.[0];
      return photo ? toPhoto(photo, area.id ?? "") : null;
    };

    return STANDARD_AREAS.map((spec) => {
      const moveInPhoto = find(before, spec.room, spec.name);
      const moveOutPhoto = find(after, spec.room, spec.name);

      // "New damage" means a finding at move-out that was not there at move-in.
      const wasThere = new Set((moveInPhoto?.findings ?? []).map((f) => f.label));
      const changes = (moveOutPhoto?.findings ?? [])
        .filter((f) => !wasThere.has(f.label))
        .map((f) => ({ label: f.label, severity: f.severity, confidence: f.confidence }));

      return { areaName: spec.name, room: spec.room, moveInPhoto, moveOutPhoto, changes };
    }).filter((c) => c.moveInPhoto || c.moveOutPhoto);
  },

  // Maintenance --------------------------------------------------------------

  async listTickets(tenancyId: UUID | null): Promise<MaintenanceTicket[]> {
    let query = supabase
      .from("maintenance_tickets")
      .select("*, maintenance_events(*)")
      .order("reported_on", { ascending: false });

    if (tenancyId) query = query.eq("tenancy_id", tenancyId);

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return (data ?? []).map(toTicket);
  },

  async getTicket(ticketId: UUID): Promise<MaintenanceTicket> {
    const { data, error } = await supabase
      .from("maintenance_tickets")
      .select("*, maintenance_events(*)")
      .eq("id", ticketId)
      .single();
    if (error) throw new Error(error.message);
    return toTicket(data);
  },

  async createTicket(input): Promise<MaintenanceTicket> {
    const paths = await Promise.all(input.photoUris.map((u) => uploadImage(u, "maintenance")));

    const { data, error } = await supabase
      .from("maintenance_tickets")
      .insert({
        tenancy_id: input.tenancyId,
        title: input.title,
        description: input.description,
        photo_paths: paths,
        reported_by: input.by,
        reported_on: todayISO(),
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    await supabase.from("maintenance_events").insert({
      ticket_id: data.id,
      actor_role: input.by,
      label: "Reported the issue",
      status_after: "reported",
    });

    return this.getTicket(data.id);
  },

  async classifyTicket(
    ticketId: UUID,
    category: MaintenanceCategory,
    urgency: MaintenanceUrgency,
  ): Promise<MaintenanceTicket> {
    const { error } = await supabase
      .from("maintenance_tickets")
      .update({ category, urgency })
      .eq("id", ticketId);
    if (error) throw new Error(error.message);
    return this.getTicket(ticketId);
  },

  async advanceTicket(
    ticketId: UUID,
    status: MaintenanceStatus,
    by: Role,
    note: string | null,
  ): Promise<MaintenanceTicket> {
    const { error } = await supabase
      .from("maintenance_tickets")
      .update({ status })
      .eq("id", ticketId);
    if (error) throw new Error(error.message);

    await supabase.from("maintenance_events").insert({
      ticket_id: ticketId,
      actor_role: by,
      label: STATUS_EVENT_LABEL[status],
      note,
      status_after: status,
    });

    return this.getTicket(ticketId);
  },

  // Communication ------------------------------------------------------------

  async listThreads(tenancyId: UUID): Promise<Thread[]> {
    const { data, error } = await supabase
      .from("threads")
      .select("*, messages(*)")
      .eq("tenancy_id", tenancyId)
      .order("last_message_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map(toThread);
  },

  async getThread(threadId: UUID): Promise<Thread> {
    // Opening it is what marks it read.
    await supabase.from("threads").update({ unread_for: [] }).eq("id", threadId);

    const { data, error } = await supabase
      .from("threads")
      .select("*, messages(*)")
      .eq("id", threadId)
      .single();
    if (error) throw new Error(error.message);
    return toThread(data);
  },

  async sendMessage(threadId: UUID, by: Role, body: string): Promise<Thread> {
    const now = new Date().toISOString();

    const { error } = await supabase
      .from("messages")
      .insert({ thread_id: threadId, actor_role: by, body, sent_at: now });
    if (error) throw new Error(error.message);

    await supabase
      .from("threads")
      .update({ last_message_at: now, unread_for: [by === "tenant" ? "landlord" : "tenant"] })
      .eq("id", threadId);

    return this.getThread(threadId);
  },

  async startThread(input): Promise<Thread> {
    const { data, error } = await supabase
      .from("threads")
      .insert({
        tenancy_id: input.tenancyId,
        subject: input.subject,
        about_type: input.about.type,
        about_id: input.about.id,
        unread_for: [input.by === "tenant" ? "landlord" : "tenant"],
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    await supabase
      .from("messages")
      .insert({ thread_id: data.id, actor_role: input.by, body: input.body });

    const { data: full } = await supabase
      .from("threads")
      .select("*, messages(*)")
      .eq("id", data.id)
      .single();

    return toThread(full);
  },

  // Deposit settlement -------------------------------------------------------

  async getSettlement(tenancyId: UUID): Promise<DepositSettlement> {
    const existing = await supabase
      .from("deposit_settlements")
      .select("*, deductions(*)")
      .eq("tenancy_id", tenancyId)
      .maybeSingle();

    if (existing.data) return toSettlement(existing.data);

    // The deposit comes from the agreement if it has been confirmed there.
    const { data: agreement } = await supabase
      .from("agreements")
      .select("deposit_cents")
      .eq("tenancy_id", tenancyId)
      .maybeSingle();

    const { data, error } = await supabase
      .from("deposit_settlements")
      .insert({ tenancy_id: tenancyId, deposit_cents: agreement?.deposit_cents ?? 0 })
      .select("*, deductions(*)")
      .single();
    if (error) throw new Error(error.message);

    return toSettlement(data);
  },

  async proposeDeduction(settlementId: UUID, input, by: Role): Promise<DepositSettlement> {
    const { error } = await supabase.from("deductions").insert({
      settlement_id: settlementId,
      label: input.label,
      amount_cents: input.amountCents,
      reason: input.reason,
      evidence_area_names: input.evidenceAreaNames,
      proposed_by: by,
    });
    if (error) throw new Error(error.message);

    await supabase
      .from("deposit_settlements")
      .update({ status: "proposed" })
      .eq("id", settlementId)
      .eq("status", "not_started");

    return refreshSettlement(settlementId);
  },

  async respondToDeduction(deductionId: UUID, agreed: boolean): Promise<DepositSettlement> {
    const { data: deduction, error } = await supabase
      .from("deductions")
      .update({ agreed })
      .eq("id", deductionId)
      .select("settlement_id")
      .single();
    if (error) throw new Error(error.message);

    const { data: all } = await supabase
      .from("deductions")
      .select("agreed")
      .eq("settlement_id", deduction.settlement_id);

    const answered = (all ?? []).every((d) => d.agreed !== null);
    const anyRejected = (all ?? []).some((d) => d.agreed === false);

    await supabase
      .from("deposit_settlements")
      .update({ status: !answered || anyRejected ? "disputed" : "agreed" })
      .eq("id", deduction.settlement_id);

    return refreshSettlement(deduction.settlement_id);
  },

  async settleDeposit(settlementId: UUID): Promise<DepositSettlement> {
    const { error } = await supabase
      .from("deposit_settlements")
      .update({ status: "settled", settled_on: todayISO() })
      .eq("id", settlementId);
    if (error) throw new Error(error.message);
    return refreshSettlement(settlementId);
  },

  // Reviews ------------------------------------------------------------------

  async listReviews(tenancyId: UUID): Promise<Review[]> {
    const { data, error } = await supabase
      .from("reviews")
      .select("*")
      .eq("tenancy_id", tenancyId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []).map(toReview);
  },

  async leaveReview(input): Promise<Review> {
    const { data, error } = await supabase
      .from("reviews")
      .upsert(
        {
          tenancy_id: input.tenancyId,
          direction: input.direction,
          rating: input.rating,
          body: input.body,
          verified: true,
        },
        { onConflict: "tenancy_id,direction" },
      )
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return toReview(data);
  },

  // Reminders ----------------------------------------------------------------

  async listReminders(tenancyId: UUID, forRole: Role): Promise<Reminder[]> {
    const today = todayISO();
    const reminders: Reminder[] = [];

    const [ledger, agreement, tickets, moveIn, settlement, renewal] = await Promise.all([
      this.listLedger(tenancyId),
      supabase
        .from("agreements")
        .select("status, ends_on, notice_period_days, agreement_terms(confirmed)")
        .eq("tenancy_id", tenancyId)
        .maybeSingle(),
      supabase
        .from("maintenance_tickets")
        .select("id, title, urgency, reported_on")
        .eq("tenancy_id", tenancyId)
        .eq("status", "reported"),
      supabase
        .from("inspection_sessions")
        .select("inspection_areas(required, inspection_photos(id))")
        .eq("tenancy_id", tenancyId)
        .eq("kind", "move_in")
        .maybeSingle(),
      supabase
        .from("deposit_settlements")
        .select("id, tenancy_id, deductions(agreed)")
        .eq("tenancy_id", tenancyId)
        .maybeSingle(),
      supabase.from("renewals").select("intent").eq("tenancy_id", tenancyId).maybeSingle(),
    ]);

    for (const row of ledger) {
      if (row.status === "overdue" || row.status === "partial") {
        reminders.push({
          id: `rent-late-${row.id}`,
          kind: "rent_overdue",
          title:
            row.status === "overdue"
              ? `${formatPeriodMonth(row.period_month)} rent is unpaid`
              : `${formatPeriodMonth(row.period_month)} is part paid`,
          detail: `${formatLKR(row.balance_cents)} outstanding. Due ${formatDate(row.due_date)}.`,
          severity: "urgent",
          on: row.due_date,
          daysAway: daysBetween(today, row.due_date),
          route: `/period/${row.id}`,
          forRole: "tenant",
        });
      } else if (row.status === "due") {
        reminders.push({
          id: `rent-due-${row.id}`,
          kind: "rent_due",
          title: `${formatPeriodMonth(row.period_month)} rent is due soon`,
          detail: `${formatLKR(row.amount_due_cents)} due ${formatDate(row.due_date)}.`,
          severity: "soon",
          on: row.due_date,
          daysAway: daysBetween(today, row.due_date),
          route: `/period/${row.id}`,
          forRole: "tenant",
        });
      }
    }

    const endsOn = agreement.data?.ends_on as ISODate | null | undefined;
    const noticeDays = agreement.data?.notice_period_days as number | null | undefined;

    if (endsOn && noticeDays != null) {
      const noticeBy = shiftDays(endsOn, -noticeDays);
      const daysToNotice = daysBetween(today, noticeBy);
      if (daysToNotice >= 0 && (renewal.data?.intent ?? "undecided") === "undecided") {
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

    if (endsOn) {
      const daysToEnd = daysBetween(today, endsOn);
      if (daysToEnd >= 0 && daysToEnd < 120) {
        reminders.push({
          id: "agreement-ending",
          kind: "agreement_ending",
          title: "Agreement ends soon",
          detail: `Your tenancy agreement runs to ${formatDate(endsOn)}.`,
          severity: daysToEnd < 60 ? "soon" : "info",
          on: endsOn,
          daysAway: daysToEnd,
          route: "/agreement",
          forRole: "tenant",
        });
      }
    }

    const unconfirmed = (
      (agreement.data?.agreement_terms ?? []) as { confirmed: boolean }[]
    ).filter((t) => !t.confirmed).length;
    if (agreement.data?.status === "needs_review" && unconfirmed > 0) {
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

    for (const ticket of tickets.data ?? []) {
      reminders.push({
        id: `repair-${ticket.id}`,
        kind: "repair_waiting",
        title:
          forRole === "landlord"
            ? "A repair needs your decision"
            : "Your landlord has not responded yet",
        detail: ticket.title,
        severity: ticket.urgency === "emergency" ? "urgent" : "soon",
        on: ticket.reported_on,
        daysAway: daysBetween(today, ticket.reported_on),
        route: `/maintenance/${ticket.id}`,
        forRole,
      });
    }

    const missing = ((moveIn.data?.inspection_areas ?? []) as RawArea[]).filter(
      (a) => a.required && (a.inspection_photos ?? []).length === 0,
    ).length;
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

    const unanswered = ((settlement.data?.deductions ?? []) as { agreed: boolean | null }[]).filter(
      (d) => d.agreed === null,
    ).length;
    if (unanswered > 0) {
      reminders.push({
        id: `deposit-${settlement.data?.id}`,
        kind: "deposit_unanswered",
        title: `${unanswered} deposit ${unanswered === 1 ? "deduction needs" : "deductions need"} an answer`,
        detail: "Your deposit is not settled until you respond to each one.",
        severity: "soon",
        on: null,
        daysAway: null,
        route: `/deposit?tenancyId=${tenancyId}`,
        forRole: "tenant",
      });
    }

    const weight: Record<Reminder["severity"], number> = { urgent: 0, soon: 1, info: 2 };
    return reminders
      .filter((r) => r.forRole === forRole)
      .sort((a, b) => weight[a.severity] - weight[b.severity]);
  },

  // Renewal ------------------------------------------------------------------

  async getRenewal(tenancyId: UUID): Promise<Renewal> {
    const existing = await supabase
      .from("renewals")
      .select("*")
      .eq("tenancy_id", tenancyId)
      .maybeSingle();

    if (existing.data) return toRenewal(existing.data);

    const { data: agreement } = await supabase
      .from("agreements")
      .select("notice_period_days")
      .eq("tenancy_id", tenancyId)
      .maybeSingle();

    const notice = agreement?.notice_period_days as number | null | undefined;

    const { data, error } = await supabase
      .from("renewals")
      .insert({
        tenancy_id: tenancyId,
        earliest_leave_date: notice != null ? shiftDays(todayISO(), notice) : null,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);

    return toRenewal(data);
  },

  async decideRenewal(tenancyId: UUID, intent: RenewalIntent): Promise<Renewal> {
    await this.getRenewal(tenancyId);

    const { data, error } = await supabase
      .from("renewals")
      .update({
        intent,
        decided_on: todayISO(),
        notice_given_on: intent === "leaving" ? todayISO() : null,
      })
      .eq("tenancy_id", tenancyId)
      .select("*")
      .single();
    if (error) throw new Error(error.message);

    return toRenewal(data);
  },

  // Connected mode -----------------------------------------------------------

  async getInvitation(tenancyId: UUID): Promise<Invitation> {
    const existing = await supabase
      .from("invitations")
      .select("*")
      .eq("tenancy_id", tenancyId)
      .maybeSingle();

    if (existing.data) return toInvitation(existing.data);

    const { data: tenancy } = await supabase
      .from("tenancies")
      .select("landlord_contacts(full_name)")
      .eq("id", tenancyId)
      .maybeSingle();

    const name =
      (tenancy?.landlord_contacts as { full_name?: string } | null)?.full_name ?? "your landlord";

    const { data, error } = await supabase
      .from("invitations")
      .insert({ tenancy_id: tenancyId, code: makeInviteCode(), invited_name: name })
      .select("*")
      .single();
    if (error) throw new Error(error.message);

    return toInvitation(data);
  },

  async sendInvitation(tenancyId: UUID): Promise<Invitation> {
    await this.getInvitation(tenancyId);

    const { data, error } = await supabase
      .from("invitations")
      .update({ status: "sent", sent_on: todayISO() })
      .eq("tenancy_id", tenancyId)
      .select("*")
      .single();
    if (error) throw new Error(error.message);

    return toInvitation(data);
  },

  async acceptInvitation(tenancyId: UUID): Promise<Invitation> {
    const userId = await requireUserId();

    // This is what connected mode actually is: a membership row. The RLS
    // policies already read it, so access widens the moment it exists.
    await supabase
      .from("tenancy_members")
      .upsert({ tenancy_id: tenancyId, user_id: userId, role: "landlord" });

    const { data: tenancy } = await supabase
      .from("tenancies")
      .select("landlord_contact_id")
      .eq("id", tenancyId)
      .maybeSingle();

    if (tenancy?.landlord_contact_id) {
      await supabase
        .from("landlord_contacts")
        .update({ linked_user_id: userId })
        .eq("id", tenancy.landlord_contact_id);
    }

    const { data, error } = await supabase
      .from("invitations")
      .update({ status: "accepted", accepted_on: todayISO() })
      .eq("tenancy_id", tenancyId)
      .select("*")
      .single();
    if (error) throw new Error(error.message);

    return toInvitation(data);
  },

  // Receipts -----------------------------------------------------------------

  async getReceipt(paymentId: UUID): Promise<Receipt> {
    return buildReceipt(paymentId, null);
  },

  async issueReceipt(paymentId: UUID): Promise<Receipt> {
    return buildReceipt(paymentId, todayISO());
  },

  // Discovery ----------------------------------------------------------------
  //
  // Not backed by the database. Discovery is the one part of the vision doc
  // RentLoop deliberately does not try to own, so it stays a fixed sample
  // rather than a listings table nobody maintains.

  async listListings(): Promise<Listing[]> {
    return DEMO_LISTINGS;
  },

  async getListing(listingId: UUID): Promise<Listing> {
    const listing = DEMO_LISTINGS.find((l) => l.id === listingId);
    if (!listing) throw new Error("Listing not found");
    return listing;
  },

  async enquire(listingId: UUID, message: string): Promise<Enquiry> {
    return { listingId, sentOn: todayISO(), message };
  },

  // Landlord side ------------------------------------------------------------

  async getPortfolio(): Promise<PortfolioEntry[]> {
    const userId = await requireUserId();

    // Tenancies this user can see as a landlord — i.e. where they hold a
    // membership rather than ownership.
    const { data: memberships } = await supabase
      .from("tenancy_members")
      .select("tenancy_id")
      .eq("user_id", userId)
      .eq("role", "landlord");

    const ids = (memberships ?? []).map((m) => m.tenancy_id);
    if (ids.length === 0) return [];

    const { data } = await supabase
      .from("tenancies")
      .select("id, rent_amount_cents, properties(label, city), profiles:owner_id(display_name)")
      .in("id", ids);

    const entries = await Promise.all(
      ((data ?? []) as unknown as RawPortfolioTenancy[]).map(async (t) => {
        const rows = await this.listLedger(t.id);
        const behind = rows.filter((r) => r.status === "overdue" || r.status === "partial");
        const { data: open } = await supabase
          .from("maintenance_tickets")
          .select("id")
          .eq("tenancy_id", t.id)
          .not("status", "in", "(resolved,declined)");

        return {
          tenancyId: t.id,
          propertyLabel: t.properties?.label ?? "Property",
          city: t.properties?.city ?? null,
          tenantName: t.profiles?.display_name ?? "Tenant",
          rentCents: t.rent_amount_cents,
          arrearsCents: behind.reduce((sum, r) => sum + r.balance_cents, 0),
          monthsBehind: behind.length,
          openTicketCount: open?.length ?? 0,
          connected: true,
        };
      }),
    );

    return entries;
  },

  async getPortfolioEntry(tenancyId: UUID): Promise<PortfolioEntry> {
    const all = await this.getPortfolio();
    const entry = all.find((e) => e.tenancyId === tenancyId);
    if (!entry) throw new Error("Property not found");
    return entry;
  },
};

// ---------------------------------------------------------------------------
// Row shapes and mappers
//
// Supabase returns snake_case rows with nested relations; the app speaks the
// camelCase types in lifecycleTypes.ts. All of that translation happens here,
// so no screen ever sees a database column name.
// ---------------------------------------------------------------------------

/** A tenancy row with its two to-one relations selected alongside it. */
interface JoinedTenancy {
  property: Property;
  landlord: LandlordContact;
}

interface RawPhoto {
  id: string;
  area_id?: string;
  storage_path: string;
  captured_at: string;
  note: string | null;
  findings: InspectionSession["areas"][0]["photos"][0]["findings"];
}

interface RawArea {
  id: string;
  session_id?: string;
  room: string;
  name: string;
  required: boolean;
  position?: number;
  inspection_photos?: RawPhoto[];
}

interface RawPortfolioTenancy {
  id: string;
  rent_amount_cents: number;
  properties: { label: string; city: string | null } | null;
  profiles: { display_name: string } | null;
}

function toPhoto(p: RawPhoto, areaId: string): InspectionSession["areas"][0]["photos"][0] {
  return {
    id: p.id,
    area_id: p.area_id ?? areaId,
    uri: p.storage_path,
    captured_at: p.captured_at,
    note: p.note,
    findings: p.findings ?? [],
  };
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function toAgreement(row: any): Agreement {
  return {
    id: row.id,
    tenancy_id: row.tenancy_id,
    file_name: row.file_name,
    file_uri: row.file_path ?? null,
    uploaded_at: row.uploaded_at,
    status: row.status,
    endsOn: row.ends_on ?? null,
    noticePeriodDays: row.notice_period_days ?? null,
    depositCents: row.deposit_cents ?? null,
    terms: (row.agreement_terms ?? [])
      .slice()
      .sort((a: any, b: any) => (a.position ?? 0) - (b.position ?? 0))
      .map((t: any) => ({
        id: t.id,
        label: t.label,
        value: t.value,
        confidence: t.confidence,
        confirmed: t.confirmed,
        sourceQuote: t.source_quote ?? null,
      })),
    flaggedClauses: (row.agreement_clauses ?? []).map((c: any) => ({
      id: c.id,
      text: c.text,
      reason: c.reason,
    })),
  };
}

function toInspection(row: any): InspectionSession {
  const areas: RawArea[] = (row.inspection_areas ?? [])
    .slice()
    .sort((a: RawArea, b: RawArea) => (a.position ?? 0) - (b.position ?? 0));

  const session: InspectionSession = {
    id: row.id,
    tenancy_id: row.tenancy_id,
    kind: row.kind,
    status: row.status,
    started_on: row.started_on ?? null,
    completed_on: row.completed_on ?? null,
    areas: areas.map((a) => ({
      id: a.id,
      session_id: row.id,
      name: a.name,
      room: a.room,
      required: a.required,
      photos: (a.inspection_photos ?? []).map((p) => toPhoto(p, a.id)),
    })),
    suggestions: [],
  };

  // Missing-area prompts, derived rather than stored — they must change the
  // moment a photo is added.
  session.suggestions = session.areas
    .filter((a) => a.required && a.photos.length === 0)
    .slice(0, 3)
    .map((area) => ({
      id: `missing-${area.id}`,
      kind: "missing_area" as const,
      headline: `${area.room} — ${area.name.toLowerCase()} not photographed`,
      detail: MISSING_AREA_REASON[area.name] ?? "This is a commonly disputed area at move-out.",
      confidence: 0.9,
      acceptedAt: null,
      rejectedAt: null,
    }));

  return session;
}

function toTicket(row: any): MaintenanceTicket {
  return {
    id: row.id,
    tenancy_id: row.tenancy_id,
    title: row.title,
    description: row.description ?? "",
    category: row.category,
    urgency: row.urgency,
    status: row.status,
    reported_by: row.reported_by,
    reported_on: row.reported_on,
    photoUris: row.photo_paths ?? [],
    suggestion: row.suggestion ?? null,
    costCents: row.cost_cents ?? null,
    events: (row.maintenance_events ?? [])
      .slice()
      .sort((a: any, b: any) => (a.at < b.at ? -1 : 1))
      .map((e: any) => ({
        id: e.id,
        ticket_id: row.id,
        at: e.at,
        by: e.actor_role,
        label: e.label,
        note: e.note ?? null,
        status_after: e.status_after ?? null,
      })),
  };
}

function toThread(row: any): Thread {
  const messages = (row.messages ?? [])
    .slice()
    .sort((a: any, b: any) => (a.sent_at < b.sent_at ? -1 : 1))
    .map((m: any) => ({
      id: m.id,
      thread_id: row.id,
      by: m.actor_role,
      body: m.body,
      sent_at: m.sent_at,
    }));

  return {
    id: row.id,
    tenancy_id: row.tenancy_id,
    subject: row.subject,
    about: { type: row.about_type, id: row.about_id ?? null },
    messages,
    lastMessageAt: row.last_message_at,
    unreadFor: row.unread_for ?? [],
  };
}

function toSettlement(row: any): DepositSettlement {
  return {
    id: row.id,
    tenancy_id: row.tenancy_id,
    depositCents: row.deposit_cents ?? 0,
    status: row.status,
    settledOn: row.settled_on ?? null,
    deductions: (row.deductions ?? [])
      .slice()
      .sort((a: any, b: any) => (a.created_at < b.created_at ? -1 : 1))
      .map((d: any) => ({
        id: d.id,
        settlement_id: row.id,
        label: d.label,
        amountCents: d.amount_cents,
        reason: d.reason ?? "",
        evidenceAreaNames: d.evidence_area_names ?? [],
        proposedBy: d.proposed_by,
        agreed: d.agreed,
      })),
  };
}

function toReview(row: any): Review {
  return {
    id: row.id,
    tenancy_id: row.tenancy_id,
    direction: row.direction,
    rating: row.rating,
    body: row.body,
    created_at: row.created_at,
    verified: row.verified,
  };
}

function toRenewal(row: any): Renewal {
  return {
    tenancy_id: row.tenancy_id,
    intent: row.intent,
    noticeGivenOn: row.notice_given_on ?? null,
    earliestLeaveDate: row.earliest_leave_date ?? null,
    decidedOn: row.decided_on ?? null,
  };
}

function toInvitation(row: any): Invitation {
  return {
    tenancy_id: row.tenancy_id,
    status: row.status,
    code: row.code,
    sentOn: row.sent_on ?? null,
    acceptedOn: row.accepted_on ?? null,
    invitedName: row.invited_name ?? "your landlord",
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

async function refreshSettlement(settlementId: UUID): Promise<DepositSettlement> {
  const { data, error } = await supabase
    .from("deposit_settlements")
    .select("*, deductions(*)")
    .eq("id", settlementId)
    .single();
  if (error) throw new Error(error.message);
  return toSettlement(data);
}

async function buildReceipt(paymentId: UUID, issuedOn: ISODate | null): Promise<Receipt> {
  const { data: payment, error } = await supabase
    .from("payments")
    .select(
      "*, rent_periods(period_month), tenancies(landlord_contacts(full_name), properties(label))",
    )
    .eq("id", paymentId)
    .single();
  if (error) throw new Error(error.message);

  const { data: profile } = await supabase.auth.getUser();

  const tenancy = payment.tenancies as {
    landlord_contacts?: { full_name?: string };
    properties?: { label?: string };
  } | null;

  return {
    paymentId,
    // Human-quotable. A uuid is not something to read down a phone line.
    reference: `RL-${payment.paid_on.replace(/-/g, "")}-${paymentId
      .replace(/[^a-z0-9]/gi, "")
      .slice(-4)
      .toUpperCase()}`,
    issuedOn,
    issuedBy: issuedOn ? (tenancy?.landlord_contacts?.full_name ?? null) : null,
    amountCents: payment.amount_cents,
    paidOn: payment.paid_on,
    periodLabel: payment.rent_periods?.period_month
      ? formatPeriodMonth(payment.rent_periods.period_month)
      : "Unknown month",
    propertyLabel: tenancy?.properties?.label ?? "Property",
    tenantName: profile.user?.user_metadata?.display_name ?? "Tenant",
    landlordName: tenancy?.landlord_contacts?.full_name ?? "Landlord",
    method: payment.method,
  };
}

/** Uploads a local image and returns its storage path. */
async function uploadImage(uri: string, folder: string): Promise<string> {
  // Seeded placeholders have no file behind them; store the marker as-is.
  if (uri.startsWith("mock://")) return uri;

  const userId = await requireUserId();
  const path = `${userId}/${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;

  const response = await fetch(uri);
  const blob = await response.blob();

  const { error } = await supabase.storage
    .from(RECEIPTS_BUCKET)
    .upload(path, blob, { contentType: blob.type || "image/jpeg", upsert: false });

  if (error) throw new Error(`Could not upload the photo: ${error.message}`);
  return path;
}

function shiftDays(from: ISODate, days: number): ISODate {
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

const STATUS_EVENT_LABEL: Record<MaintenanceStatus, string> = {
  reported: "Reported the issue",
  acknowledged: "Acknowledged",
  approved: "Approved the repair",
  in_progress: "Work started",
  resolved: "Marked resolved",
  declined: "Declined",
};

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

const DEMO_LISTINGS: Listing[] = [
  {
    id: "lst-1",
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
    id: "lst-2",
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
    id: "lst-3",
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
    id: "lst-4",
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
