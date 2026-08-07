/**
 * Checks that the Gemini key works, that the configured model exists for this
 * account, and that function calling actually returns a tool call.
 *
 *   node scripts/check-gemini.mjs
 *
 * Worth running before recording the demo video. Model availability differs by
 * account and region, and finding that out mid-recording is expensive.
 */

import { readFileSync } from "node:fs";

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

function loadEnv() {
  try {
    for (const line of readFileSync(new URL("../.env", import.meta.url), "utf8").split("\n")) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (match && !process.env[match[1]]) {
        process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
      }
    }
  } catch {
    // No .env — fall back to the real environment.
  }
}

loadEnv();

const key = process.env.EXPO_PUBLIC_GEMINI_API_KEY?.trim();
const configured = process.env.EXPO_PUBLIC_GEMINI_MODEL?.trim() || "gemini-flash-latest";

if (!key) {
  console.error("✗ No EXPO_PUBLIC_GEMINI_API_KEY found in .env or the environment.");
  console.error("  Get one at https://aistudio.google.com → Get API key");
  process.exit(1);
}

console.log(`Key found (…${key.slice(-4)}). Configured model: ${configured}\n`);

// 1. Which models can this key reach?
const listResponse = await fetch(`${ENDPOINT}?key=${key}`);
const listBody = await listResponse.json();

if (!listResponse.ok) {
  console.error(`✗ Could not list models: ${listBody.error?.message ?? listResponse.status}`);
  process.exit(1);
}

const usable = (listBody.models ?? [])
  .filter((m) => m.supportedGenerationMethods?.includes("generateContent"))
  .map((m) => m.name.replace(/^models\//, ""));

const flash = usable.filter((m) => m.includes("flash") && !m.includes("thinking"));

console.log(`✓ ${usable.length} models available to this key`);
console.log(`  Flash models: ${flash.slice(0, 8).join(", ")}${flash.length > 8 ? " …" : ""}\n`);

// 2. Probe for a model that actually works.
//
// Being in the list above is NOT enough: Google keeps older models listed but
// closed to new API keys ("no longer available to new users"). The only
// reliable test is a real generateContent call, with the tool call the agent
// depends on — a model that answers in prose instead of calling the tool is
// useless to us even though it "works".
async function probe(model) {
  const response = await fetch(`${ENDPOINT}/${model}:generateContent?key=${key}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: "You triage rental maintenance issues. Always gather evidence first." }],
      },
      contents: [
        {
          role: "user",
          parts: [{ text: "The bathroom ceiling has a spreading damp patch. Triage it." }],
        },
      ],
      tools: [
        {
          functionDeclarations: [
            {
              name: "get_agreement_terms",
              description: "Read the tenancy agreement to find who pays for repairs.",
              parameters: { type: "OBJECT", properties: {}, required: [] },
            },
          ],
        },
      ],
      toolConfig: { functionCallingConfig: { mode: "AUTO" } },
    }),
  });

  const body = await response.json();
  if (!response.ok) return { ok: false, reason: body.error?.message ?? `HTTP ${response.status}` };

  const parts = body.candidates?.[0]?.content?.parts ?? [];
  const call = parts.find((p) => p.functionCall);
  return call
    ? { ok: true, tool: call.functionCall.name }
    : { ok: false, reason: "replied with prose instead of calling the tool" };
}

// Newest-first, but only ones this key can see at all.
const candidates = [
  configured,
  "gemini-flash-latest",
  "gemini-3.5-flash",
  "gemini-2.0-flash",
  "gemini-2.0-flash-001",
  "gemini-flash-lite-latest",
  "gemini-2.0-flash-lite",
].filter((m, i, all) => all.indexOf(m) === i && usable.includes(m));

let winner = null;

for (const model of candidates) {
  process.stdout.write(`  testing ${model} … `);
  const outcome = await probe(model);
  if (outcome.ok) {
    console.log(`✓ called "${outcome.tool}"`);
    winner = model;
    break;
  }
  console.log(`✗ ${outcome.reason}`);
}

console.log();

if (!winner) {
  console.error("✗ No model worked. Check the reasons above.");
  process.exit(1);
}

if (winner === configured) {
  console.log(`All good — "${winner}" works. The agent should run.`);
} else {
  console.log(`✓ Use "${winner}".\n`);
  console.log("  Add this line to .env, then restart Expo:\n");
  console.log(`    EXPO_PUBLIC_GEMINI_MODEL=${winner}`);
}
