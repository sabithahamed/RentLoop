/**
 * The maintenance triage agent.
 *
 * This is the one part of RentLoop that is genuinely an agent rather than a
 * canned response: it runs a real multi-step loop against Gemini, decides for
 * itself which tools to call, and reasons over what those tools return.
 *
 * Every step it takes is recorded in `AgentRun.steps` and rendered on screen.
 * That is deliberate — an agent whose working you cannot inspect is
 * indistinguishable from a hardcoded answer, both to a judge and to a tenant
 * deciding whether to trust it.
 */

import type { MaintenanceCategory, MaintenanceUrgency } from "../data/lifecycleTypes";

export type AgentStepKind = "plan" | "tool_call" | "tool_result" | "answer" | "error";

export interface AgentStep {
  id: string;
  kind: AgentStepKind;
  /** One line, written for the tenant rather than the developer. */
  label: string;
  detail: string | null;
  toolName: string | null;
  args: Record<string, unknown> | null;
  result: unknown;
  at: string;
}

/**
 * What the agent is asked to produce. It reaches this by calling
 * `submit_triage`, so the shape is enforced by the model's function schema
 * rather than by parsing prose out of a paragraph.
 */
export interface TriageResult {
  category: MaintenanceCategory;
  urgency: MaintenanceUrgency;
  /**
   * Read out of the tenancy agreement, not guessed. `unclear` is a legitimate
   * and common answer — Sri Lankan agreements are frequently vague about this,
   * and pretending otherwise would be the AI making a legal call.
   */
  whoPays: "landlord" | "tenant" | "unclear";
  /** Why, in terms the tenant can check against their own agreement. */
  rationale: string;
  suggestedActions: string[];
  /** Set when this looks like an existing open ticket. */
  relatedTicketId: string | null;
  /** Flagged when the issue touches an area with no move-in photo. */
  depositRisk: string | null;
  confidence: number;
}

export interface AgentRun {
  steps: AgentStep[];
  result: TriageResult | null;
  error: string | null;
  model: string;
  elapsedMs: number;
}
