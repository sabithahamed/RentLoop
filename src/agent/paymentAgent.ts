/**
 * Payment intelligence — vision doc capability #3.
 *
 * Reads a photographed bank slip, then works out which month it settles by
 * looking at the actual ledger. This is the one that has to branch: what it
 * checks next depends on what the slip says. An amount that matches the rent
 * exactly is a different investigation from one that does not, and a reference
 * it has seen before is a different investigation again.
 */

import { runAgent } from "./core";
import { toInlineImages } from "./imageInput";
import type { AgentRun, AgentStep } from "./types";
import type { FunctionDeclaration, GeminiPart } from "./geminiClient";
import type { Repository } from "../data/repository";
import type { UUID } from "../data/types";
import { formatLKR, formatPeriodMonth } from "../data/ledger";

export interface SlipReading {
  amountCents: number | null;
  paidOn: string | null;
  reference: string | null;
  bank: string | null;
  /** The period this settles, chosen by looking at the ledger. */
  matchedPeriodId: string | null;
  matchedPeriodLabel: string | null;
  /** unmatched | exact | partial | overpayment | duplicate */
  verdict: string;
  explanation: string;
  confidence: number;
  unreadable: string | null;
}

const TOOLS: FunctionDeclaration[] = [
  {
    name: "list_rent_periods",
    description:
      "List this tenancy's rent months with what is due, what has been paid, and the outstanding balance. Use this to work out which month a payment belongs to.",
    parameters: { type: "OBJECT", properties: {}, required: [] },
  },
  {
    name: "find_payment_by_reference",
    description:
      "Look for a payment already recorded with this bank reference. Use it before concluding, so the same slip is never recorded twice.",
    parameters: {
      type: "OBJECT",
      properties: {
        reference: { type: "STRING", description: "The reference printed on the slip." },
      },
      required: ["reference"],
    },
  },
  {
    name: "submit_reading",
    description: "Submit what you read and which month it settles. Call once.",
    parameters: {
      type: "OBJECT",
      properties: {
        unreadable: {
          type: "STRING",
          description:
            "If the image is not a bank slip or is too unclear to read, say so here. Otherwise empty string.",
        },
        amount: { type: "NUMBER", description: "Amount in rupees as a plain number. 0 if unread." },
        paid_on: {
          type: "STRING",
          description: "Date on the slip as YYYY-MM-DD. Empty if unread.",
        },
        reference: { type: "STRING", description: "Bank reference. Empty if none printed." },
        bank: { type: "STRING", description: "Bank name if visible. Empty otherwise." },
        matched_period_id: {
          type: "STRING",
          description:
            "The id of the rent period this settles, from list_rent_periods. Empty if you cannot tell.",
        },
        verdict: {
          type: "STRING",
          enum: ["exact", "partial", "overpayment", "duplicate", "unmatched"],
          description:
            "exact = clears the outstanding balance. partial = less. overpayment = more. duplicate = this reference is already recorded. unmatched = cannot tell which month.",
        },
        explanation: {
          type: "STRING",
          description: "One or two sentences for the tenant explaining how you decided.",
        },
        confidence: { type: "NUMBER", description: "0 to 1." },
      },
      required: ["verdict", "explanation", "confidence"],
    },
  },
];

const SYSTEM_INSTRUCTION = `You read bank deposit slips and transfer receipts for RentLoop, a rental app used in Sri Lanka, and work out which month's rent they settle.

How to work:
- Read the slip carefully: amount, date, reference number, bank. Sri Lankan slips are often photographed at an angle, creased, or partly handwritten. If a field is genuinely unreadable, leave it empty rather than guessing digits — a wrong amount on a rent record is worse than a missing one.
- Then call list_rent_periods and decide which month this belongs to. Do not assume it is the current month. A payment dated the 18th may well be settling the previous month's arrears, and the outstanding balances tell you which.
- Always call find_payment_by_reference before finishing. Tenants photograph the same slip twice, and recording it twice makes the ledger lie.
- Compare the amount against that month's outstanding balance to decide exact, partial or overpayment.

You propose. The tenant confirms before anything is recorded.

Finish by calling submit_reading.`;

