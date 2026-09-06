/**
 * Gemini proxy.
 *
 * The app used to hold the API key, which meant anyone who installed it could
 * extract the key from the bundle and spend the quota. The key now lives here
 * as a Supabase secret and never reaches a device.
 *
 * The function also does the two things a client-held key could never do:
 * refuse anonymous callers, and cap how much any one account can spend.
 *
 *   supabase functions deploy gemini --project-ref <ref>
 *   supabase secrets set GEMINI_API_KEY=... --project-ref <ref>
 */

import { createClient } from "jsr:@supabase/supabase-js@2";

const MODEL = Deno.env.get("GEMINI_MODEL") ?? "gemini-flash-latest";
const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

/** Per-account ceiling, so one user cannot drain the shared free tier. */
const DAILY_LIMIT = 40;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) return json({ error: "The assistant is not configured on the server." }, 500);

  // Only signed-in users. An open proxy is someone else's free API key.
  const authHeader = req.headers.get("Authorization") ?? "";
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return json({ error: "Sign in to use the assistant." }, 401);

  // Best-effort rate limit. If the table is missing the request still goes
  // through — a counter failing should not take the assistant down with it.
  try {
    const today = new Date().toISOString().slice(0, 10);
    const { data: usage } = await supabase
      .from("ai_usage")
      .select("calls")
      .eq("user_id", auth.user.id)
      .eq("day", today)
      .maybeSingle();

    if ((usage?.calls ?? 0) >= DAILY_LIMIT) {
      return json(
        { error: "You have reached today's limit for the assistant. It resets tomorrow." },
        429,
      );
    }

    await supabase.rpc("bump_ai_usage");
  } catch {
    // Counter unavailable — proceed rather than fail closed on a metric.
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Malformed request" }, 400);
  }

  const upstream = await fetch(`${ENDPOINT}/${MODEL}:generateContent?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const text = await upstream.text();
  return new Response(text, {
    status: upstream.status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
});
