/**
 * Maintenance triage.
 *
 * Now genuinely multimodal: the tenant's photos go to the model, so it can
 * judge severity from what it sees rather than from an adjective.
 */

import { runAgent } from "./core";
import { toInlineImages } from "./imageInput";
import { TOOL_DECLARATIONS, TOOL_LABELS, runTool, type ToolContext } from "./tools";
import type { AgentRun, AgentStep, TriageResult } from "./types";
import type { GeminiPart } from "./geminiClient";
import type { MaintenanceCategory, MaintenanceUrgency } from "../data/lifecycleTypes";

const SYSTEM_INSTRUCTION = `You are the maintenance assistant inside RentLoop, a rental management app used by tenants and landlords in Sri Lanka.

A tenant has reported a problem with their rented property. Triage it: what kind of issue it is, how urgent, and who is responsible for paying under their specific tenancy agreement.

How to work:
- If photos are attached, look at them first and say what you can actually see. Judge severity from the image, not just the words.
- Gather evidence before concluding. Your tools read this tenant's real agreement, their previously reported issues, and their move-in inspection photos.
- Never guess who pays. Read the agreement with get_agreement_terms. If it does not clearly settle the question, answer "unclear" and say why. Sri Lankan rental agreements are often vague here, and a confident wrong answer could cost the tenant money.
- Check whether the affected area was photographed at move-in. If not, warn them: without that photo they may be blamed at move-out for damage that was already there.
- Check for duplicates before treating something as new.
- Urgency should reflect real consequences: escaping water, shock risk, or a property that cannot be secured is high or emergency. Cosmetic issues are low.

How to speak:
- Write for a worried tenant, not a lawyer. Short sentences, plain English.
- You organise and advise, never decide. Do not tell the tenant they are legally entitled to anything.

Finish by calling submit_triage exactly once.`;

const CATEGORIES: MaintenanceCategory[] = [
  "plumbing",
  "electrical",
  "structural",
  "appliance",
  "pest",
  "other",
];
const URGENCIES: MaintenanceUrgency[] = ["low", "normal", "high", "emergency"];

const URGENCY_SYNONYMS: Record<string, MaintenanceUrgency> = {
  medium: "normal",
  moderate: "normal",
  urgent: "high",
  critical: "emergency",
  severe: "emergency",
  minor: "low",
};

/**
 * The schema constrains these with `enum`, so values arrive clean in practice.
 * This stays tolerant anyway: a model ignoring its own schema should degrade to
 * a sensible answer rather than to "other", which reads as failure when the
 * agent actually succeeded.
 */
function parseTriage(args: Record<string, unknown>): TriageResult {
  const rawCategory = String(args.category ?? "").toLowerCase();
  const rawUrgency = String(args.urgency ?? "").toLowerCase();

  const category = (
    CATEGORIES.includes(rawCategory as MaintenanceCategory)
      ? rawCategory
      : (CATEGORIES.find((c) => rawCategory.includes(c)) ?? "other")
  ) as MaintenanceCategory;

  const urgency = (
    URGENCIES.includes(rawUrgency as MaintenanceUrgency)
      ? rawUrgency
      : (URGENCY_SYNONYMS[rawUrgency] ?? URGENCIES.find((u) => rawUrgency.includes(u)) ?? "normal")
  ) as MaintenanceUrgency;

  const whoPays = String(args.who_pays ?? "unclear").toLowerCase();
  const actions = String(args.suggested_actions ?? "")
    .split("|")
    .map((s) => s.trim())
    .filter(Boolean);
  const related = String(args.related_ticket_id ?? "").trim();
  const deposit = String(args.deposit_risk ?? "").trim();
  const confidence = Number(args.confidence);

  return {
    category,
    urgency,
    whoPays: whoPays === "landlord" || whoPays === "tenant" ? whoPays : "unclear",
    rationale: String(args.rationale ?? "").trim(),
    suggestedActions: actions,
    relatedTicketId: related && related.toLowerCase() !== "none" ? related : null,
    depositRisk: deposit && deposit.toLowerCase() !== "none" ? deposit : null,
    confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0.5,
  };
}

interface ToolOutput {
  has_agreement?: boolean;
  terms?: unknown[];
  flagged_clauses?: unknown[];
  matches?: unknown[];
  matched_areas?: { photographed_at_move_in?: boolean }[];
}

function summarise(toolName: string, output: unknown): string {
  const o = (output ?? {}) as ToolOutput;

  switch (toolName) {
    case "get_agreement_terms":
      return o.has_agreement
        ? `Found ${o.terms?.length ?? 0} terms and ${o.flagged_clauses?.length ?? 0} flagged clauses`
        : "No agreement on file";

    case "find_similar_tickets": {
      const n = o.matches?.length ?? 0;
      return n === 0
        ? "No similar issues found"
        : `Found ${n} possibly related issue${n === 1 ? "" : "s"}`;
    }

    case "check_move_in_evidence": {
      const areas = o.matched_areas ?? [];
      if (areas.length === 0) return "That exact area is not on the move-in checklist";
      const photographed = areas.filter((a) => a.photographed_at_move_in).length;
      return photographed === areas.length
        ? `Nearby areas were photographed at move-in (${areas.length})`
        : `${areas.length - photographed} of ${areas.length} nearby areas have no move-in photo`;
    }

    default:
      return "Done";
  }
}

export interface TriageInput {
  title: string;
  description: string;
  photoUris: string[];
}

export async function runMaintenanceTriage(
  input: TriageInput,
  ctx: ToolContext,
  onStep?: (step: AgentStep) => void,
): Promise<AgentRun<TriageResult>> {
  const images = await toInlineImages(input.photoUris);

  const parts: GeminiPart[] = [
    {
      text: `The tenant reported this problem.

Title: ${input.title}
Description: ${input.description || "(none given)"}

${images.length > 0 ? "Their photos are attached below. Look at them." : "No usable photos were attached."}

Triage it.`,
    },
    ...images.map((image) => ({ inlineData: image })),
  ];

  return runAgent<TriageResult>(
    {
      systemInstruction: SYSTEM_INSTRUCTION,
      tools: TOOL_DECLARATIONS,
      finishTool: "submit_triage",
      parse: parseTriage,
      toolLabels: TOOL_LABELS,
      summarise,
      runTool: (name, args) => runTool(name, args, ctx),
    },
    parts,
    onStep,
  );
}
