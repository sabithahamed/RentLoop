/**
 * The triage loop.
 *
 * Genuinely iterative: the model is given tools and a goal, and keeps going
 * until it calls `submit_triage` or hits the step ceiling. Nothing here
 * dictates which tools it uses or in what order — that is the model's
 * decision, and different reports produce different traces.
 *
 * Every turn is appended to `steps` as it happens, so the UI can show the
 * agent working rather than freezing on a spinner and revealing an answer.
 */

import { GEMINI_MODEL, generateContent, type GeminiContent, type GeminiPart } from "./geminiClient";
import { TOOL_DECLARATIONS, TOOL_LABELS, runTool, type ToolContext } from "./tools";
import type { AgentRun, AgentStep, TriageResult } from "./types";
import type { MaintenanceCategory, MaintenanceUrgency } from "../data/lifecycleTypes";

/** Enough for the model to gather context and finish; low enough to bound cost. */
const MAX_TURNS = 6;

const SYSTEM_INSTRUCTION = `You are the maintenance assistant inside RentLoop, a rental management app used by tenants and landlords in Sri Lanka.

A tenant has reported a problem with their rented property. Your job is to triage it: work out what kind of issue it is, how urgent it is, and who is responsible for paying under their specific tenancy agreement.

How to work:
- Gather evidence before concluding. You have tools that read this tenant's actual agreement, their previously reported issues, and their move-in inspection photos. Use them.
- Never guess who pays. Read the agreement with get_agreement_terms. If the agreement does not clearly settle it, answer "unclear" and say why. Sri Lankan rental agreements are often vague here, and a confident wrong answer could cost the tenant money.
- Check whether the affected area was photographed at move-in. If it was not, warn the tenant: without that photo they may be blamed at move-out for damage that was already there.
- Check for duplicates before treating something as new.
- Urgency should reflect real consequences: anything involving escaping water, electrical shock risk, or a property that cannot be secured is high or emergency. Cosmetic issues are low.

How to speak:
- Write for a worried tenant, not a landlord or a lawyer. Short sentences, plain English, no jargon.
- You are organising and advising, never deciding. Do not tell the tenant they are legally entitled to anything.

Finish by calling submit_triage exactly once.`;

let counter = 0;
const stepId = (): string => `step-${++counter}`;
const now = (): string => new Date().toISOString();

const CATEGORIES: MaintenanceCategory[] = [
  "plumbing",
  "electrical",
  "structural",
  "appliance",
  "pest",
  "other",
];
const URGENCIES: MaintenanceUrgency[] = ["low", "normal", "high", "emergency"];

/** Words models reach for that are not in our vocabulary but clearly mean one of ours. */
const URGENCY_SYNONYMS: Record<string, MaintenanceUrgency> = {
  medium: "normal",
  moderate: "normal",
  urgent: "high",
  critical: "emergency",
  severe: "emergency",
  minor: "low",
};

/**
 * The schema constrains these with `enum`, so in practice the values arrive
 * clean. This stays tolerant anyway: a model that ignores its own schema
 * should degrade to a sensible answer rather than to "other", which reads as
 * the agent having failed when it actually succeeded.
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

  const relatedRaw = String(args.related_ticket_id ?? "").trim();
  const depositRaw = String(args.deposit_risk ?? "").trim();
  const confidence = Number(args.confidence);

  return {
    category,
    urgency,
    whoPays: whoPays === "landlord" || whoPays === "tenant" ? whoPays : "unclear",
    rationale: String(args.rationale ?? "").trim(),
    suggestedActions: actions,
    relatedTicketId: relatedRaw && relatedRaw.toLowerCase() !== "none" ? relatedRaw : null,
    depositRisk: depositRaw && depositRaw.toLowerCase() !== "none" ? depositRaw : null,
    confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0.5,
  };
}

export interface TriageInput {
  title: string;
  description: string;
  photoCount: number;
}

/**
 * Runs triage. `onStep` fires as each step lands so the screen can stream it;
 * the resolved `AgentRun` carries the same steps for the record.
 */
