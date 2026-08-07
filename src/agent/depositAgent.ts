/**
 * Deposit dispute analysis — the agent that has to actually reason.
 *
 * This is the moment RentLoop exists for. At move-out a landlord proposes
 * deductions and the tenant has hours to argue. Getting it right needs four
 * separate lookups chained, where each answer changes the next question:
 *
 *   the move-in/move-out comparison  → what changed
 *   the agreement                    → who is liable for that kind of thing
 *   the maintenance history          → was it reported and ignored?
 *   the move-in photos               → is there even evidence to argue from?
 *
 * The third is the one nothing else in the app can do. A deduction for a damp
 * ceiling means something completely different if the tenant reported the leak
 * four months ago and the landlord did nothing — and only the agent will go
 * and check.
 *
 * It produces a position per deduction, with the evidence behind it. It does
 * not decide anything; the tenant sends it, or does not.
 */

import { runAgent } from "./core";
import type { AgentRun, AgentStep } from "./types";
import type { FunctionDeclaration } from "./geminiClient";
import type { Repository } from "../data/repository";
import type { UUID } from "../data/types";
import { formatLKR } from "../data/ledger";

export interface DeductionPosition {
  label: string;
  amountCents: number;
  /** accept | reduce | reject | needs_evidence */
  position: string;
  reasoning: string;
  evidence: string[];
  suggestedCounterCents: number | null;
}

export interface DepositAnalysis {
  positions: DeductionPosition[];
  summary: string;
  totalProposedCents: number;
  totalDisputedCents: number;
  draftMessage: string;
  confidence: number;
}

const TOOLS: FunctionDeclaration[] = [
  {
    name: "get_proposed_deductions",
    description:
      "The deductions the landlord has proposed against the deposit, with their stated reasons.",
    parameters: { type: "OBJECT", properties: {}, required: [] },
  },
  {
    name: "compare_inspections",
    description:
      "Compare the move-in and move-out inspections area by area, including what changed and whether each area was photographed at either end.",
    parameters: { type: "OBJECT", properties: {}, required: [] },
  },
  {
    name: "get_agreement_terms",
    description:
      "Read the tenancy agreement, including who is liable for repairs and how the deposit is defined.",
    parameters: { type: "OBJECT", properties: {}, required: [] },
  },
  {
    name: "get_maintenance_history",
    description:
      "Every maintenance issue reported during the tenancy, with status and full timeline. Use this to find out whether damage was reported and left unrepaired — that changes who is responsible for the consequences.",
    parameters: { type: "OBJECT", properties: {}, required: [] },
  },
  {
    name: "submit_analysis",
    description:
      "Submit your position on each deduction. Call once when you have checked everything.",
    parameters: {
      type: "OBJECT",
      properties: {
        positions: {
          type: "STRING",
          description:
            'One deduction per line as "label :: position :: amount you would accept in rupees :: reasoning :: evidence separated by semicolons". Position must be one of accept, reduce, reject, needs_evidence.',
        },
        summary: {
          type: "STRING",
          description: "Two or three sentences for the tenant summarising where they stand.",
        },
        draft_message: {
          type: "STRING",
          description:
            "A polite, factual message the tenant could send the landlord setting out their position. Reference specific evidence. Do not threaten legal action.",
        },
        confidence: { type: "NUMBER", description: "0 to 1." },
      },
      required: ["positions", "summary", "draft_message", "confidence"],
    },
  },
];

const SYSTEM_INSTRUCTION = `You help a tenant in Sri Lanka respond to deposit deductions their landlord has proposed at the end of a tenancy.

Gather everything you need in as few rounds as possible: the first four tools do not depend on each other, so call all four together in your first turn rather than one at a time. Then reason over the combined results.

What each one gives you:

1. get_proposed_deductions — what is being claimed and why.
2. compare_inspections — what actually changed between move-in and move-out.
3. get_agreement_terms — who the agreement makes liable for that kind of thing.
4. get_maintenance_history — and this is the one people forget: was the damage reported during the tenancy and left unrepaired? If the tenant reported a leak months ago and the landlord did nothing, the resulting damage is not the tenant's to pay for.

Do not call the same tool twice — nothing changes between calls.

Rules for judging:
- Fair wear and tear is not damage. Faded paint, minor scuffs and worn flooring come with living somewhere.
- If an area has no move-in photograph, there is no baseline, and the tenant cannot be shown to have caused it. Say that plainly.
- A deduction with no supporting inspection evidence is unsupported, however reasonable it sounds.
- If a deduction is fair, say so. A tenant who disputes everything loses credibility on the items that matter, and you are trying to get them a fair outcome, not a fight.

Tone: the draft message must be calm and factual. It is more likely to work than an angry one, and it may end up being read by someone else later.

You set out a position based on evidence. You never state what the law entitles anyone to.

Finish by calling submit_analysis.`;

function parse(args: Record<string, unknown>): DepositAnalysis {
  const positions = String(args.positions ?? "")
    .split("\n")
    .map((line) => line.split("::").map((s) => s.trim()))
    .filter((cells) => cells.length >= 2 && cells[0].length > 0)
    .map((cells) => {
      const counter = Number(String(cells[2] ?? "").replace(/[^0-9.]/g, ""));
      return {
        label: cells[0],
        amountCents: 0,
        position: (cells[1] || "needs_evidence").toLowerCase().replace(/\s+/g, "_"),
        reasoning: cells[3] ?? "",
        evidence: (cells[4] ?? "")
          .split(";")
          .map((s) => s.trim())
          .filter(Boolean),
        suggestedCounterCents:
          Number.isFinite(counter) && counter > 0 ? Math.round(counter * 100) : null,
      };
    });

  const confidence = Number(args.confidence);

  return {
    positions,
    summary: String(args.summary ?? "").trim(),
    totalProposedCents: 0,
    totalDisputedCents: 0,
    draftMessage: String(args.draft_message ?? "").trim(),
    confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0.5,
  };
}

