import { createClient } from "@supabase/supabase-js";

let supabase = null;

const getSupabase = () => {
  if (supabase) return supabase;

  const url = process.env.SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

  if (
    !url ||
    !key
  ) {
    return null;
  }

  supabase = createClient(
    url,
    key
  );

  return supabase;
};

export const getSupabaseClient = () => getSupabase();

// In-memory fallback when Supabase is not configured
const memoryFallback = new Map();
const contextFallback = new Map();

const normalizeScope = (userId, sessionId) => ({
  userId: userId ? String(userId) : null,
  sessionId: String(sessionId || "default"),
});

const applyScope = (query, userId, sessionId) => {
  if (userId) {
    return query.eq("user_id", userId);
  }
  return query.eq("session_id", sessionId);
};

const parseJsonField = (value, fallback) => {
  if (value == null) return fallback;
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return fallback;
    }
  }
  return value;
};

const toVectorLiteral = (embedding) => {
  if (!Array.isArray(embedding) || embedding.length === 0) return null;
  return `[${embedding.join(",")}]`;
};

export const getHistory = async (sessionId, limit = 20, userId = null) => {
  const scope = normalizeScope(userId, sessionId);
  const sb = getSupabase();
  if (sb) {
    const { data } = await applyScope(
      sb
      .from("athina_memory")
      .select("role, content, created_at")
      , scope.userId, scope.sessionId)
      .order("created_at", { ascending: true })
      .limit(limit);
    return (data || []).map((r) => ({ role: r.role, content: r.content, createdAt: r.created_at }));
  }
  const history = memoryFallback.get(scope.userId || scope.sessionId) || [];
  return history.slice(-limit);
};

export const getDateMemoryWindow = (message, now = new Date()) => {
  const text = String(message || "").toLowerCase();
  const hasDateQuestion = /(yesterday|today|last night|last week|last month|this morning|this afternoon|last friday|last monday|yesterday morning|yesterday afternoon)/i.test(text);
  if (!hasDateQuestion) return null;

  const dateMatch = /(yesterday|today|last night|this morning|this afternoon)/i.exec(text);
  if (!dateMatch) return null;

  const base = new Date(now);
  base.setHours(0, 0, 0, 0);

  if (/yesterday/i.test(dateMatch[0])) {
    base.setDate(base.getDate() - 1);
    return {
      label: "yesterday",
      start: new Date(base),
      end: new Date(base),
    };
  }

  if (/today/i.test(dateMatch[0])) {
    return {
      label: "today",
      start: new Date(base),
      end: new Date(base),
    };
  }

  return null;
};

export const getHistoryByDateRange = async ({ sessionId, userId = null, start, end, limit = 50 }) => {
  const scope = normalizeScope(userId, sessionId);
  const sb = getSupabase();
  if (!sb) {
    const history = memoryFallback.get(scope.userId || scope.sessionId) || [];
    return history.filter((entry) => {
      const ts = new Date(entry.createdAt || Date.now()).valueOf();
      return ts >= new Date(start).valueOf() && ts <= new Date(end).valueOf();
    }).slice(-limit);
  }

  const startIso = new Date(start).toISOString();
  const endIso = new Date(end).toISOString();

  let query = sb
    .from("athina_memory")
    .select("role, content, created_at")
    .gte("created_at", startIso)
    .lte("created_at", endIso)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (scope.userId) {
    query = query.eq("user_id", scope.userId);
  } else {
    query = query.eq("session_id", scope.sessionId);
  }

  const { data } = await query;
  return (data || []).map((row) => ({ role: row.role, content: row.content, createdAt: row.created_at }));
};

export const saveTurn = async (sessionId, userMessage, assistantMessage, userId = null) => {
  const scope = normalizeScope(userId, sessionId);
  const sb = getSupabase();
  if (sb) {
    await sb.from("athina_memory").insert([
      { session_id: scope.sessionId, user_id: scope.userId, role: "user", content: userMessage },
      { session_id: scope.sessionId, user_id: scope.userId, role: "assistant", content: assistantMessage },
    ]);
  } else {
    const memoryKey = scope.userId || scope.sessionId;
    const history = memoryFallback.get(memoryKey) || [];
    memoryFallback.set(memoryKey, [
      ...history.slice(-16),
      { role: "user", content: userMessage },
      { role: "assistant", content: assistantMessage },
    ]);
  }
};

export const savePlan = async (sessionId, plan, userId = null) => {
  const scope = normalizeScope(userId, sessionId);
  const sb = getSupabase();
  if (!sb) return;
  await sb.from("athina_plans").insert([
    { session_id: scope.sessionId, user_id: scope.userId, plan: JSON.stringify(plan) },
  ]);
};

export const saveTaskResult = async (sessionId, taskId, tool, result, userId = null) => {
  const scope = normalizeScope(userId, sessionId);
  const sb = getSupabase();
  if (!sb) return;
  await sb.from("athina_task_results").insert([
    { session_id: scope.sessionId, user_id: scope.userId, task_id: taskId, tool, result: JSON.stringify(result) },
  ]);
};