function parse(args: Record<string, unknown>): SlipReading {
  const amount = Number(args.amount);
  const paidOn = String(args.paid_on ?? "").trim();
  const reference = String(args.reference ?? "").trim();
  const bank = String(args.bank ?? "").trim();
  const matched = String(args.matched_period_id ?? "").trim();
  const unreadable = String(args.unreadable ?? "").trim();
  const confidence = Number(args.confidence);

  return {
    amountCents: Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) : null,
    paidOn: /^\d{4}-\d{2}-\d{2}$/.test(paidOn) ? paidOn : null,
    reference: reference || null,
    bank: bank || null,
    matchedPeriodId: matched || null,
    matchedPeriodLabel: null,
    verdict: String(args.verdict ?? "unmatched"),
    explanation: String(args.explanation ?? "").trim(),
    confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0.5,
    unreadable: unreadable && unreadable.toLowerCase() !== "none" ? unreadable : null,
  };
}

export async function runSlipReading(
  slipUri: string,
  ctx: { repo: Repository; tenancyId: UUID },
  onStep?: (step: AgentStep) => void,
): Promise<AgentRun<SlipReading>> {
  const images = await toInlineImages([slipUri], 1);

  if (images.length === 0) {
    return {
      steps: [],
      result: null,
      error: "That photo could not be read. Attach a real photo of the slip.",
      model: "",
      elapsedMs: 0,
    };
  }

  // Labels are resolved after the run so the card can name the month.
  let periodLabels: Record<string, string> = {};

  const run = await runAgent<SlipReading>(
    {
      systemInstruction: SYSTEM_INSTRUCTION,
      tools: TOOLS,
      finishTool: "submit_reading",
      parse,
      toolLabels: {
        list_rent_periods: "Checking which months are outstanding",
        find_payment_by_reference: "Making sure this slip is not already recorded",
      },
      summarise: (toolName, output) => {
        const o = output as { periods?: unknown[]; found?: boolean };
        if (toolName === "list_rent_periods")
          return `Read ${o.periods?.length ?? 0} months of ledger`;
        if (toolName === "find_payment_by_reference")
          return o.found ? "That reference is already recorded" : "Not recorded before";
        return "Done";
      },
      runTool: async (name, args) => {
        if (name === "list_rent_periods") {
          const rows = await ctx.repo.listLedger(ctx.tenancyId);
          periodLabels = Object.fromEntries(
            rows.map((r) => [r.id, formatPeriodMonth(r.period_month)]),
          );
          return {
            periods: rows.map((r) => ({
              id: r.id,
              month: formatPeriodMonth(r.period_month),
              due_date: r.due_date,
              rent_due: formatLKR(r.amount_due_cents),
              already_paid: formatLKR(r.paid_cents),
              outstanding: formatLKR(r.balance_cents),
              status: r.status,
            })),
          };
        }

        if (name === "find_payment_by_reference") {
          const reference = String(args.reference ?? "")
            .replace(/\s+/g, "")
            .toLowerCase();
          if (!reference) return { found: false, note: "No reference given." };

          const rows = await ctx.repo.listLedger(ctx.tenancyId);
          for (const row of rows) {
            const detail = await ctx.repo.getPeriodDetail(row.id);
            const hit = detail.payments.find(
              (p) => (p.reference ?? "").replace(/\s+/g, "").toLowerCase() === reference,
            );
            if (hit) {
              return {
                found: true,
                payment: {
                  amount: formatLKR(hit.amount_cents),
                  paid_on: hit.paid_on,
                  month: formatPeriodMonth(row.period_month),
                },
              };
            }
          }
          return { found: false };
        }

        return { error: `No tool named ${name}` };
      },
      maxTurns: 5,
    },
    [
      {
        text: "Here is a photo of a bank slip the tenant says is a rent payment. Read it, then work out which month it settles.",
      },
      ...images.map((image) => ({ inlineData: image })),
    ] as GeminiPart[],
    onStep,
  );

  if (run.result?.matchedPeriodId) {
    run.result.matchedPeriodLabel = periodLabels[run.result.matchedPeriodId] ?? null;
  }

  return run;
}
