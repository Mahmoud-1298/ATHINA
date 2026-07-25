import {
  findCachedAnswer,
  getContext,
  getHistory,
  markCachedAnswerHit,
  saveCachedAnswer,
  saveContext,
  saveMemoryEmbedding,
  savePlan,
  saveTaskResult,
  saveTurn,
  searchMemoryEmbeddings,
} from "./memory/supabaseMemory.js";
import { plan } from "./planner.js";
import { execute as executeTasks } from "./executionEngine.js";
import { executeTool } from "./tools/index.js";
import { validatePlan, validateTasks, checkSafety } from "./ruleEngine.js";
import { getQuickReply, buildCompactExecutionReply } from "./llmManager.js";
import { getEmbedding } from "./utils/embeddingClient.js";

const normalizeCacheText = (text) =>
  String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);

const buildLocationContext = async (sessionId, locationContext, userId) => {
  const fallbackContext = locationContext || (await getContext(sessionId, "map_context", userId));
  if (!fallbackContext || typeof fallbackContext.lat !== "number" || typeof fallbackContext.lng !== "number") return "";

  return [
    "Active map context:",
    "- name: " + (fallbackContext.name || "selected location"),
    "- latitude: " + fallbackContext.lat,
    "- longitude: " + fallbackContext.lng,
    fallbackContext.query ? "- source: " + fallbackContext.query : "",
  ].filter(Boolean).join("\n");
};

const buildRequestKey = (message, locationNote) => normalizeCacheText([message, locationNote].filter(Boolean).join("\n"));

