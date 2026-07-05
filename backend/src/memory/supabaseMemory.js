import { createClient } from "@supabase/supabase-js";

// Private Supabase project (hardcoded defaults, overridable by env vars)
const SUPABASE_URL = process.env.SUPABASE_URL || "https://mehcuixkxkbnebjezcwo.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "sb_publishable_LHvc6k-9W16OTc4O8lHIkQ_uiSm6BhM";

let supabase = null;

const getSupabase = () => {
  if (supabase) return supabase;
  if (!SUPABASE_URL || !SUPABASE_KEY) return null;
  supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  return supabase;
};

// In-memory fallback when Supabase is not configured
const memoryFallback = new Map();

export const getHistory = async (sessionId, limit = 20) => {
  const sb = getSupabase();
  if (sb) {
    const { data } = await sb
      .from("athina_memory")
      .select("role, content")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true })
      .limit(limit);
    return (data || []).map((r) => ({ role: r.role, content: r.content }));
  }
  const history = memoryFallback.get(sessionId) || [];
  return history.slice(-limit);
};

export const saveTurn = async (sessionId, userMessage, assistantMessage) => {
  const sb = getSupabase();
  if (sb) {
    await sb.from("athina_memory").insert([
      { session_id: sessionId, role: "user", content: userMessage },
      { session_id: sessionId, role: "assistant", content: assistantMessage },
    ]);
  } else {
    const history = memoryFallback.get(sessionId) || [];
    memoryFallback.set(sessionId, [
      ...history.slice(-16),
      { role: "user", content: userMessage },
      { role: "assistant", content: assistantMessage },
    ]);
  }
};

export const savePlan = async (sessionId, plan) => {
  const sb = getSupabase();
  if (!sb) return;
  await sb.from("athina_plans").insert([
    { session_id: sessionId, plan: JSON.stringify(plan) },
  ]);
};

export const saveTaskResult = async (sessionId, taskId, tool, result) => {
  const sb = getSupabase();
  if (!sb) return;
  await sb.from("athina_task_results").insert([
    { session_id: sessionId, task_id: taskId, tool, result: JSON.stringify(result) },
  ]);
};

export const saveContext = async (sessionId, key, value) => {
  const sb = getSupabase();
  if (!sb) return;
  await sb.from("athina_context").upsert([
    { session_id: sessionId, key, value: JSON.stringify(value) },
  ], { onConflict: "session_id,key" });
};

export const getContext = async (sessionId, key) => {
  const sb = getSupabase();
  if (!sb) return null;
  const { data } = await sb
    .from("athina_context")
    .select("value")
    .eq("session_id", sessionId)
    .eq("key", key)
    .single();
  return data ? JSON.parse(data.value) : null;
};