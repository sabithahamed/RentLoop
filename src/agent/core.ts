/**
 * The shared agent loop.
 *
 * Every RentLoop agent is the same shape: a goal, some tools that read real
 * tenancy state, and a finishing tool whose schema enforces the output. What
 * differs is the prompt and the tools — so that is all each agent file
 * contains.
 *
 * The loop is genuinely a loop: what gets called next depends on what came
 * back. Agents that need one round trip take one; the deposit agent works an
 * area at a time and takes many.
 */

import {
  GEMINI_MODEL,
  generateContent,
  type FunctionDeclaration,
  type GeminiContent,
  type GeminiPart,
} from "./geminiClient";
import type { AgentRun, AgentStep } from "./types";

export interface AgentDefinition<T> {
  systemInstruction: string;
  tools: FunctionDeclaration[];
  /** The tool the agent calls to finish. Its arguments become the result. */
  finishTool: string;
  parse: (args: Record<string, unknown>) => T;
  /** Tenant-facing label per tool, shown in the trace while it runs. */
  toolLabels: Record<string, string>;
  /** One line describing what a tool returned. */
  summarise: (toolName: string, output: unknown) => string;
  runTool: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  maxTurns?: number;
}

let counter = 0;
const stepId = (): string => `step-${++counter}`;

export async function runAgent<T>(
  definition: AgentDefinition<T>,
  userParts: GeminiPart[],
  onStep?: (step: AgentStep) => void,
): Promise<AgentRun<T>> {
  const started = Date.now();
  const steps: AgentStep[] = [];
  const maxTurns = definition.maxTurns ?? 6;

  const push = (step: Omit<AgentStep, "id" | "at">): void => {
    const full: AgentStep = { ...step, id: stepId(), at: new Date().toISOString() };
    steps.push(full);
    onStep?.(full);
  };

  const contents: GeminiContent[] = [{ role: "user", parts: userParts }];

  const imageCount = userParts.filter((p) => p.inlineData).length;
  push({
    kind: "plan",
    label:
      imageCount > 0
        ? `Looking at ${imageCount === 1 ? "your photo" : `${imageCount} photos`}`
        : "Reading what you wrote",
    detail: `${GEMINI_MODEL} · ${definition.tools.length} tools available`,
    toolName: null,
    args: null,
    result: null,
  });

  try {
    for (let turn = 0; turn < maxTurns; turn++) {
      const reply = await generateContent({
        systemInstruction: definition.systemInstruction,
        contents,
        tools: definition.tools,
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

        if (call.name === definition.finishTool) {
          const result = definition.parse(call.args ?? {});
          push({
            kind: "answer",
            label: "Reached a conclusion",
            detail: null,
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
          label: definition.toolLabels[call.name] ?? call.name,
          detail: null,
          toolName: call.name,
          args: call.args ?? null,
          result: null,
        });

        const output = await definition.runTool(call.name, call.args ?? {});

        push({
          kind: "tool_result",
          label: definition.summarise(call.name, output),
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
      error: `The assistant used all ${maxTurns} steps without finishing.`,
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