export async function runDepositAnalysis(
  ctx: { repo: Repository; tenancyId: UUID },
  onStep?: (step: AgentStep) => void,
): Promise<AgentRun<DepositAnalysis>> {
  let proposedTotal = 0;
  const amountByLabel: Record<string, number> = {};

  const run = await runAgent<DepositAnalysis>(
    {
      systemInstruction: SYSTEM_INSTRUCTION,
      tools: TOOLS,
      finishTool: "submit_analysis",
      parse,
      toolLabels: {
        get_proposed_deductions: "Reading what the landlord is claiming",
        compare_inspections: "Comparing move-in against move-out",
        get_agreement_terms: "Checking what the agreement says",
        get_maintenance_history: "Looking for issues you reported and they ignored",
      },
      summarise: (toolName, output) => {
        const o = output as {
          deductions?: unknown[];
          areas?: { changes?: unknown[] }[];
          has_agreement?: boolean;
          tickets?: { status?: string }[];
        };
        switch (toolName) {
          case "get_proposed_deductions":
            return `${o.deductions?.length ?? 0} deductions claimed`;
          case "compare_inspections": {
            const changed = (o.areas ?? []).filter((a) => (a.changes?.length ?? 0) > 0).length;
            return changed === 0
              ? "No differences found between move-in and move-out"
              : `${changed} area${changed === 1 ? "" : "s"} changed during the tenancy`;
          }
          case "get_agreement_terms":
            return o.has_agreement ? "Read the agreement" : "No agreement on file";
          case "get_maintenance_history": {
            const total = o.tickets?.length ?? 0;
            const unresolved = (o.tickets ?? []).filter((t) => t.status !== "resolved").length;
            return unresolved > 0
              ? `${total} issues reported, ${unresolved} never resolved`
              : `${total} issues reported, all resolved`;
          }
          default:
            return "Done";
        }
      },
      runTool: async (name) => {
        switch (name) {
          case "get_proposed_deductions": {
            const settlement = await ctx.repo.getSettlement(ctx.tenancyId);
            proposedTotal = settlement.deductions.reduce((sum, d) => sum + d.amountCents, 0);
            for (const d of settlement.deductions)
              amountByLabel[d.label.toLowerCase()] = d.amountCents;
            return {
              deposit_held: formatLKR(settlement.depositCents),
              status: settlement.status,
              deductions: settlement.deductions.map((d) => ({
                label: d.label,
                amount: formatLKR(d.amountCents),
                landlords_reason: d.reason,
                evidence_areas_cited: d.evidenceAreaNames,
                tenant_response:
                  d.agreed === null ? "not answered" : d.agreed ? "agreed" : "disputed",
              })),
            };
          }

          case "compare_inspections": {
            const comparisons = await ctx.repo.compareInspections(ctx.tenancyId);
            return {
              areas: comparisons.map((c) => ({
                area: `${c.room} / ${c.areaName}`,
                photographed_at_move_in: c.moveInPhoto !== null,
                photographed_at_move_out: c.moveOutPhoto !== null,
                move_in_note: c.moveInPhoto?.note ?? null,
                move_out_note: c.moveOutPhoto?.note ?? null,
                changes: c.changes,
              })),
            };
          }

          case "get_agreement_terms": {
            const agreement = await ctx.repo.getAgreement(ctx.tenancyId);
            if (!agreement) return { has_agreement: false };
            return {
              has_agreement: true,
              terms: agreement.terms.map((t) => ({
                label: t.label,
                value: t.value,
                confirmed_by_tenant: t.confirmed,
              })),
              flagged_clauses: agreement.flaggedClauses.map((c) => ({
                text: c.text,
                why_flagged: c.reason,
              })),
            };
          }

          case "get_maintenance_history": {
            const tickets = await ctx.repo.listTickets(ctx.tenancyId);
            return {
              tickets: tickets.map((t) => ({
                title: t.title,
                description: t.description,
                category: t.category,
                urgency: t.urgency,
                status: t.status,
                reported_on: t.reported_on,
                timeline: t.events.map((e) => `${e.at.slice(0, 10)} ${e.by}: ${e.label}`),
              })),
            };
          }

          default:
            return { error: `No tool named ${name}` };
        }
      },
      maxTurns: 8,
    },
    [
      {
        text: "The landlord has proposed deductions from this tenant's deposit. Work out where they stand on each one, then draft a message they could send.",
      },
    ],
    onStep,
  );

  if (run.result) {
    run.result.totalProposedCents = proposedTotal;
    // Attach real amounts to positions by matching the label the model echoed.
    for (const p of run.result.positions) {
      const key = Object.keys(amountByLabel).find(
        (k) =>
          k === p.label.toLowerCase() ||
          k.includes(p.label.toLowerCase()) ||
          p.label.toLowerCase().includes(k),
      );
      p.amountCents = key ? amountByLabel[key] : 0;
    }
    run.result.totalDisputedCents = run.result.positions
      .filter(
        (p) =>
          p.position === "reject" || p.position === "reduce" || p.position === "needs_evidence",
      )
      .reduce((sum, p) => sum + (p.amountCents - (p.suggestedCounterCents ?? 0)), 0);
  }

  return run;
}
