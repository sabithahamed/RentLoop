/**
 * The agent, working, on screen.
 *
 * This exists because an agent you cannot watch is indistinguishable from a
 * hardcoded answer. Each step appears as it happens: what it decided to look
 * up, what came back, and what it concluded. Tool arguments and raw results
 * are inspectable so nothing has to be taken on trust.
 */

import React, { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import { color, radius, shadow, space, type } from "../theme";
import type { AgentStep, TriageResult } from "../agent/types";
import { Pill } from "./lifecycle";

const KIND_GLYPH: Record<AgentStep["kind"], string> = {
  plan: "◆",
  tool_call: "→",
  tool_result: "✓",
  answer: "★",
  error: "!",
};

export function AgentTrace({
  steps,
  running,
  model,
  elapsedMs,
}: {
  steps: AgentStep[];
  running: boolean;
  model: string;
  elapsedMs?: number;
}) {
  if (steps.length === 0 && !running) return null;

  const toolCalls = steps.filter((s) => s.kind === "tool_call").length;

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <View style={styles.badge}>
          <View style={styles.badgeDot} />
          <Text style={styles.badgeText}>AGENT</Text>
        </View>
        <Text style={styles.meta}>
          {toolCalls > 0 ? `${toolCalls} lookup${toolCalls === 1 ? "" : "s"} · ` : ""}
          {elapsedMs !== undefined ? `${(elapsedMs / 1000).toFixed(1)}s` : model}
        </Text>
      </View>

      <View style={styles.steps}>
        {steps.map((step, index) => (
          <StepRow key={step.id} step={step} last={index === steps.length - 1 && !running} />
        ))}

        {running ? (
          <View style={styles.runningRow}>
            <View style={styles.runningGutter}>
              <ActivityIndicator size="small" color={color.agent} />
            </View>
            <Text style={styles.runningText}>Working…</Text>
          </View>
        ) : null}
      </View>

      <Text style={styles.footer}>{model}</Text>
    </View>
  );
}

function StepRow({ step, last }: { step: AgentStep; last: boolean }) {
  const [open, setOpen] = useState(false);
  const inspectable = step.args !== null || step.result !== null;
  const isError = step.kind === "error";
  const isAnswer = step.kind === "answer";

  return (
    <View style={styles.step}>
      <View style={styles.gutter}>
        <View
          style={[
            styles.node,
            step.kind === "tool_result" && styles.nodeDone,
            isAnswer && styles.nodeAnswer,
            isError && styles.nodeError,
          ]}
        >
          <Text
            style={[
              styles.glyph,
              (step.kind === "tool_result" || isAnswer || isError) && styles.glyphOnFill,
            ]}
          >
            {KIND_GLYPH[step.kind]}
          </Text>
        </View>
        {!last ? <View style={styles.line} /> : null}
      </View>

      <View style={[styles.body, last && { paddingBottom: 0 }]}>
        <Pressable
          accessibilityRole={inspectable ? "button" : undefined}
          onPress={inspectable ? () => setOpen((o) => !o) : undefined}
          disabled={!inspectable}
          style={styles.labelRow}
        >
          <Text
            style={[
              styles.label,
              isError && { color: color.danger },
              isAnswer && styles.labelAnswer,
            ]}
          >
            {step.label}
          </Text>
          {inspectable ? <Text style={styles.toggle}>{open ? "hide" : "details"}</Text> : null}
        </Pressable>

        {step.detail ? <Text style={styles.detail}>{step.detail}</Text> : null}

        {open ? (
          <View style={styles.raw}>
            {step.args ? (
              <>
                <Text style={styles.rawLabel}>ASKED FOR</Text>
                <Text style={styles.rawText}>{JSON.stringify(step.args, null, 2)}</Text>
              </>
            ) : null}
            {step.result ? (
              <>
                <Text style={[styles.rawLabel, step.args ? { marginTop: space.sm } : null]}>
                  GOT BACK
                </Text>
                <Text style={styles.rawText}>{JSON.stringify(step.result, null, 2)}</Text>
              </>
            ) : null}
          </View>
        ) : null}
      </View>
    </View>
  );
}

/** The finished triage, as something the tenant accepts or overrides. */
export function TriageCard({ result }: { result: TriageResult }) {
  const payTone =
    result.whoPays === "landlord" ? "good" : result.whoPays === "tenant" ? "warn" : "neutral";

  return (
    <View style={styles.triage}>
      <View style={styles.triageTop}>
        <Pill label={result.category} tone="info" />
        <Pill
          label={result.urgency}
          tone={
            result.urgency === "emergency" || result.urgency === "high"
              ? "bad"
              : result.urgency === "low"
                ? "neutral"
                : "warn"
          }
        />
        <Pill
          label={result.whoPays === "unclear" ? "who pays: unclear" : `${result.whoPays} pays`}
          tone={payTone}
        />
      </View>

      <Text style={styles.rationale}>{result.rationale}</Text>

      {result.depositRisk ? (
        <View style={styles.risk}>
          <Text style={styles.riskLabel}>DEPOSIT RISK</Text>
          <Text style={styles.riskText}>{result.depositRisk}</Text>
        </View>
      ) : null}

      {result.suggestedActions.length > 0 ? (
        <View style={styles.actions}>
          <Text style={styles.actionsLabel}>SUGGESTED NEXT STEPS</Text>
          {result.suggestedActions.map((action, i) => (
            <View key={i} style={styles.actionRow}>
              <Text style={styles.actionNumber}>{i + 1}</Text>
              <Text style={styles.action}>{action}</Text>
            </View>
          ))}
        </View>
      ) : null}

      <View style={styles.confidenceRow}>
        <ConfidenceBar value={result.confidence} />
        <Text style={styles.confidence}>
          {Math.round(result.confidence * 100)}% confident · you can change any of this
        </Text>
      </View>
    </View>
  );
}

