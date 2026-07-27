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

const PENDING_MEETING_CONTEXT_KEY = "pending_meeting_request";
const MONTH_INDEX = {
  january: 0,
  february: 1,
  march: 2,
  april: 3,
  may: 4,
  june: 5,
  july: 6,
  august: 7,
  september: 8,
  october: 9,
  november: 10,
  december: 11,
};

const extractEmails = (message) => {
  const matches = String(message || "").match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi);
  return Array.from(new Set((matches || []).map((value) => value.trim().toLowerCase())));
};

const parseMonthDate = (message, existingStart = null) => {
  const match = String(message || "").match(/\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})(?:,?\s+(\d{4}))?\b/i);
  if (!match) return existingStart ? new Date(existingStart) : null;

  const month = MONTH_INDEX[match[1].toLowerCase()];
  const day = Number(match[2]);
  const current = new Date();
  const inferredYear = match[3] ? Number(match[3]) : current.getFullYear();
  const parsed = new Date(inferredYear, month, day, 9, 0, 0, 0);
  if (!match[3] && parsed < current) {
    parsed.setFullYear(parsed.getFullYear() + 1);
  }
  return parsed;
};

const parseRelativeDate = (message, existingStart = null) => {
  const lower = String(message || "").toLowerCase();
  if (!/\btomorrow\b/.test(lower)) {
    return parseMonthDate(message, existingStart);
  }

  const base = existingStart ? new Date(existingStart) : new Date();
  base.setDate(base.getDate() + 1);
  base.setHours(9, 0, 0, 0);
  return base;
};

const normalizeHour = (rawHour, meridiem) => {
  let hour = Number(rawHour);
  if (!Number.isFinite(hour)) return null;
  const normalizedMeridiem = String(meridiem || "").toLowerCase();
  if (normalizedMeridiem === "pm" && hour < 12) hour += 12;
  if (normalizedMeridiem === "am" && hour === 12) hour = 0;
  if (hour > 23 || hour < 0) return null;
  return hour;
};

const parseTimeParts = (hourText, minuteText, meridiem) => {
  const hour = normalizeHour(hourText, meridiem);
  const minute = Number(minuteText || 0);
  if (hour == null || minute > 59 || minute < 0) return null;
  return { hour, minute };
};

