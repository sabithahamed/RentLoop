/**
 * Agreement intelligence — vision doc capability #2.
 *
 * Reads a photograph of the actual rental agreement and pulls out the terms
 * that become reminders. Every extracted term carries the quote it came from,
 * so the tenant can check the model against their own document rather than
 * trusting it.
 *
 * Nothing here is confirmed automatically. Extraction is a proposal; the
 * tenant confirms each term, and only confirmed terms drive deadlines.
 */

import { runAgent } from "./core";
import { toInlineImages } from "./imageInput";
import type { AgentRun, AgentStep } from "./types";
import type { FunctionDeclaration, GeminiPart } from "./geminiClient";

export interface ExtractedAgreement {
  terms: {
    label: string;
    value: string;
    confidence: number;
    sourceQuote: string | null;
  }[];
  flaggedClauses: { text: string; reason: string }[];
  /** Machine-usable versions of the terms that drive reminders. */
  rentCents: number | null;
  depositCents: number | null;
  dueDayOfMonth: number | null;
  noticePeriodDays: number | null;
  endsOn: string | null;
  /** Set when the photo is not a rental agreement at all. */
  notAnAgreement: string | null;
}

const TOOLS: FunctionDeclaration[] = [
  {
    name: "submit_agreement",
    description:
      "Submit everything you read from the agreement. Call once, after you have read the whole document.",
    parameters: {
      type: "OBJECT",
      properties: {
        not_an_agreement: {
          type: "STRING",
          description:
            "If the image is not a rental agreement, explain what it appears to be instead. Otherwise empty string.",
        },
        terms: {
          type: "STRING",
          description:
            'One term per line, as "Label :: Value :: confidence 0-1 :: exact quote from the document". Include at least: monthly rent, deposit, rent due date, notice period, agreement end date, who pays for repairs. If a term is genuinely absent from the document, give it confidence 0 and value "Not stated".',
        },
        flagged_clauses: {
          type: "STRING",
          description:
            'Clauses that are one-sided, vague, or would surprise a tenant. One per line as "quote :: why it matters". Empty string if none.',
        },
        rent_amount: {
          type: "NUMBER",
          description: "Monthly rent as a plain number in rupees, e.g. 45000. Zero if not stated.",
        },
        deposit_amount: {
          type: "NUMBER",
          description: "Deposit as a plain number in rupees. Zero if not stated.",
        },
        due_day: {
          type: "NUMBER",
          description: "Day of the month rent is due, 1-31. Zero if not stated.",
        },
        notice_days: {
          type: "NUMBER",
          description: "Notice period in days. Zero if not stated.",
        },
        ends_on: {
          type: "STRING",
          description: "Agreement end date as YYYY-MM-DD. Empty string if not stated.",
        },
      },
      required: ["terms", "rent_amount", "deposit_amount", "due_day", "notice_days"],
    },
  },
];

const SYSTEM_INSTRUCTION = `You read residential rental agreements from Sri Lanka and extract the terms a tenant needs to remember.

How to work:
- Read what is actually in the document. Never infer a term that is not written down — if the agreement does not state a notice period, say so rather than assuming a typical one. A confidently invented deadline is worse than no deadline.
- Quote the exact wording each term came from. The tenant will check your quote against their own document.
- Be honest about confidence. Handwritten amendments, poor photos and vague phrasing all lower it.
- Flag clauses that are one-sided or undefined. "Returned subject to satisfactory condition" defines nothing and decides deposits — say so.
- Sri Lankan agreements often mix Rupees written in words and figures. Prefer figures, and lower confidence if they disagree.

You extract and explain. You never advise on whether the agreement is legally enforceable.

Finish by calling submit_agreement.`;

function parseLines(raw: string, parts: number): string[][] {
  return String(raw ?? "")
    .split("\n")
    .map((line) => line.split("::").map((s) => s.trim()))
    .filter((cells) => cells.length >= parts && cells[0].length > 0);
}

function parse(args: Record<string, unknown>): ExtractedAgreement {
  const notAgreement = String(args.not_an_agreement ?? "").trim();

  const terms = parseLines(String(args.terms ?? ""), 2).map((cells) => {
    const confidence = Number(String(cells[2] ?? "").replace(/[^0-9.]/g, ""));
    return {
      label: cells[0],
      value: cells[1] || "Not stated",
      confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0.5,
      sourceQuote: cells[3] || null,
    };
  });

  const flaggedClauses = parseLines(String(args.flagged_clauses ?? ""), 2).map((cells) => ({
    text: cells[0],
    reason: cells[1],
  }));

  const num = (v: unknown): number => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : 0;
  };

  const rent = num(args.rent_amount);
  const deposit = num(args.deposit_amount);
  const dueDay = num(args.due_day);
  const noticeDays = num(args.notice_days);
  const endsOn = String(args.ends_on ?? "").trim();

  return {
    terms,
    flaggedClauses,
    rentCents: rent > 0 ? Math.round(rent * 100) : null,
    depositCents: deposit > 0 ? Math.round(deposit * 100) : null,
    dueDayOfMonth: dueDay >= 1 && dueDay <= 31 ? dueDay : null,
    noticePeriodDays: noticeDays > 0 ? noticeDays : null,
    endsOn: /^\d{4}-\d{2}-\d{2}$/.test(endsOn) ? endsOn : null,
    notAnAgreement: notAgreement && notAgreement.toLowerCase() !== "none" ? notAgreement : null,
  };
}

export async function runAgreementExtraction(
  photoUris: string[],
  onStep?: (step: AgentStep) => void,
): Promise<AgentRun<ExtractedAgreement>> {
  const images = await toInlineImages(photoUris, 4);

  if (images.length === 0) {
    return {
      steps: [],
      result: null,
      error: "No readable photo of the agreement. Take a clear photo of each page and try again.",
      model: "",
      elapsedMs: 0,
    };
  }

  const parts: GeminiPart[] = [
    {
      text: `Here ${images.length === 1 ? "is a photo" : `are ${images.length} photos`} of a tenant's rental agreement. Read ${images.length === 1 ? "it" : "them"} and extract the terms.`,
    },
    ...images.map((image) => ({ inlineData: image })),
  ];

  return runAgent<ExtractedAgreement>(
    {
      systemInstruction: SYSTEM_INSTRUCTION,
      tools: TOOLS,
      finishTool: "submit_agreement",
      parse,
      toolLabels: {},
      summarise: () => "Done",
      runTool: async () => ({}),
      maxTurns: 3,
    },
    parts,
    onStep,
  );
}
