/**
 * Minimal Gemini client, spoken over REST with `fetch`.
 *
 * No SDK on purpose: the official one pulls in Node built-ins that React
 * Native does not have, and all we need is one endpoint. Keeping it to fetch
 * also means the whole request is visible in one file, which matters when the
 * agent has to be explainable.
 *
 * Two routes, in this order:
 *
 *   1. The `gemini` Edge Function, when Supabase is configured. The API key
 *      lives there as a server secret and never reaches a device, the caller
 *      must be signed in, and usage is capped per account.
 *   2. A direct call with EXPO_PUBLIC_GEMINI_API_KEY, for local development
 *      before the function is deployed. That key IS compiled into the bundle
 *      and can be extracted by anyone holding the app — fine on a laptop,
 *      never for a release build.
 */

import { isSupabaseConfigured, supabase } from "../data/supabase/client";

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

/**
 * Send the same payload through the Edge Function instead.
 *
 * The function forwards Gemini's response verbatim, including its status, so
 * everything downstream — the retry on 503, the error surfacing — works
 * unchanged whichever route was taken.
 */
async function callProxy(payload: string, signal?: AbortSignal): Promise<Response> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;

  return fetch(`${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/gemini`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    signal,
    body: payload,
  });
}

/**
 * Default is the `-latest` alias rather than a pinned version: Google keeps
 * older models listed by the API but closed to new keys, so a hardcoded
 * version silently stops working for anyone setting the project up fresh.
 * Override with EXPO_PUBLIC_GEMINI_MODEL — `scripts/check-gemini.mjs` reports
 * which models this key can really call.
 */
export const GEMINI_MODEL = process.env.EXPO_PUBLIC_GEMINI_MODEL ?? "gemini-flash-latest";

/**
 * Models to fall back through when the first one is overloaded.
 *
 * The free tier answers 503 "high demand" often enough that a five-turn agent
 * run will meet one, and retrying the same model harder does not help when it
 * is the model that is saturated. These are separately provisioned, so a
 * different one usually answers immediately. Order is deliberate: the
 * configured model, then the lighter one, then the pinned 2.5.
 */
const MODEL_CHAIN = [
  GEMINI_MODEL,
  "gemini-flash-lite-latest",
  "gemini-2.5-flash",
  "gemini-2.0-flash",
].filter((m, i, all) => all.indexOf(m) === i);

/** Which model actually answered last, for the trace. */
let lastModelUsed = GEMINI_MODEL;

export const modelLabel = (): string => lastModelUsed;

export const geminiApiKey = (): string | null =>
  process.env.EXPO_PUBLIC_GEMINI_API_KEY?.trim() || null;

/**
 * Whether the Edge Function is actually there.
 *
 * null until something has tried. Supabase being configured says only that the
 * project exists — the function is deployed separately, and a project without
 * it answers 404 to every agent call. Assuming the proxy exists because the
 * project does is how every assistant in the app silently stopped working.
 */
let proxyDeployed: boolean | null = null;

/**
 * True when a request should go through the server.
 *
 * A local key wins. EXPO_PUBLIC_GEMINI_API_KEY is compiled into the bundle, so
 * setting one is a deliberate statement that this build calls Google directly
 * — and going through an Edge Function that may not be deployed, on the chance
 * that it is, buys nothing but a failed round trip. Release builds ship with no
 * key in .env, which puts every call back through the server, where the secret
 * stays on the server and usage is capped per account.
 */
export const usesProxy = (): boolean =>
  isSupabaseConfigured && proxyDeployed !== false && geminiApiKey() === null;

/** The assistant is available either way — proxied, or with a local key. */
export const hasGeminiKey = (): boolean => usesProxy() || geminiApiKey() !== null;

/** Shown in the trace so it is never a mystery which route a run took. */
export const routeLabel = (): string =>
  usesProxy() ? "via server (key not in app)" : "direct (dev key)";

/** Direct call. The key is in the bundle, so this is development only. */
function callDirect(
  payload: string,
  key: string,
  model: string,
  signal?: AbortSignal,
): Promise<Response> {
  return fetch(`${ENDPOINT}/${model}:generateContent?key=${key}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal,
    body: payload,
  });
}

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
  /** A photo for the model to look at. Base64, no data: prefix. */
  inlineData?: { mimeType: string; data: string };
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
  const payload = JSON.stringify({
    systemInstruction: { parts: [{ text: input.systemInstruction }] },
    contents: input.contents,
    tools: [{ functionDeclarations: input.tools }],
    toolConfig: { functionCallingConfig: { mode: "AUTO" } },
    generationConfig: { temperature: 0.2 },
  });

  // The free tier returns 503 "high demand" and 429 often enough that a
  // multi-turn agent will hit one mid-run. Losing four completed tool calls to
  // a transient overload is not acceptable, so retry those with backoff.
  // Everything else — bad model, bad key, blocked content — fails immediately,
  // because retrying it would just be slower.
  const key = geminiApiKey();
  if (!usesProxy() && !key) {
    throw new Error(
      "The assistant is not configured. Either deploy the gemini Edge Function, or add EXPO_PUBLIC_GEMINI_API_KEY to .env for local development.",
    );
  }

  let response: Response | null = null;
  let body: GenerateResponse | null = null;

  // Two attempts on each model before moving to the next: a spike that is
  // going to clear usually clears within a couple of seconds, and one that is
  // not clears faster by asking a different model than by waiting.
  const attempts: { model: string; attempt: number }[] = MODEL_CHAIN.flatMap((m) => [
    { model: m, attempt: 0 },
    { model: m, attempt: 1 },
  ]);

  for (let step = 0; step < attempts.length; step++) {
    const { model, attempt } = attempts[step];
    const last = step === attempts.length - 1;
    let attemptResponse: Response;

    if (usesProxy()) {
      // A project without the function deployed answers 404 on native, and on
      // web fails the CORS preflight so `fetch` rejects outright. Both mean
      // the same thing, and both used to surface as "Failed to fetch" with
      // every assistant in the app dead behind it.
      let proxied: Response | null = null;
      let proxyFailed = false;
      try {
        proxied = await callProxy(payload, input.signal);
        if (proxied.status === 404) proxyFailed = true;
      } catch (e) {
        // An aborted run is the caller changing their mind, not a broken
        // proxy — rethrow it rather than quietly switching routes.
        if (e instanceof Error && e.name === "AbortError") throw e;
        proxyFailed = true;
      }

      if (proxyFailed) {
        proxyDeployed = false;
        if (!key) {
          throw new Error(
            "The assistant is not set up: the gemini Edge Function is not deployed to this Supabase project, and there is no EXPO_PUBLIC_GEMINI_API_KEY to fall back on.",
          );
        }
        attemptResponse = await callDirect(payload, key, model, input.signal);
      } else {
        proxyDeployed = true;
        attemptResponse = proxied as Response;
      }
    } else {
      attemptResponse = await callDirect(payload, key as string, model, input.signal);
    }

    response = attemptResponse;
    body = (await attemptResponse.json()) as GenerateResponse;

    if (attemptResponse.ok) {
      lastModelUsed = model;
      break;
    }

    const transient = attemptResponse.status === 503 || attemptResponse.status === 429;
    if (!transient || last) break;

    await new Promise((resolve) => setTimeout(resolve, 1200 * (attempt + 1)));
  }

  if (!response || !body) throw new Error("Gemini could not be reached");

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