const parseTomorrowTimeWindow = (message) => {
  const match = String(message || "").match(/tomorrow(?:\s+at)?\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  if (!match) return null;

  let hour = Number(match[1]);
  const minute = Number(match[2] || 0);
  const meridiem = (match[3] || "").toLowerCase();

  if (meridiem === "pm" && hour < 12) hour += 12;
  if (meridiem === "am" && hour === 12) hour = 0;
  if (hour > 23 || minute > 59) return null;

  const now = new Date();
  const start = new Date(now);
  start.setDate(now.getDate() + 1);
  start.setHours(hour, minute, 0, 0);
  const end = new Date(start.getTime() + 60 * 60 * 1000);

  return {
    start: start.toISOString(),
    end: end.toISOString(),
    label: `tomorrow at ${start.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`,
  };
};

const buildEmailFromReply = (fromHeader = "") => {
  const emailMatch = String(fromHeader).match(/<([^>]+)>/);
  return {
    fromHeader,
    fromEmail: emailMatch ? emailMatch[1] : fromHeader,
  };
};

const summarizeMessageBody = (message) => {
  const text = String(message?.body || message?.snippet || "").replace(/\s+/g, " ").trim();
  if (!text) return "I found the latest email, but it has no readable text body.";
  return text.length > 420 ? text.slice(0, 420) + "..." : text;
};

const handleProductivityIntents = async ({ message, sessionId, userId }) => {
  const text = String(message || "").toLowerCase();
  const context = { sessionId, userId };

  const asksLastEmail = /last email|latest email/.test(text);
  const asksWhoFrom = asksLastEmail && /who.*from|from who/.test(text);
  const asksSummary = asksLastEmail && /summar|summary/.test(text);

  if (asksWhoFrom || asksSummary) {
    const listed = await executeTool("email", {
      action: "list",
      provider: "google",
      maxResults: 1,
      query: "in:inbox",
    }, context);

    if (!listed.success) {
      return { success: false, reply: "I could not read your inbox: " + (listed.error || "unknown error"), actions: [] };
    }

    const latest = Array.isArray(listed.messages) ? listed.messages[0] : null;
    if (!latest) {
      return { success: true, reply: "Your inbox appears empty right now.", actions: [] };
    }

    if (asksWhoFrom) {
      const parsedFrom = buildEmailFromReply(latest.from);
      return {
        success: true,
        reply: `Your latest email is from ${parsedFrom.fromEmail}. Subject: ${latest.subject || "(no subject)"}.`,
        actions: [],
      };
    }

    const fullMessage = await executeTool("email", {
      action: "read",
      provider: "google",
      messageId: latest.id,
    }, context);

    if (!fullMessage.success) {
      return { success: false, reply: "I found your latest email but could not open it: " + (fullMessage.error || "unknown error"), actions: [] };
    }

    const subject = fullMessage.message?.subject || latest.subject || "(no subject)";
    const summary = summarizeMessageBody(fullMessage.message || latest);
    return {
      success: true,
      reply: `Summary of your latest email (${subject}): ${summary}`,
      actions: [],
    };
  }

  const asksCalendarCheck = /calendar/.test(text) && /(check|anything|do i have|what.*(event|meeting)|free|available)/.test(text);
  if (asksCalendarCheck) {
    const window = parseTomorrowTimeWindow(message);
    if (!window) return null;

    const availability = await executeTool("calendar", {
      action: "check_availability",
      start: window.start,
      end: window.end,
    }, context);

    if (!availability.success) {
      return { success: false, reply: "I could not check your calendar: " + (availability.error || "unknown error"), actions: [] };
    }

    if (availability.isFree) {
      return {
        success: true,
        reply: `You have no events at ${window.label}.`,
        actions: [],
      };
    }

    const events = await executeTool("calendar", {
      action: "list_events",
      timeMin: window.start,
      timeMax: window.end,
      maxResults: 10,
    }, context);

    const titles = (events.events || []).map((event) => event.title).filter(Boolean);
    const eventSummary = titles.length ? titles.join(", ") : "one or more busy slots";
    return {
      success: true,
      reply: `You do have events at ${window.label}: ${eventSummary}.`,
      actions: [],
    };
  }

  return null;
};

const buildMemoryNote = (memories) => {
  if (!Array.isArray(memories) || memories.length === 0) return "";
  return [
    "Relevant prior conversation memory:",
    ...memories.slice(0, 3).map((memory, index) => `${index + 1}. ${memory.content}`),
  ].join("\n");
};

const loadRelevantMemories = async ({ message, locationNote, userId, sessionId }) => {
  try {
    const embedding = await getEmbedding([message, locationNote].filter(Boolean).join("\n"));
    if (!embedding) return [];
    return await searchMemoryEmbeddings({ sessionId, userId, embedding, limit: 4, minSimilarity: 0.74 });
  } catch (error) {
    console.warn("[ATHINA] Semantic memory lookup skipped:", error.message);
    return [];
  }
};

const persistReusableMemory = async ({ sessionId, userId, message, reply, tasks = [], actions = [], requestKey, source }) => {
  await saveCachedAnswer({
    sessionId,
    userId,
    requestKey,
    requestText: message,
    reply,
    actions,
    source,
  });

  try {
    const embedding = await getEmbedding(`User: ${message}\nAssistant: ${reply}`);
    if (embedding) {
      await saveMemoryEmbedding({
        sessionId,
        userId,
        source: "conversation",
        content: `User: ${message}\nAssistant: ${reply}`,
        metadata: { tasksCount: tasks.length, source },
        embedding,
      });
    }
  } catch (error) {
    console.warn("[ATHINA] Semantic memory persistence skipped:", error.message);
  }
};

export const orchestrate = async ({ message, sessionId = "default", userId = null, mode = "text", locationContext = null }) => {
  const safety = checkSafety(message);
  if (!safety.safe) return { success: false, reply: "I cannot process this request: " + safety.reason, actions: [], sessionId, timestamp: new Date().toISOString() };
  if (locationContext && typeof locationContext.lat === "number" && typeof locationContext.lng === "number") {
    await saveContext(sessionId, "map_context", locationContext, userId);
  }
  const quickReply = getQuickReply(message);
  const locationNote = await buildLocationContext(sessionId, locationContext, userId);
  const requestKey = buildRequestKey(message, locationNote);
  if (quickReply) {
    await saveTurn(sessionId, message, quickReply.reply, userId);
    await persistReusableMemory({ sessionId, userId, message, reply: quickReply.reply, requestKey, source: "quick_reply" });
    return { success: true, reply: quickReply.reply, actions: [], sessionId, timestamp: new Date().toISOString(), quickReply: true };
  }

  const productivityIntentResult = await handleProductivityIntents({ message, sessionId, userId });
  if (productivityIntentResult) {
    await saveTurn(sessionId, message, productivityIntentResult.reply, userId);
    await persistReusableMemory({
      sessionId,
      userId,
      message,
      reply: productivityIntentResult.reply,
      actions: productivityIntentResult.actions || [],
      requestKey,
      source: "direct_productivity",
    });
    return {
      success: Boolean(productivityIntentResult.success),
      reply: productivityIntentResult.reply,
      actions: productivityIntentResult.actions || [],
      sessionId,
      timestamp: new Date().toISOString(),
      directAction: true,
    };
  }

  const cachedAnswer = await findCachedAnswer({ sessionId, userId, requestKey });
  if (cachedAnswer) {
    await markCachedAnswerHit(cachedAnswer);
    await saveTurn(sessionId, message, cachedAnswer.reply, userId);
    return {
      success: true,
      reply: cachedAnswer.reply,
      actions: Array.isArray(cachedAnswer.actions) ? cachedAnswer.actions : [],
      sessionId,
      timestamp: new Date().toISOString(),
      cachedReply: true,
    };
  }

  const history = await getHistory(sessionId, 4, userId);
  const relevantMemories = await loadRelevantMemories({ message, locationNote, userId, sessionId });
  const memoryNote = buildMemoryNote(relevantMemories);
  const planResult = await plan({ message, history, locationNote, memoryNote });
  if (!planResult.requiresPlanning) {
    const reply = planResult.reply || "I am here. How can I help?";
    await saveTurn(sessionId, message, reply, userId);
    await persistReusableMemory({ sessionId, userId, message, reply, requestKey, source: "planner_reply" });
    return { success: true, reply, actions: [], sessionId, timestamp: new Date().toISOString() };
  }
  const tasks = planResult.tasks || [];
  const taskValidation = validateTasks(tasks);
  if (!taskValidation.valid) {
    const reply = "I cannot execute these tasks: " + taskValidation.violations.join("; ");
    await saveTurn(sessionId, message, reply, userId);
    return { success: false, reply, actions: [], sessionId, timestamp: new Date().toISOString() };
  }
  await savePlan(sessionId, { goal: planResult.goal, steps: planResult.steps, tasks }, userId);
  const { executed } = await executeTasks(tasks, {
    saveTaskResult: (taskSessionId, taskId, tool, result) => saveTaskResult(taskSessionId, taskId, tool, result, userId),
    sessionId,
    userId,
  });
  const finalReply = await buildCompactExecutionReply(executed);
  await saveTurn(sessionId, message, finalReply, userId);
  const actions = mapToActions(executed);
  await persistReusableMemory({ sessionId, userId, message, reply: finalReply, tasks: executed, actions, requestKey, source: "task_execution" });
  return { success: true, reply: finalReply, actions, sessionId, timestamp: new Date().toISOString(), plan: { goal: planResult.goal, steps: planResult.steps }, tasks: executed.map((t) => ({ id: t.id, tool: t.tool, description: t.description, success: t.result && t.result.success })) };
};

const mapToActions = (executed) => {
  const actions = [];
  for (const task of executed) {
    if (!task.result || !task.result.success) continue;
    if (task.result.type === "locate") { actions.push(task.result); }
    else if (task.result.type === "web_search") { actions.push({ type: "browse", query: task.result.query, success: true, summary: task.result.summary, sources: task.result.results, fetchedAt: new Date().toISOString() }); }
  }
  return actions;
};