/** A small honest bar. Low confidence should look low, not be buried in a number. */
export function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(1, value));
  const tint = pct >= 0.8 ? color.success : pct >= 0.6 ? "#845400" : color.danger;

  return (
    <View style={styles.bar}>
      <View style={[styles.barFill, { width: `${pct * 100}%`, backgroundColor: tint }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: color.agentSoft,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.agentBorder,
    padding: space.lg,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: space.lg,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: color.agent,
    borderRadius: radius.pill,
    paddingHorizontal: space.sm,
    paddingVertical: 3,
  },
  badgeDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: "#FFFFFF", opacity: 0.85 },
  badgeText: { fontSize: 9, fontWeight: "700", letterSpacing: 1, color: "#FFFFFF" },
  meta: { fontSize: 11, color: color.agentFaint, fontVariant: ["tabular-nums"] },

  steps: {},
  step: { flexDirection: "row", gap: space.md },
  gutter: { alignItems: "center", width: 20 },
  node: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: color.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.agentBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  nodeDone: { backgroundColor: color.agent, borderColor: color.agent },
  nodeAnswer: { backgroundColor: color.success, borderColor: color.success },
  nodeError: { backgroundColor: color.danger, borderColor: color.danger },
  glyph: { fontSize: 10, lineHeight: 13, color: color.agent, fontWeight: "700" },
  glyphOnFill: { color: "#FFFFFF" },
  line: { flex: 1, width: 1.5, backgroundColor: color.agentBorder, marginVertical: 3 },

  body: { flex: 1, paddingBottom: space.lg },
  labelRow: { flexDirection: "row", alignItems: "baseline", gap: space.sm },
  label: { flex: 1, fontSize: 14, fontWeight: "600", color: "#2B2450", lineHeight: 20 },
  labelAnswer: { color: color.success },
  toggle: { fontSize: 11, fontWeight: "600", color: color.agentFaint },
  detail: { fontSize: 13.5, color: color.agentText, marginTop: 3, lineHeight: 19 },

  raw: {
    marginTop: space.sm,
    backgroundColor: color.surface,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.agentBorder,
    padding: space.md,
  },
  rawLabel: { fontSize: 8.5, fontWeight: "700", letterSpacing: 0.8, color: color.agentFaint },
  rawText: { fontSize: 10.5, color: "#3F3866", lineHeight: 15, marginTop: 3 },

  runningRow: { flexDirection: "row", alignItems: "center", gap: space.md },
  runningGutter: { width: 20, alignItems: "center" },
  runningText: { fontSize: 13.5, color: color.agentFaint, fontWeight: "500" },

  footer: {
    fontSize: 10,
    color: color.agentFaint,
    marginTop: space.md,
    textAlign: "right",
    opacity: 0.8,
  },

  triage: {
    marginTop: space.md,
    backgroundColor: color.surface,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.border,
    padding: space.xl,
    ...shadow.lifted,
  },
  triageTop: { flexDirection: "row", flexWrap: "wrap", gap: space.xs },
  rationale: { ...type.body, marginTop: space.lg },

  risk: {
    marginTop: space.lg,
    backgroundColor: "#FCF0D9",
    borderRadius: radius.sm,
    padding: space.md,
    borderLeftWidth: 3,
    borderLeftColor: "#C98A1A",
  },
  riskLabel: { fontSize: 9, fontWeight: "700", letterSpacing: 0.9, color: "#845400" },
  riskText: { fontSize: 13.5, color: "#6E4700", marginTop: 4, lineHeight: 19 },

  actions: { marginTop: space.lg },
  actionsLabel: { ...type.label, marginBottom: space.sm },
  actionRow: { flexDirection: "row", gap: space.md, marginBottom: space.sm },
  actionNumber: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: color.accentSoft,
    color: color.accent,
    fontSize: 10.5,
    fontWeight: "700",
    textAlign: "center",
    lineHeight: 18,
    overflow: "hidden",
  },
  action: { flex: 1, fontSize: 14, color: color.text, lineHeight: 20 },

  confidenceRow: { marginTop: space.xl },
  bar: {
    height: 4,
    borderRadius: 2,
    backgroundColor: color.surfaceSunken,
    overflow: "hidden",
  },
  barFill: { height: "100%", borderRadius: 2 },
  confidence: { ...type.caption, fontSize: 11.5, marginTop: space.sm },
});