const looksLikeTitleOnlyReply = (message) => {
  const text = String(message || "").trim();
  if (!text) return false;
  if (/[@]|\b(am|pm|tomorrow|today|january|february|march|april|may|june|july|august|september|october|november|december|calendar|meeting|invite|schedule|title)\b/i.test(text)) {
    return false;
  }
  return /^[\p{L}\p{N}][\p{L}\p{N}\s()'&+_.-]{1,120}$/u.test(text);
};

const buildIsoFromDateAndTime = (dateValue, timeParts) => {
  if (!dateValue || !timeParts) return null;
  const resolved = new Date(dateValue);
  resolved.setHours(timeParts.hour, timeParts.minute, 0, 0);
  return resolved.toISOString();
};

const parseMeetingTimeWindow = (message, existingStart = null, existingEnd = null) => {
  const text = String(message || "");
  const baseDate = parseRelativeDate(text, existingStart) || (existingStart ? new Date(existingStart) : null);

  const rangeMatch = text.match(/\b(?:(?:between|from)\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(?:to|-)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i);
  if (rangeMatch) {
    const startParts = parseTimeParts(rangeMatch[1], rangeMatch[2], rangeMatch[3]);
    const endParts = parseTimeParts(rangeMatch[4], rangeMatch[5], rangeMatch[6] || rangeMatch[3]);
    return {
      start: buildIsoFromDateAndTime(baseDate, startParts),
      end: buildIsoFromDateAndTime(baseDate, endParts),
    };
  }

  const exactTimeMatch = text.match(/^\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*$/i)
    || text.match(/\bat\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i)
    || text.match(/\b(\d{1,2}):(\d{2})\s*(am|pm)?\b/i)
    || text.match(/\b(\d{1,2})\s*(am|pm)\b/i);

  if (!exactTimeMatch) {
    return {
      start: existingStart,
      end: existingEnd,
    };
  }

  const startParts = parseTimeParts(exactTimeMatch[1], exactTimeMatch[2], exactTimeMatch[3]);
  const startIso = buildIsoFromDateAndTime(baseDate, startParts);
  if (!startIso) {
    return { start: existingStart, end: existingEnd };
  }

  const endIso = existingEnd && existingStart && new Date(existingStart).toDateString() === new Date(startIso).toDateString()
    ? new Date(new Date(startIso).getTime() + (new Date(existingEnd).getTime() - new Date(existingStart).getTime())).toISOString()
    : new Date(new Date(startIso).getTime() + 60 * 60 * 1000).toISOString();

  return { start: startIso, end: endIso };
};

const parseMeetingTitle = (message, existingTitle = "") => {
  const text = String(message || "").trim();
  const titleMatch = text.match(/(?:^|\b)title\s*[:=-]\s*["']?([^"'\n]+)["']?\s*$/i);
  if (titleMatch) return titleMatch[1].trim();

  const titleCommandMatch = text.match(/(?:make|set|use)?\s*the\s*title\s*(?:to|as|is)?\s*[(:-]*\s*["']?([^"'\n)]+)["']?\s*\)?\s*$/i);
  if (titleCommandMatch) return titleCommandMatch[1].trim();

  const calledMatch = text.match(/\b(?:called|named)\s+["']?([^"'\n]+)["']?\s*$/i);
  if (calledMatch) return calledMatch[1].trim();

  const wrappedTitleMatch = text.match(/^["'([]\s*([^"'()\[\]\n][^\n]*?)\s*["')]$/);
  if (wrappedTitleMatch) return wrappedTitleMatch[1].trim();

  if (!existingTitle && looksLikeTitleOnlyReply(text)) return text;

  return existingTitle || "";
};

const hasMeetingIntent = (message) => /\b(meeting|calendar|invite|event|schedule|scheduled|book|appointment|remind)\b/i.test(String(message || ""));
const hasSchedulingVerb = (message) => /\b(add|create|set up|setup|schedule|book|send)\b/i.test(String(message || ""));
const isReferenceToPriorDetails = (message) => /\b(already said|above|previous|same|that one|use that|as said)\b/i.test(String(message || ""));
const isCancellation = (message) => /\b(cancel|never mind|forget it|stop)\b/i.test(String(message || ""));

const mergeMeetingState = (current, update) => ({
  type: "meeting",
  title: update.title || current?.title || "",
  attendees: Array.from(new Set([...(current?.attendees || []), ...(update.attendees || [])])),
  start: update.start || current?.start || null,
  end: update.end || current?.end || null,
  location: update.location || current?.location || "",
  description: update.description || current?.description || "",
  explicitCreate: Boolean(update.explicitCreate || current?.explicitCreate),
  updatedAt: new Date().toISOString(),
});

const summarizeMeetingState = (meeting) => {
  if (!meeting) return "";
  const parts = [];
  if (meeting.title) parts.push(`title \"${meeting.title}\"`);
  if (meeting.start) {
    const start = new Date(meeting.start);
    const end = meeting.end ? new Date(meeting.end) : null;
    const dateText = start.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
    const timeText = start.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    const endText = end ? end.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : null;
    parts.push(endText ? `${dateText} from ${timeText} to ${endText}` : `${dateText} at ${timeText}`);
  }
  if (meeting.attendees?.length) parts.push(`invitees ${meeting.attendees.join(", ")}`);
  return parts.join(", ");
};

const getMissingMeetingFields = (meeting) => {
  const missing = [];
  if (!meeting?.title) missing.push("title");
  if (!meeting?.start) missing.push("date_time");
  return missing;
};

const buildMeetingClarificationReply = (meeting, missing) => {
  const known = summarizeMeetingState(meeting);
  const prefix = known ? `I have the meeting details so far: ${known}. ` : "";
  if (missing.includes("title") && missing.includes("date_time")) {
    return `${prefix}What title should I use, and what exact date and time should I schedule it for?`;
  }
  if (missing.includes("title")) {
    return `${prefix}What title should I use for the meeting?`;
  }
  if (missing.includes("date_time")) {
    return `${prefix}What exact date and time should I schedule it for?`;
  }
  return `${prefix}Please confirm the remaining meeting details.`;
};

const replyForCreatedMeeting = (result, meeting) => {
  const inviteNote = meeting.attendees?.length ? ` and sent the invite to ${meeting.attendees.join(", ")}` : "";
  if (result.htmlLink) {
    return `Your meeting \"${meeting.title}\" is on the calendar${inviteNote}.`;
  }
  return `I prepared the calendar event for \"${meeting.title}\"${inviteNote}, but direct calendar sync is not configured.`;
};

const interpretMeetingMessage = ({ message, pendingMeeting }) => {
  const relevant = hasMeetingIntent(message)
    || Boolean(pendingMeeting)
    || extractEmails(message).length > 0
    || Boolean(parseMeetingTitle(message, ""))
    || /^\s*(\d{1,2})(?::\d{2})?\s*(am|pm)?\s*$/i.test(String(message || ""))
    || isReferenceToPriorDetails(message);

  if (!relevant) return null;

  const timeWindow = parseMeetingTimeWindow(message, pendingMeeting?.start, pendingMeeting?.end);
  return mergeMeetingState(pendingMeeting, {
    title: parseMeetingTitle(message, pendingMeeting?.title),
    attendees: extractEmails(message),
    start: timeWindow.start,
    end: timeWindow.end,
    explicitCreate: hasSchedulingVerb(message),
  });
};

const handlePendingMeetingWorkflow = async ({ message, sessionId, userId }) => {
  const pendingMeeting = await getContext(sessionId, PENDING_MEETING_CONTEXT_KEY, userId);
  if (!pendingMeeting && !hasMeetingIntent(message) && !extractEmails(message).length && !isReferenceToPriorDetails(message)) {
    return null;
  }

  if (pendingMeeting && isCancellation(message)) {
    await saveContext(sessionId, PENDING_MEETING_CONTEXT_KEY, null, userId);
    return { success: true, reply: "I cancelled the pending meeting request.", actions: [] };
  }

  const meeting = interpretMeetingMessage({ message, pendingMeeting });
  if (!meeting) return null;

  const missing = getMissingMeetingFields(meeting);
  if (missing.length > 0 || (!meeting.explicitCreate && pendingMeeting == null)) {
    await saveContext(sessionId, PENDING_MEETING_CONTEXT_KEY, meeting, userId);
    if (!meeting.explicitCreate && pendingMeeting == null) {
      return {
        success: true,
        reply: buildMeetingClarificationReply(meeting, missing.length > 0 ? missing : ["date_time"]),
        actions: [],
      };
    }
    return {
      success: true,
      reply: buildMeetingClarificationReply(meeting, missing),
      actions: [],
    };
  }

  const calendarResult = await executeTool("calendar", {
    action: "create_event",
    title: meeting.title,
    start: meeting.start,
    end: meeting.end,
    location: meeting.location,
    description: meeting.description,
    attendees: meeting.attendees,
  }, { sessionId, userId });

  if (!calendarResult.success) {
    await saveContext(sessionId, PENDING_MEETING_CONTEXT_KEY, meeting, userId);
    return {
      success: false,
      reply: "I could not create the calendar event: " + (calendarResult.error || "unknown error"),
      actions: [],
    };
  }

  await saveContext(sessionId, PENDING_MEETING_CONTEXT_KEY, null, userId);
  return {
    success: true,
    reply: replyForCreatedMeeting(calendarResult, meeting),
    actions: [],
  };
};

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

  const pendingMeetingResult = await handlePendingMeetingWorkflow({ message, sessionId, userId });
  if (pendingMeetingResult) {
    await saveTurn(sessionId, message, pendingMeetingResult.reply, userId);
    return {
      success: Boolean(pendingMeetingResult.success),
      reply: pendingMeetingResult.reply,
      actions: pendingMeetingResult.actions || [],
      sessionId,
      timestamp: new Date().toISOString(),
      directAction: true,
    };
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

  const history = await getHistory(sessionId, 8, userId);
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
