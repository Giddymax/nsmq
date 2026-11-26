import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function fingerprint(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function constantTimeEqual(left: string, right: string) {
  const length = Math.max(left.length, right.length);
  let difference = left.length ^ right.length;
  for (let index = 0; index < length; index += 1) {
    difference |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return difference === 0;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return jsonResponse({ error: "METHOD_NOT_ALLOWED" }, 405);

  let password: unknown;
  try {
    ({ password } = await request.json());
  } catch {
    return jsonResponse({ error: "INVALID_REQUEST" }, 400);
  }
  if (typeof password !== "string" || password.length > 128) {
    return jsonResponse({ error: "INVALID_REQUEST" }, 400);
  }

  const resetPassword = Deno.env.get("QUIZ_RESET_PASSWORD");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!resetPassword || !supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: "RESET_NOT_CONFIGURED" }, 503);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const clientAddress = request.headers.get("cf-connecting-ip")
    ?? request.headers.get("x-real-ip")
    ?? request.headers.get("x-forwarded-for")?.split(",")[0].trim()
    ?? "unknown";
  const clientFingerprint = await fingerprint(clientAddress);
  const { data: allowed, error: rateLimitError } = await supabase.rpc(
    "consume_quiz_reset_attempt",
    { p_client_fingerprint: clientFingerprint },
  );
  if (rateLimitError) {
    console.error("Reset rate-limit schema is unavailable:", rateLimitError);
    return jsonResponse({ error: "RESET_SCHEMA_NOT_APPLIED" }, 503);
  }
  if (!allowed) return jsonResponse({ error: "TOO_MANY_ATTEMPTS" }, 429);
  if (!constantTimeEqual(password, resetPassword)) {
    return jsonResponse({ error: "INCORRECT_PASSWORD" }, 401);
  }

  const { error: resetError } = await supabase.rpc("reset_quiz_entries");
  if (resetError) {
    console.error("Could not reset quiz entries:", resetError);
    return jsonResponse({ error: "RESET_SCHEMA_NOT_APPLIED" }, 503);
  }

  await supabase
    .from("quiz_reset_attempts")
    .delete()
    .eq("client_fingerprint", clientFingerprint);
  return jsonResponse({ success: true });
});