export async function runMaintenanceTriage(
  input: TriageInput,
  ctx: ToolContext,
  onStep?: (step: AgentStep) => void,
): Promise<AgentRun> {
  const started = Date.now();
  const steps: AgentStep[] = [];

  const push = (step: Omit<AgentStep, "id" | "at">): void => {
    const full: AgentStep = { ...step, id: stepId(), at: now() };
    steps.push(full);
    onStep?.(full);
  };

  const contents: GeminiContent[] = [
    {
      role: "user",
      parts: [
        {
          text: `The tenant reported this problem.

Title: ${input.title}
Description: ${input.description}
Photos attached: ${input.photoCount}

Triage it.`,
        },
      ],
    },
  ];

  push({
    kind: "plan",
    label: "Reading what you wrote",
    detail: `Sent to ${GEMINI_MODEL} with ${TOOL_DECLARATIONS.length} tools available.`,
    toolName: null,
    args: null,
    result: null,
  });

  try {
    for (let turn = 0; turn < MAX_TURNS; turn++) {
      const reply = await generateContent({
        systemInstruction: SYSTEM_INSTRUCTION,
        contents,
        tools: TOOL_DECLARATIONS,
      });
      contents.push(reply);

      const calls = reply.parts.filter((p) => p.functionCall);
      const prose = reply.parts
        .map((p) => p.text)
        .filter(Boolean)
        .join(" ")
        .trim();

      if (prose) {
        push({
          kind: "plan",
          label: "Thinking it through",
          detail: prose,
          toolName: null,
          args: null,
          result: null,
        });
      }

      if (calls.length === 0) {
        // No tool call and no submission — the model has drifted. Its prose is
        // the most useful thing left, so surface that rather than a bare error.
        return {
          steps,
          result: null,
          error: prose || "The assistant stopped without reaching a conclusion.",
          model: GEMINI_MODEL,
          elapsedMs: Date.now() - started,
        };
      }

      const responseParts: GeminiPart[] = [];

      for (const part of calls) {
        const call = part.functionCall!;

        if (call.name === "submit_triage") {
          const result = parseTriage(call.args ?? {});
          push({
            kind: "answer",
            label: "Reached a conclusion",
            // Not the rationale — the card below renders that in full, and
            // printing it twice reads as a glitch.
            detail: `${result.category} · ${result.urgency} urgency · ${
              result.whoPays === "unclear" ? "who pays unclear" : `${result.whoPays} pays`
            }`,
            toolName: call.name,
            args: call.args ?? null,
            result,
          });
          return {
            steps,
            result,
            error: null,
            model: GEMINI_MODEL,
            elapsedMs: Date.now() - started,
          };
        }

        push({
          kind: "tool_call",
          label: TOOL_LABELS[call.name] ?? call.name,
          detail: null,
          toolName: call.name,
          args: call.args ?? null,
          result: null,
        });

        const output = await runTool(call.name, call.args ?? {}, ctx);

        push({
          kind: "tool_result",
          label: summariseResult(call.name, output),
          detail: null,
          toolName: call.name,
          args: null,
          result: output,
        });

        responseParts.push({
          functionResponse: { name: call.name, response: output as Record<string, unknown> },
        });
      }

      contents.push({ role: "user", parts: responseParts });
    }

    return {
      steps,
      result: null,
      error: `The assistant used all ${MAX_TURNS} steps without finishing.`,
      model: GEMINI_MODEL,
      elapsedMs: Date.now() - started,
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : "The assistant could not be reached.";
    push({
      kind: "error",
      label: "Something went wrong",
      detail: message,
      toolName: null,
      args: null,
      result: null,
    });
    return {
      steps,
      result: null,
      error: message,
      model: GEMINI_MODEL,
      elapsedMs: Date.now() - started,
    };
  }
}

/**
 * The shapes `runTool` returns, as far as this summary needs to know. Narrow
 * on purpose — everything here is optional, because a summary line must never
 * be the thing that throws and kills a completed run.
 */
interface ToolOutput {
  has_agreement?: boolean;
  terms?: unknown[];
  flagged_clauses?: unknown[];
  matches?: unknown[];
  matched_areas?: { photographed_at_move_in?: boolean }[];
}

/** Turns a raw tool result into one line a tenant can read in the trace. */
function summariseResult(toolName: string, output: unknown): string {
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
      if (areas.length === 0) return "No matching area in the move-in checklist";
      const photographed = areas.filter((a) => a.photographed_at_move_in).length;
      return photographed === areas.length
        ? "That area was photographed at move-in"
        : `${areas.length - photographed} of ${areas.length} areas have no move-in photo`;
    }

    default:
      return "Done";
  }
}