export const saveContext = async (sessionId, key, value, userId = null) => {
  const scope = normalizeScope(userId, sessionId);
  const sb = getSupabase();
  if (!sb) {
    contextFallback.set(`${scope.userId || "session"}:${scope.sessionId}:${key}`, value);
    return;
  }
  await sb.from("athina_context").upsert([
    { session_id: scope.sessionId, user_id: scope.userId, key, value: JSON.stringify(value) },
  ], { onConflict: "session_id,key" });
};

export const getContext = async (sessionId, key, userId = null) => {
  const scope = normalizeScope(userId, sessionId);
  const sb = getSupabase();
  if (!sb) {
    return contextFallback.get(`${scope.userId || "session"}:${scope.sessionId}:${key}`) ?? null;
  }
  const query = sb
    .from("athina_context")
    .select("value")
    .eq("key", key)
    .limit(1);
  const { data } = await applyScope(query, scope.userId, scope.sessionId).maybeSingle();
  return data ? JSON.parse(data.value) : null;
};

export const findCachedAnswer = async ({ sessionId, userId = null, requestKey }) => {
  const scope = normalizeScope(userId, sessionId);
  const sb = getSupabase();
  if (!sb || !requestKey) return null;

  const query = sb
    .from("athina_answer_cache")
    .select("id, request_key, request_text, reply, actions, hit_count, updated_at")
    .eq("request_key", requestKey)
    .order("updated_at", { ascending: false })
    .limit(1);

  const { data } = await applyScope(query, scope.userId, scope.sessionId).maybeSingle();
  if (!data) return null;

  return {
    id: data.id,
    requestKey: data.request_key,
    requestText: data.request_text,
    reply: data.reply,
    actions: parseJsonField(data.actions, []),
    hitCount: data.hit_count || 0,
    updatedAt: data.updated_at || null,
  };
};

export const saveCachedAnswer = async ({ sessionId, userId = null, requestKey, requestText, reply, actions = [], source = "agent" }) => {
  const scope = normalizeScope(userId, sessionId);
  const sb = getSupabase();
  if (!sb || !requestKey || !reply) return null;

  const existing = await findCachedAnswer({ sessionId: scope.sessionId, userId: scope.userId, requestKey });
  const payload = {
    session_id: scope.sessionId,
    user_id: scope.userId,
    request_key: requestKey,
    request_text: requestText,
    reply,
    actions,
    source,
    updated_at: new Date().toISOString(),
  };

  if (existing?.id) {
    await sb.from("athina_answer_cache").update(payload).eq("id", existing.id);
    return existing.id;
  }

  const { data } = await sb.from("athina_answer_cache").insert([payload]).select("id").maybeSingle();
  return data?.id || null;
};

export const markCachedAnswerHit = async (entry) => {
  const sb = getSupabase();
  if (!sb || !entry?.id) return;
  await sb.from("athina_answer_cache").update({
    hit_count: Number(entry.hitCount || 0) + 1,
    updated_at: new Date().toISOString(),
  }).eq("id", entry.id);
};

export const saveMemoryEmbedding = async ({ sessionId, userId = null, source = "conversation", content, metadata = {}, embedding }) => {
  const scope = normalizeScope(userId, sessionId);
  const sb = getSupabase();
  const vector = toVectorLiteral(embedding);
  if (!sb || !vector || !content) return;

  await sb.from("athina_memory_embeddings").insert([
    {
      session_id: scope.sessionId,
      user_id: scope.userId,
      source,
      content,
      metadata,
      embedding: vector,
    },
  ]);
};

export const searchMemoryEmbeddings = async ({ sessionId, userId = null, embedding, limit = 5, minSimilarity = 0.72 }) => {
  const scope = normalizeScope(userId, sessionId);
  const sb = getSupabase();
  const vector = toVectorLiteral(embedding);
  if (!sb || !vector) return [];

  const { data } = await sb.rpc("match_athina_memories", {
    query_embedding_input: vector,
    filter_user_id: scope.userId,
    filter_session_id: scope.userId ? null : scope.sessionId,
    match_count: limit,
  });

  return (data || [])
    .filter((row) => Number(row.similarity || 0) >= minSimilarity)
    .map((row) => ({
      id: row.id,
      content: row.content,
      source: row.source,
      similarity: Number(row.similarity || 0),
      metadata: parseJsonField(row.metadata, {}),
    }));
};

export const saveValidationReport = async ({ sessionId, userId = null, fileName, proposalStoragePath = null, result }) => {
  const scope = normalizeScope(userId, sessionId);
  const sb = getSupabase();
  if (!sb || !result) return null;

  const { data } = await sb.from("athina_validation_reports").insert([
    {
      session_id: scope.sessionId,
      user_id: scope.userId,
      proposal_name: fileName,
      proposal_storage_path: proposalStoragePath,
      result,
    },
  ]).select("id").maybeSingle();

  return data?.id || null;
};

export const saveAuditLog = async (event) => {
  const sb = getSupabase();
  if (!sb) return;

  const payload = {
    request_id: event.requestId || null,
    session_id: event.sessionId || null,
    actor_id: event.actorId || null,
    endpoint: event.endpoint || null,
    event_type: event.eventType || "event",
    status: event.status || null,
    latency_ms: Number.isFinite(event.latencyMs) ? event.latencyMs : null,
    metadata: event.metadata || {},
    created_at: event.createdAt || new Date().toISOString(),
  };

  await sb.from("athina_audit_logs").insert([payload]);
};