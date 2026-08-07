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

import { color, radius, space, type } from "../theme";
import type { AgentStep, TriageResult } from "../agent/types";
import { Pill } from "./lifecycle";

const KIND_GLYPH: Record<AgentStep["kind"], string> = {
  plan: "◆",
  tool_call: "→",
  tool_result: "✓",
  answer: "★",
  error: "✕",
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

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>AGENT</Text>
        </View>
        <Text style={styles.meta}>
          {model}
          {elapsedMs !== undefined ? ` · ${(elapsedMs / 1000).toFixed(1)}s` : ""}
        </Text>
      </View>

      {steps.map((step, index) => (
        <StepRow key={step.id} step={step} last={index === steps.length - 1 && !running} />
      ))}

      {running ? (
        <View style={styles.runningRow}>
          <ActivityIndicator size="small" color="#5B4B9E" />
          <Text style={styles.runningText}>Working…</Text>
        </View>
      ) : null}
    </View>
  );
}

function StepRow({ step, last }: { step: AgentStep; last: boolean }) {
  const [open, setOpen] = useState(false);
  const inspectable = step.args !== null || step.result !== null;

  return (
    <View style={styles.step}>
      <View style={styles.gutter}>
        <Text style={[styles.glyph, step.kind === "error" && { color: color.danger }]}>
          {KIND_GLYPH[step.kind]}
        </Text>
        {!last ? <View style={styles.line} /> : null}
      </View>

      <View style={styles.body}>
        <Pressable
          accessibilityRole={inspectable ? "button" : undefined}
          onPress={inspectable ? () => setOpen((o) => !o) : undefined}
          disabled={!inspectable}
        >
          <Text style={[styles.label, step.kind === "error" && { color: color.danger }]}>
            {step.label}
            {inspectable ? (
              <Text style={styles.toggle}>{open ? "  hide" : "  details"}</Text>
            ) : null}
          </Text>
        </Pressable>

        {step.detail ? <Text style={styles.detail}>{step.detail}</Text> : null}

        {open ? (
          <View style={styles.raw}>
            {step.args ? (
              <>
                <Text style={styles.rawLabel}>Asked for</Text>
                <Text style={styles.rawText}>{JSON.stringify(step.args, null, 2)}</Text>
              </>
            ) : null}
            {step.result ? (
              <>
                <Text style={styles.rawLabel}>Got back</Text>
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
          <Text style={styles.actionsLabel}>Suggested next steps</Text>
          {result.suggestedActions.map((action, i) => (
            <Text key={i} style={styles.action}>
              {i + 1}. {action}
            </Text>
          ))}
        </View>
      ) : null}

      <Text style={styles.confidence}>
        Confidence {Math.round(result.confidence * 100)}% · you can change any of this before
        sending
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: "#F4F1FB",
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#DDD5F2",
    padding: space.lg,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: space.md,
  },
  badge: {
    backgroundColor: "#5B4B9E",
    borderRadius: radius.pill,
    paddingHorizontal: space.sm,
    paddingVertical: 2,
  },
  badgeText: { fontSize: 9, fontWeight: "700", letterSpacing: 0.8, color: "#FFFFFF" },
  meta: { fontSize: 10.5, color: "#6B5FA8", fontVariant: ["tabular-nums"] },

  step: { flexDirection: "row", gap: space.md },
  gutter: { alignItems: "center", width: 16 },
  glyph: { fontSize: 12, color: "#5B4B9E", marginTop: 2 },
  line: { flex: 1, width: StyleSheet.hairlineWidth, backgroundColor: "#CFC5EA", marginVertical: 2 },
  body: { flex: 1, paddingBottom: space.md },
  label: { fontSize: 13.5, fontWeight: "600", color: "#2E2453", lineHeight: 19 },
  toggle: { fontSize: 11, fontWeight: "500", color: "#8B7FC0" },
  detail: { fontSize: 13, color: "#5B5480", marginTop: 2, lineHeight: 18 },

  raw: {
    marginTop: space.sm,
    backgroundColor: "#EAE5F6",
    borderRadius: radius.sm,
    padding: space.sm,
  },
  rawLabel: {
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0.6,
    color: "#6B5FA8",
    marginBottom: 2,
  },
  rawText: {
    fontSize: 10.5,
    color: "#4A4270",
    fontFamily: undefined,
    lineHeight: 15,
    marginBottom: space.xs,
  },

  runningRow: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingLeft: 2 },
  runningText: { fontSize: 13, color: "#6B5FA8" },

  triage: {
    marginTop: space.md,
    backgroundColor: color.surface,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.border,
    padding: space.lg,
  },
  triageTop: { flexDirection: "row", flexWrap: "wrap", gap: space.xs },
  rationale: { ...type.body, fontSize: 14, lineHeight: 21, marginTop: space.md },

  risk: {
    marginTop: space.md,
    backgroundColor: "#FCF1DC",
    borderRadius: radius.sm,
    padding: space.md,
  },
  riskLabel: { fontSize: 9, fontWeight: "700", letterSpacing: 0.8, color: "#8A5A00" },
  riskText: { fontSize: 13, color: "#8A5A00", marginTop: 3, lineHeight: 19 },

  actions: { marginTop: space.md },
  actionsLabel: { ...type.label, marginBottom: space.xs },
  action: { fontSize: 13.5, color: color.text, lineHeight: 20 },

  confidence: { ...type.caption, fontSize: 11.5, marginTop: space.md, fontStyle: "italic" },
});
