/**
 * Minimal Gemini client, spoken over REST with `fetch`.
 *
 * No SDK on purpose: the official one pulls in Node built-ins that React
 * Native does not have, and all we need is one endpoint. Keeping it to fetch
 * also means the whole request is visible in one file, which matters when the
 * agent has to be explainable.
 *
 * The key is read from EXPO_PUBLIC_GEMINI_API_KEY. Anything prefixed
 * EXPO_PUBLIC_ is compiled into the JS bundle and is therefore extractable by
 * anyone with the app — acceptable for a prototype, not for release. The real
 * fix is a Supabase Edge Function holding the key server-side; see README.
 */

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

/**
 * Default is the `-latest` alias rather than a pinned version: Google keeps
 * older models listed by the API but closed to new keys, so a hardcoded
 * version silently stops working for anyone setting the project up fresh.
 * Override with EXPO_PUBLIC_GEMINI_MODEL — `scripts/check-gemini.mjs` reports
 * which models this key can really call.
 */
export const GEMINI_MODEL = process.env.EXPO_PUBLIC_GEMINI_MODEL ?? "gemini-flash-latest";

export const geminiApiKey = (): string | null =>
  process.env.EXPO_PUBLIC_GEMINI_API_KEY?.trim() || null;

export const hasGeminiKey = (): boolean => geminiApiKey() !== null;

// --- Wire types -------------------------------------------------------------

export interface FunctionDeclaration {
  name: string;
  description: string;
  parameters: {
    type: "OBJECT";
    /**
     * OpenAPI-subset property schemas. Use `enum` on STRING properties whose
     * value the app has to map onto a union — it is the difference between
     * getting "plumbing" and getting "Plumbing / Water Leak".
     */
    properties: Record<string, { type: string; description?: string; enum?: string[] }>;
    required?: string[];
  };
}

export interface GeminiPart {
  text?: string;
  functionCall?: { name: string; args: Record<string, unknown> };
  functionResponse?: { name: string; response: Record<string, unknown> };
}

export interface GeminiContent {
  role: "user" | "model";
  parts: GeminiPart[];
}

interface GenerateResponse {
  candidates?: { content?: GeminiContent; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
  error?: { message?: string; status?: string };
}

/** One turn. The agent loop calls this repeatedly, feeding results back in. */
export async function generateContent(input: {
  systemInstruction: string;
  contents: GeminiContent[];
  tools: FunctionDeclaration[];
  signal?: AbortSignal;
}): Promise<GeminiContent> {
  const key = geminiApiKey();
  if (!key) {
    throw new Error(
      "No Gemini API key. Add EXPO_PUBLIC_GEMINI_API_KEY to .env and restart the dev server.",
    );
  }

  const response = await fetch(`${ENDPOINT}/${GEMINI_MODEL}:generateContent?key=${key}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: input.signal,
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: input.systemInstruction }] },
      contents: input.contents,
      tools: [{ functionDeclarations: input.tools }],
      toolConfig: { functionCallingConfig: { mode: "AUTO" } },
      generationConfig: { temperature: 0.2 },
    }),
  });

  const body = (await response.json()) as GenerateResponse;

  if (!response.ok) {
    // Surface Google's own message — "model not found" and "quota exceeded"
    // need very different responses from whoever is reading this.
    throw new Error(body.error?.message ?? `Gemini returned ${response.status}`);
  }
  if (body.promptFeedback?.blockReason) {
    throw new Error(`Gemini blocked the request: ${body.promptFeedback.blockReason}`);
  }

  const content = body.candidates?.[0]?.content;
  if (!content) throw new Error("Gemini returned no content");

  return { role: "model", parts: content.parts ?? [] };
}

/** Which models this key can actually reach. Used by scripts/check-gemini.mjs. */
export async function listModels(): Promise<string[]> {
  const key = geminiApiKey();
  if (!key) throw new Error("No Gemini API key");

  const response = await fetch(`${ENDPOINT}?key=${key}`);
  const body = (await response.json()) as {
    models?: { name: string; supportedGenerationMethods?: string[] }[];
  };

  return (body.models ?? [])
    .filter((m) => m.supportedGenerationMethods?.includes("generateContent"))
    .map((m) => m.name.replace(/^models\//, ""));
}
