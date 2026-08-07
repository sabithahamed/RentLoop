/**
 * The tools the triage agent can call.
 *
 * Each one reads real app state through the repository — the same data the
 * screens render. That is what makes this an agent rather than a prompt: the
 * model decides what it needs to know, and the answers come from the tenancy
 * in front of it rather than from the prompt text.
 *
 * Tools are read-only apart from `submit_triage`, which is how the agent
 * finishes. Nothing here writes to the tenancy — the human confirms the
 * result on screen first, which is the vision doc's rule that AI never makes
 * the final call.
 */

import type { FunctionDeclaration } from "./geminiClient";
import type { Repository } from "../data/repository";
import type { UUID } from "../data/types";

export const TOOL_DECLARATIONS: FunctionDeclaration[] = [
  {
    name: "get_agreement_terms",
    description:
      "Read the terms extracted from this tenancy's rental agreement, including who is responsible for repairs, the notice period and the deposit. Call this before deciding who pays for a repair — never assume.",
    parameters: { type: "OBJECT", properties: {}, required: [] },
  },
  {
    name: "find_similar_tickets",
    description:
      "Search maintenance issues already reported on this tenancy. Use this to check whether the new issue is a duplicate of something open, or a recurrence of something previously marked resolved.",
    parameters: {
      type: "OBJECT",
      properties: {
        keywords: {
          type: "STRING",
          description: 'Space-separated words describing the issue, e.g. "ceiling damp water".',
        },
      },
      required: ["keywords"],
    },
  },
  {
    name: "check_move_in_evidence",
    description:
      "Check whether the part of the property affected by this issue was photographed during the move-in inspection. If it was not, the tenant may later be blamed for pre-existing damage and lose deposit money.",
    parameters: {
      type: "OBJECT",
      properties: {
        area: {
          type: "STRING",
          description:
            'The affected area, e.g. "bathroom ceiling", "kitchen sink", "bedroom window".',
        },
      },
      required: ["area"],
    },
  },
  {
    name: "submit_triage",
    description:
      "Submit the finished triage. Call this exactly once, after gathering what you need.",
    parameters: {
      type: "OBJECT",
      properties: {
        // `enum` is load-bearing, not documentation. Without it the model
        // invents its own vocabulary — observed returning "Plumbing / Water
        // Leak" and "Medium" — which then falls back to "other"/"normal" and
        // silently discards a correct answer.
        category: {
          type: "STRING",
          enum: ["plumbing", "electrical", "structural", "appliance", "pest", "other"],
          description:
            "The single best-fitting category. Water coming through a ceiling from above is structural; a fault in the tap or pipe itself is plumbing.",
        },
        urgency: {
          type: "STRING",
          enum: ["low", "normal", "high", "emergency"],
          description:
            "emergency = unsafe or actively damaging right now. high = will get worse or costlier quickly. normal = should be fixed but is stable. low = cosmetic.",
        },
        who_pays: {
          type: "STRING",
          enum: ["landlord", "tenant", "unclear"],
          description:
            'Base this on the agreement terms you read. Use "unclear" when the agreement does not settle it — that is a legitimate and common answer.',
        },
        rationale: {
          type: "STRING",
          description:
            "Two or three sentences for the tenant, in plain English, referring to what you actually found.",
        },
        suggested_actions: {
          type: "STRING",
          description: 'Up to three next steps, separated by " | ".',
        },
        related_ticket_id: {
          type: "STRING",
          description: "Id of a matching existing ticket, or empty string if none.",
        },
        deposit_risk: {
          type: "STRING",
          description:
            "If move-in evidence is missing for the affected area, one sentence warning the tenant. Otherwise empty string.",
        },
        confidence: {
          type: "NUMBER",
          description: "How confident you are overall, 0 to 1.",
        },
      },
      required: ["category", "urgency", "who_pays", "rationale", "confidence"],
    },
  },
];

/** Human-readable labels for the trace shown on screen. */
export const TOOL_LABELS: Record<string, string> = {
  get_agreement_terms: "Reading your agreement",
  find_similar_tickets: "Checking issues you already reported",
  check_move_in_evidence: "Looking for move-in photos of that area",
  submit_triage: "Finishing up",
};

export interface ToolContext {
  repo: Repository;
  tenancyId: UUID;
}

/**
 * Runs a tool the model asked for.
 *
 * Unknown names return an error object rather than throwing — the model
 * recovers from being told a tool does not exist, but a thrown exception ends
 * the run and loses the whole trace.
 */
export async function runTool(
  name: string,
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<unknown> {
  switch (name) {
    case "get_agreement_terms": {
      const agreement = await ctx.repo.getAgreement(ctx.tenancyId);
      if (!agreement) {
        return { has_agreement: false, note: "No agreement uploaded for this tenancy." };
      }
      return {
        has_agreement: true,
        status: agreement.status,
        // Confirmation status is included so the model can hedge on terms the
        // tenant has not yet checked, rather than treating extraction as fact.
        terms: agreement.terms.map((t) => ({
          label: t.label,
          value: t.value,
          confirmed_by_tenant: t.confirmed,
          extraction_confidence: t.confidence,
        })),
        flagged_clauses: agreement.flaggedClauses.map((c) => ({
          text: c.text,
          why_flagged: c.reason,
        })),
      };
    }

    case "find_similar_tickets": {
      const keywords = String(args.keywords ?? "")
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length > 3);

      const tickets = await ctx.repo.listTickets(ctx.tenancyId);
      const scored = tickets
        .map((t) => {
          const haystack = `${t.title} ${t.description}`.toLowerCase();
          return { t, score: keywords.filter((k) => haystack.includes(k)).length };
        })
        .filter((s) => s.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 4);

      return {
        matches: scored.map(({ t, score }) => ({
          id: t.id,
          title: t.title,
          status: t.status,
          urgency: t.urgency,
          reported_on: t.reported_on,
          matched_terms: score,
        })),
      };
    }

    case "check_move_in_evidence": {
      const area = String(args.area ?? "").toLowerCase();
      const words = area.split(/\s+/).filter((w) => w.length > 3);
      const session = await ctx.repo.getInspection(ctx.tenancyId, "move_in");

      const candidates = session.areas.filter((a) => {
        const haystack = `${a.room} ${a.name}`.toLowerCase();
        return words.some((w) => haystack.includes(w));
      });

      if (candidates.length === 0) {
        return {
          matched_areas: [],
          note: `Nothing in the move-in checklist matches "${area}". The checklist covers: ${session.areas
            .map((a) => `${a.room}/${a.name}`)
            .join(", ")}.`,
        };
      }

      return {
        matched_areas: candidates.map((a) => ({
          room: a.room,
          area: a.name,
          photographed_at_move_in: a.photos.length > 0,
          required_area: a.required,
        })),
      };
    }

    default:
      return { error: `No tool named ${name}.` };
  }
}
