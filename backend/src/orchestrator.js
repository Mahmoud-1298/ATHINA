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
import {
  executeTool,
  getToolActionPolicy,
} from "./tools/index.js";
import {
  validateTasks,
  checkSafety,
} from "./ruleEngine.js";
import {
  getQuickReply,
  buildCompactExecutionReply,
} from "./llmManager.js";
import { getEmbedding } from "./utils/embeddingClient.js";

/* =========================================================
   GENERAL HELPERS
   ========================================================= */

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

/* =========================================================
   GLOBAL CONTROL AND INTENT DETECTION
   ========================================================= */

/**
 * Detects an explicit instruction to cancel/reset the current workflow.
 */
const isCancellation = (message) =>
  /\b(cancel|cancel that|cancel it|never mind|nevermind|forget|forget it|stop|start over|start again|start from beginning|reset|clear that)\b/i.test(
    String(message || "")
  );

/**
 * Detects a request to treat the next/current turn as independent
 * from any previous pending workflow.
 */
const requestsNewContext = (message) =>
  /\b(new request|new task|different request|different task|treat this as a new request|ignore previous|ignore the previous|forget previous|forget the previous|start fresh|fresh request|change topic)\b/i.test(
    String(message || "")
  );

/**
 * Explicit email-related intent.
 *
 * An email address alone is not sufficient. The user must mention an
 * email action or inbox operation.
 */
const hasEmailIntent = (message) => {
  const text = String(message || "").toLowerCase();

  const emailNoun = /\b(email|e-mail|mail|inbox|message)\b/i.test(text);

  const emailAction =
    /\b(send|write|draft|compose|reply|respond|forward|read|check|open|summarize|summarise|summary|list)\b/i.test(
      text
    );

  const directPhrases =
    /\b(last email|latest email|email me|send it by email|send an email|send email|draft an email|write an email|compose an email)\b/i.test(
      text
    );

  return directPhrases || (emailNoun && emailAction);
};

/**
 * Broad detection used only to determine whether meeting concepts
 * are mentioned. This must not, on its own, start a meeting workflow.
 */
const hasMeetingObject = (message) =>
  /\b(meeting|calendar event|calendar invite|appointment|calendar|event)\b/i.test(
    String(message || "")
  );

/**
 * Detects a genuine creation/scheduling action.
 *
 * "Send" is intentionally excluded because "send an email" previously
 * caused the meeting workflow to activate.
 */
const hasMeetingCreationVerb = (message) =>
  /\b(schedule|book|create|add|set up|setup|arrange|organize|organise)\b/i.test(
    String(message || "")
  );

/**
 * A meeting workflow can only start when a meeting/calendar object
 * and a scheduling action are both present.
 */
const hasExplicitMeetingIntent = (message) =>
  hasMeetingObject(message) && hasMeetingCreationVerb(message);

/**
 * References to details supplied earlier in an active workflow.
 */
const isReferenceToPriorDetails = (message) =>
  /\b(already said|already above|mentioned above|details above|previous details|same details|same time|same date|same attendee|same attendees|that one|use that|as said|as mentioned|i told you|told you already|told you above)\b/i.test(
    String(message || "")
  );

/**
 * Action and live-data requests must never use cached answers.
 */
const isActionOrLiveDataRequest = (message) =>
  /\b(send|write|draft|compose|reply|forward|create|update|edit|modify|delete|remove|schedule|book|cancel|read|open|latest|current|check|summarize my|summarise my|list my|find my|search my)\b/i.test(
    String(message || "")
  );

const isVagueAcknowledgement = (
  message
) =>
  /^\s*(ok|okay|alright|sure|yes|yep|yeah|i told you already above|as mentioned|same as above)\s*!*\s*$/i.test(
    String(message || "")
  );

const hasExplicitWriteConfirmation = (
  message
) =>
  /\b(yes|yep|confirm|confirmed|go ahead|proceed|do it|create it|schedule it|book it|send it|add it|make it)\b/i.test(
    String(message || "")
  );

const hasExplicitWriteIntent = (
  message
) =>
  /\b(send|create|schedule|book|add|set up|setup|arrange|organize|organise|update|delete|remove|cancel)\b/i.test(
    String(message || "")
  );

const isWriteTask = (task) => {
  const action = String(
    task?.params?.action || "default"
  )
    .trim()
    .toLowerCase();

  const policy = getToolActionPolicy(
    task?.tool,
    action
  );

  return (
    policy.risk === "write" ||
    policy.risk === "high"
  );
};

/* =========================================================
   EMAIL EXTRACTION
   ========================================================= */

const extractEmails = (message) => {
  const matches = String(message || "").match(
    /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi
  );

  return Array.from(
    new Set(
      (matches || []).map((value) =>
        value.trim().toLowerCase()
      )
    )
  );
};

/* =========================================================
   MEETING DATE AND TIME PARSING
   ========================================================= */

const parseMonthDate = (message, existingStart = null) => {
  const text = String(message || "");

  const monthDayMatch = text.match(
    /\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})(?:,?\s+(\d{4}))?\b/i
  );

  const dayMonthMatch = text.match(
    /\b(\d{1,2})(?:st|nd|rd|th)?\s+(january|february|march|april|may|june|july|august|september|october|november|december)(?:,?\s+(\d{4}))?\b/i
  );

  const match = monthDayMatch || dayMonthMatch;

  if (!match) {
    return existingStart ? new Date(existingStart) : null;
  }

  const month = monthDayMatch
    ? MONTH_INDEX[match[1].toLowerCase()]
    : MONTH_INDEX[match[2].toLowerCase()];

  const day = monthDayMatch
    ? Number(match[2])
    : Number(match[1]);

  const current = new Date();
  const inferredYear = match[3]
    ? Number(match[3])
    : current.getFullYear();

  const parsed = new Date(
    inferredYear,
    month,
    day,
    9,
    0,
    0,
    0
  );

  if (!match[3] && parsed < current) {
    parsed.setFullYear(parsed.getFullYear() + 1);
  }

  return parsed;
};

const parseRelativeDate = (
  message,
  existingStart = null
) => {
  const lower = String(message || "").toLowerCase();

  if (!/\btomorrow\b/.test(lower)) {
    return parseMonthDate(message, existingStart);
  }

  const base = existingStart
    ? new Date(existingStart)
    : new Date();

  base.setDate(base.getDate() + 1);
  base.setHours(9, 0, 0, 0);

  return base;
};

const normalizeHour = (rawHour, meridiem) => {
  let hour = Number(rawHour);

  if (!Number.isFinite(hour)) return null;

  const normalizedMeridiem = String(
    meridiem || ""
  ).toLowerCase();

  if (normalizedMeridiem === "pm" && hour < 12) {
    hour += 12;
  }

  if (normalizedMeridiem === "am" && hour === 12) {
    hour = 0;
  }

  if (hour > 23 || hour < 0) return null;

  return hour;
};

const parseTimeParts = (
  hourText,
  minuteText,
  meridiem
) => {
  const hour = normalizeHour(hourText, meridiem);
  const minute = Number(minuteText || 0);

  if (
    hour == null ||
    minute > 59 ||
    minute < 0
  ) {
    return null;
  }

  return { hour, minute };
};

const buildIsoFromDateAndTime = (
  dateValue,
  timeParts
) => {
  if (!dateValue || !timeParts) return null;

  const resolved = new Date(dateValue);

  resolved.setHours(
    timeParts.hour,
    timeParts.minute,
    0,
    0
  );

  return resolved.toISOString();
};

const parseMeetingTimeWindow = (
  message,
  existingStart = null,
  existingEnd = null
) => {
  const text = String(message || "");

  const baseDate =
    parseRelativeDate(text, existingStart) ||
    (existingStart ? new Date(existingStart) : null);

  const rangeMatch = text.match(
    /\b(?:(?:between|from)\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(?:to|-)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i
  );

  if (rangeMatch) {
    const startParts = parseTimeParts(
      rangeMatch[1],
      rangeMatch[2],
      rangeMatch[3]
    );

    const endParts = parseTimeParts(
      rangeMatch[4],
      rangeMatch[5],
      rangeMatch[6] || rangeMatch[3]
    );

    return {
      start: buildIsoFromDateAndTime(
        baseDate,
        startParts
      ),
      end: buildIsoFromDateAndTime(
        baseDate,
        endParts
      ),
    };
  }

  const exactTimeMatch =
    text.match(
      /^\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*$/i
    ) ||
    text.match(
      /\bat\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i
    ) ||
    text.match(
      /\b(\d{1,2}):(\d{2})\s*(am|pm)?\b/i
    ) ||
    text.match(
      /\b(\d{1,2})\s*(am|pm)\b/i
    );

  if (!exactTimeMatch) {
    return {
      start: existingStart,
      end: existingEnd,
    };
  }

  const startParts = parseTimeParts(
    exactTimeMatch[1],
    exactTimeMatch[2],
    exactTimeMatch[3]
  );

  const startIso = buildIsoFromDateAndTime(
    baseDate,
    startParts
  );

  if (!startIso) {
    return {
      start: existingStart,
      end: existingEnd,
    };
  }

  const sameExistingDate =
    existingEnd &&
    existingStart &&
    new Date(existingStart).toDateString() ===
      new Date(startIso).toDateString();

  const endIso = sameExistingDate
    ? new Date(
        new Date(startIso).getTime() +
          (new Date(existingEnd).getTime() -
            new Date(existingStart).getTime())
      ).toISOString()
    : new Date(
        new Date(startIso).getTime() +
          60 * 60 * 1000
      ).toISOString();

  return {
    start: startIso,
    end: endIso,
  };
};

const containsMeetingDateOrTime = (message) => {
  const text = String(message || "");

  return (
    /\b(today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i.test(
      text
    ) ||
    /\b(january|february|march|april|may|june|july|august|september|october|november|december)\b/i.test(
      text
    ) ||
    /\b\d{1,2}(?::\d{2})?\s*(am|pm)\b/i.test(
      text
    ) ||
    /\bat\s+\d{1,2}(?::\d{2})?\b/i.test(text)
  );
};

/* =========================================================
   MEETING TITLE PARSING
   ========================================================= */

const looksLikeTitleOnlyReply = (message) => {
  const text = String(message || "").trim();

  if (!text || text.length > 120) return false;

  if (
    /[@]|\b(am|pm|tomorrow|today|january|february|march|april|may|june|july|august|september|october|november|december|calendar|meeting|invite|schedule|email|mail|inbox|send|summarize|summarise|cancel|forget|reset)\b/i.test(
      text
    )
  ) {
    return false;
  }

  return /^[\p{L}\p{N}][\p{L}\p{N}\s()'&+_.-]{1,120}$/u.test(
    text
  );
};

/**
 * allowTitleOnly must only be true when a meeting already exists
 * and its missing field is the title.
 */
const parseMeetingTitle = (
  message,
  existingTitle = "",
  allowTitleOnly = false
) => {
  const text = String(message || "").trim();

  const titledParenMatch = text.match(
    /\btitle\s*\(\s*([^\n)]+?)\s*\)/i
  );

  if (titledParenMatch) {
    return titledParenMatch[1].trim();
  }

  const titleMatch = text.match(
    /(?:^|\b)title\s*[:=-]\s*["']?([^"'\n]+)["']?\s*$/i
  );

  if (titleMatch) {
    return titleMatch[1].trim();
  }

  const titleCommandMatch = text.match(
    /(?:make|set|use)?\s*the\s*title\s*(?:to|as|is)?\s*[(:-]*\s*["']?([^"'\n)]+)["']?\s*\)?\s*$/i
  );

  if (titleCommandMatch) {
    return titleCommandMatch[1].trim();
  }

  const calledMatch = text.match(
    /\b(?:called|named)\s+["']?([^"'\n]+)["']?\s*$/i
  );

  if (calledMatch) {
    return calledMatch[1].trim();
  }

  const wrappedTitleMatch = text.match(
    /^["'([]\s*([^"'()\[\]\n][^\n]*?)\s*["')]$/
  );

  if (wrappedTitleMatch && allowTitleOnly) {
    return wrappedTitleMatch[1].trim();
  }

  if (
    allowTitleOnly &&
    !existingTitle &&
    looksLikeTitleOnlyReply(text)
  ) {
    return text;
  }

  return existingTitle || "";
};

/* =========================================================
   MEETING STATE
   ========================================================= */

const mergeMeetingState = (current, update) => ({
  type: "meeting",
  title: update.title || current?.title || "",
  attendees: Array.from(
    new Set([
      ...(current?.attendees || []),
      ...(update.attendees || []),
    ])
  ),
  start: update.start || current?.start || null,
  end: update.end || current?.end || null,
  location:
    update.location || current?.location || "",
  description:
    update.description || current?.description || "",
  explicitCreate: Boolean(
    update.explicitCreate ||
      current?.explicitCreate
  ),
  updatedAt: new Date().toISOString(),
});

const summarizeMeetingState = (meeting) => {
  if (!meeting) return "";

  const parts = [];

  if (meeting.title) {
    parts.push(`title "${meeting.title}"`);
  }

  if (meeting.start) {
    const start = new Date(meeting.start);
    const end = meeting.end
      ? new Date(meeting.end)
      : null;

    const dateText = start.toLocaleDateString(
      [],
      {
        month: "short",
        day: "numeric",
        year: "numeric",
      }
    );

    const timeText = start.toLocaleTimeString(
      [],
      {
        hour: "numeric",
        minute: "2-digit",
      }
    );

    const endText = end
      ? end.toLocaleTimeString([], {
          hour: "numeric",
          minute: "2-digit",
        })
      : null;

    parts.push(
      endText
        ? `${dateText} from ${timeText} to ${endText}`
        : `${dateText} at ${timeText}`
    );
  }

  if (meeting.attendees?.length) {
    parts.push(
      `invitees ${meeting.attendees.join(", ")}`
    );
  }

  return parts.join(", ");
};

const getMissingMeetingFields = (meeting) => {
  const missing = [];

  if (!meeting?.title) {
    missing.push("title");
  }

  if (!meeting?.start) {
    missing.push("date_time");
  }

  return missing;
};

const buildMeetingClarificationReply = (
  meeting,
  missing
) => {
  const known = summarizeMeetingState(meeting);

  const prefix = known
    ? `I have the meeting details so far: ${known}. `
    : "";

  if (
    missing.includes("title") &&
    missing.includes("date_time")
  ) {
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

const replyForCreatedMeeting = (
  result,
  meeting
) => {
  const inviteNote = meeting.attendees?.length
    ? ` and sent the invite to ${meeting.attendees.join(", ")}`
    : "";

  if (result.htmlLink) {
    return `Your meeting "${meeting.title}" is on the calendar${inviteNote}.`;
  }

  return `I prepared the calendar event for "${meeting.title}"${inviteNote}, but direct calendar sync is not configured.`;
};

/**
 * Determines whether a message genuinely continues the active
 * pending meeting workflow.
 */
const isMeetingContinuation = (
  message,
  pendingMeeting
) => {
  if (!pendingMeeting) return false;

  if (hasExplicitMeetingIntent(message)) {
    return true;
  }

  if (hasEmailIntent(message)) {
    return false;
  }

  if (requestsNewContext(message)) {
    return false;
  }

  if (isReferenceToPriorDetails(message)) {
    return true;
  }

  if (containsMeetingDateOrTime(message)) {
    return true;
  }

  const missing =
    getMissingMeetingFields(pendingMeeting);

  if (
    missing.includes("title") &&
    looksLikeTitleOnlyReply(message)
  ) {
    return true;
  }

  if (
    extractEmails(message).length > 0 &&
    /\b(invite|attendee|attendees|participant|participants|add to meeting|add to calendar)\b/i.test(
      String(message || "")
    )
  ) {
    return true;
  }

  return false;
};

const isVagueFollowUp = (message) => {
  const text = String(message || "").trim().toLowerCase();
  if (!text) return false;

  if (text.length > 80) return false;

  return /\b(already|above|as i said|as mentioned|same details|same time|same date|i told you)\b/.test(
    text
  );
};

const interpretMeetingMessage = ({
  message,
  pendingMeeting,
}) => {
  const isNewMeeting =
    hasExplicitMeetingIntent(message);

  const isContinuation = isMeetingContinuation(
    message,
    pendingMeeting
  );

  if (!isNewMeeting && !isContinuation) {
    return null;
  }

  const currentMissing =
    getMissingMeetingFields(pendingMeeting);

  const allowTitleOnly =
    Boolean(pendingMeeting) &&
    currentMissing.includes("title");

  const timeWindow = parseMeetingTimeWindow(
    message,
    pendingMeeting?.start,
    pendingMeeting?.end
  );

  return mergeMeetingState(pendingMeeting, {
    title: parseMeetingTitle(
      message,
      pendingMeeting?.title,
      allowTitleOnly
    ),
    attendees: extractEmails(message),
    start: timeWindow.start,
    end: timeWindow.end,
    explicitCreate:
      isNewMeeting ||
      Boolean(pendingMeeting?.explicitCreate),
  });
};

const clearPendingMeetingContext = async (
  sessionId,
  userId
) => {
  await saveContext(
    sessionId,
    PENDING_MEETING_CONTEXT_KEY,
    null,
    userId
  );

  const remaining = await getContext(
    sessionId,
    PENDING_MEETING_CONTEXT_KEY,
    userId
  );

  console.log(
    "[ATHINA][MEETING] Context after clear:",
    remaining
  );
};

const handlePendingMeetingWorkflow = async ({
  message,
  sessionId,
  userId,
}) => {
  const pendingMeeting = await getContext(
    sessionId,
    PENDING_MEETING_CONTEXT_KEY,
    userId
  );

  /**
   * Cancellation and reset always outrank pending workflow state.
   */
  if (
    pendingMeeting &&
    (isCancellation(message) ||
      requestsNewContext(message))
  ) {
    await clearPendingMeetingContext(
      sessionId,
      userId
    );

    return {
      success: true,
      reply:
        "Okay, I cleared the pending meeting request. What would you like to do next?",
      actions: [],
      workflowCleared: true,
    };
  }

  /**
   * A new explicit email request interrupts a stale meeting.
   * Clear meeting context, then return null so routing continues.
   */
  if (hasEmailIntent(message)) {
    if (pendingMeeting) {
      console.log(
        "[ATHINA][ROUTING] Email intent interrupted pending meeting workflow."
      );

      await clearPendingMeetingContext(
        sessionId,
        userId
      );
    }

    return null;
  }

  /**
   * Do not start a meeting merely because an email address,
   * a short phrase, or the word "send" appears.
   */
  if (
    !pendingMeeting &&
    !hasExplicitMeetingIntent(message)
  ) {
    return null;
  }

  /**
   * If a pending meeting exists but this message is unrelated,
   * do not hijack the new request.
   */
  if (
    pendingMeeting &&
    !isMeetingContinuation(
      message,
      pendingMeeting
    )
  ) {
    if (isVagueFollowUp(message)) {
      const missing = getMissingMeetingFields(
        pendingMeeting
      );

      if (missing.length > 0) {
        return {
          success: true,
          reply: buildMeetingClarificationReply(
            pendingMeeting,
            missing
          ),
          actions: [],
        };
      }

      return {
        success: true,
        reply:
          "I have your meeting details. Please confirm by saying 'create it now' so I can add it to your calendar.",
        actions: [],
      };
    }

    console.log(
      "[ATHINA][ROUTING] Message is not a meeting continuation. Pending meeting preserved but not executed."
    );

    return null;
  }

  const meeting = interpretMeetingMessage({
    message,
    pendingMeeting,
  });

  if (!meeting) return null;

  const missing = getMissingMeetingFields(meeting);

  if (missing.length > 0) {
    await saveContext(
      sessionId,
      PENDING_MEETING_CONTEXT_KEY,
      meeting,
      userId
    );

    return {
      success: true,
      reply: buildMeetingClarificationReply(
        meeting,
        missing
      ),
      actions: [],
    };
  }

  if (!meeting.explicitCreate) {
    await saveContext(
      sessionId,
      PENDING_MEETING_CONTEXT_KEY,
      meeting,
      userId
    );

    return {
      success: true,
      reply:
        "I have the meeting details, but I need you to confirm that you want me to create the event.",
      actions: [],
    };
  }

  const calendarResult = await executeTool(
    "calendar",
    {
      action: "create_event",
      title: meeting.title,
      start: meeting.start,
      end: meeting.end,
      location: meeting.location,
      description: meeting.description,
      attendees: meeting.attendees,
    },
    {
      sessionId,
      userId,
    }
  );

  if (!calendarResult.success) {
    await saveContext(
      sessionId,
      PENDING_MEETING_CONTEXT_KEY,
      meeting,
      userId
    );

    return {
      success: false,
      reply:
        "I could not create the calendar event: " +
        (calendarResult.error || "unknown error"),
      actions: [],
    };
  }

  await saveContext(
  sessionId,
  LAST_MEETING_METADATA_KEY,
  {
    title: meeting.title,
    attendees: meeting.attendees,
    start: meeting.start,
    end: meeting.end,
    location: meeting.location,
  },
  userId
);

await clearPendingMeetingContext(
  sessionId,
  userId
);

  return {
    success: true,
    reply: replyForCreatedMeeting(
      calendarResult,
      meeting
    ),
    actions: [],
  };
};

/* =========================================================
   LOCATION CONTEXT
   ========================================================= */

const buildLocationContext = async (
  sessionId,
  locationContext,
  userId
) => {
  const fallbackContext =
    locationContext ||
    (await getContext(
      sessionId,
      "map_context",
      userId
    ));

  if (
    !fallbackContext ||
    typeof fallbackContext.lat !== "number" ||
    typeof fallbackContext.lng !== "number"
  ) {
    return "";
  }

  return [
    "Active map context:",
    "- name: " +
      (fallbackContext.name ||
        "selected location"),
    "- latitude: " + fallbackContext.lat,
    "- longitude: " + fallbackContext.lng,
    fallbackContext.query
      ? "- source: " + fallbackContext.query
      : "",
  ]
    .filter(Boolean)
    .join("\n");
};

const buildRequestKey = (
  message,
  locationNote
) =>
  normalizeCacheText(
    [message, locationNote]
      .filter(Boolean)
      .join("\n")
  );

/* =========================================================
   PRODUCTIVITY INTENTS
   ========================================================= */

const parseTomorrowTimeWindow = (message) => {
  const match = String(message || "").match(
    /tomorrow(?:\s+at)?\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i
  );

  if (!match) return null;

  let hour = Number(match[1]);
  const minute = Number(match[2] || 0);
  const meridiem = (
    match[3] || ""
  ).toLowerCase();

  if (meridiem === "pm" && hour < 12) {
    hour += 12;
  }

  if (meridiem === "am" && hour === 12) {
    hour = 0;
  }

  if (hour > 23 || minute > 59) {
    return null;
  }

  const now = new Date();
  const start = new Date(now);

  start.setDate(now.getDate() + 1);
  start.setHours(hour, minute, 0, 0);

  const end = new Date(
    start.getTime() + 60 * 60 * 1000
  );

  return {
    start: start.toISOString(),
    end: end.toISOString(),
    label: `tomorrow at ${start.toLocaleTimeString(
      [],
      {
        hour: "2-digit",
        minute: "2-digit",
      }
    )}`,
  };
};

const buildEmailFromReply = (
  fromHeader = ""
) => {
  const emailMatch = String(fromHeader).match(
    /<([^>]+)>/
  );

  return {
    fromHeader,
    fromEmail: emailMatch
      ? emailMatch[1]
      : fromHeader,
  };
};

const summarizeMessageBody = (message) => {
  const text = String(
    message?.body || message?.snippet || ""
  )
    .replace(/\s+/g, " ")
    .trim();

  if (!text) {
    return "I found the latest email, but it has no readable text body.";
  }

  return text.length > 420
    ? text.slice(0, 420) + "..."
    : text;
};

const handleProductivityIntents = async ({
  message,
  sessionId,
  userId,
}) => {
  const text = String(message || "").toLowerCase();
  const context = { sessionId, userId };

  const asksLastEmail =
    /last email|latest email/.test(text);

  const asksWhoFrom =
    asksLastEmail &&
    /who.*from|from who|who sent|sender/.test(text);

  const asksSummary =
    asksLastEmail &&
    /summar|summary/.test(text);

  if (asksWhoFrom || asksSummary) {
    const listed = await executeTool(
      "email",
      {
        action: "list",
        provider: "google",
        maxResults: 1,
        query: "in:inbox",
      },
      context
    );

    if (!listed.success) {
      return {
        success: false,
        reply:
          "I could not read your inbox: " +
          (listed.error || "unknown error"),
        actions: [],
      };
    }

    const latest = Array.isArray(
      listed.messages
    )
      ? listed.messages[0]
      : null;

    if (!latest) {
      return {
        success: true,
        reply:
          "Your inbox appears empty right now.",
        actions: [],
      };
    }

    if (asksWhoFrom) {
      const parsedFrom = buildEmailFromReply(
        latest.from
      );

      return {
        success: true,
        reply: `Your latest email is from ${parsedFrom.fromEmail}. Subject: ${latest.subject || "(no subject)"}.`,
        actions: [],
      };
    }

    const fullMessage = await executeTool(
      "email",
      {
        action: "read",
        provider: "google",
        messageId: latest.id,
      },
      context
    );

    if (!fullMessage.success) {
      return {
        success: false,
        reply:
          "I found your latest email but could not open it: " +
          (fullMessage.error || "unknown error"),
        actions: [],
      };
    }

    const subject =
      fullMessage.message?.subject ||
      latest.subject ||
      "(no subject)";

    const summary = summarizeMessageBody(
      fullMessage.message || latest
    );

    return {
      success: true,
      reply: `Summary of your latest email (${subject}): ${summary}`,
      actions: [],
    };
  }

  const asksCalendarCheck =
    /calendar/.test(text) &&
    /(check|anything|do i have|what.*(event|meeting)|free|available)/.test(
      text
    );

  if (asksCalendarCheck) {
    const window =
      parseTomorrowTimeWindow(message);

    if (!window) return null;

    const availability = await executeTool(
      "calendar",
      {
        action: "check_availability",
        start: window.start,
        end: window.end,
      },
      context
    );

    if (!availability.success) {
      return {
        success: false,
        reply:
          "I could not check your calendar: " +
          (availability.error || "unknown error"),
        actions: [],
      };
    }

    if (availability.isFree) {
      return {
        success: true,
        reply: `You have no events at ${window.label}.`,
        actions: [],
      };
    }

    const events = await executeTool(
      "calendar",
      {
        action: "list_events",
        timeMin: window.start,
        timeMax: window.end,
        maxResults: 10,
      },
      context
    );

    const titles = (events.events || [])
      .map((event) => event.title)
      .filter(Boolean);

    const eventSummary = titles.length
      ? titles.join(", ")
      : "one or more busy slots";

    return {
      success: true,
      reply: `You do have events at ${window.label}: ${eventSummary}.`,
      actions: [],
    };
  }

  return null;
};

/* =========================================================
   MEMORY
   ========================================================= */

const buildMemoryNote = (memories) => {
  if (
    !Array.isArray(memories) ||
    memories.length === 0
  ) {
    return "";
  }

  return [
    "Relevant prior conversation memory:",
    ...memories
      .slice(0, 3)
      .map(
        (memory, index) =>
          `${index + 1}. ${memory.content}`
      ),
  ].join("\n");
};

const loadRelevantMemories = async ({
  message,
  locationNote,
  userId,
  sessionId,
}) => {
  try {
    const embeddingText = [message, locationNote]
      .filter(Boolean)
      .join("\n");

    const embedding = await getEmbedding(embeddingText);

    if (!embedding) {
      const history = await getHistory(sessionId, 6, userId);
      return history
        .slice(-6)
        .map((entry) => ({
          content: `${entry.role}: ${entry.content}`,
          similarity: 0.5,
          source: "history_fallback",
        }));
    }

    const memories = await searchMemoryEmbeddings({
      sessionId,
      userId,
      embedding,
      limit: 4,
      minSimilarity: 0.74,
    });

    if (memories.length > 0) return memories;

    const history = await getHistory(sessionId, 6, userId);
    return history
      .slice(-6)
      .map((entry) => ({
        content: `${entry.role}: ${entry.content}`,
        similarity: 0.5,
        source: "history_fallback",
      }));
  } catch (error) {
    console.warn(
      "[ATHINA] Semantic memory lookup skipped:",
      error.message
    );

    const history = await getHistory(sessionId, 6, userId).catch(() => []);
    return history
      .slice(-6)
      .map((entry) => ({
        content: `${entry.role}: ${entry.content}`,
        similarity: 0.5,
        source: "history_fallback",
      }));
  }
};

const persistReusableMemory = async ({
  sessionId,
  userId,
  message,
  reply,
  tasks = [],
  actions = [],
  requestKey,
  source,
}) => {
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
    const embedding = await getEmbedding(
      `User: ${message}\nAssistant: ${reply}`
    );

    if (embedding) {
      await saveMemoryEmbedding({
        sessionId,
        userId,
        source: "conversation",
        content: `User: ${message}\nAssistant: ${reply}`,
        metadata: {
          tasksCount: tasks.length,
          source,
        },
        embedding,
      });
    }
  } catch (error) {
    console.warn(
      "[ATHINA] Semantic memory persistence skipped:",
      error.message
    );
  }
};

/* =========================================================
   ACTION MAPPING
   ========================================================= */

const mapToActions = (executed) => {
  const actions = [];

  for (const task of executed) {
    if (
      !task.result ||
      !task.result.success
    ) {
      continue;
    }

    if (task.result.type === "locate") {
      actions.push(task.result);
    } else if (
      task.result.type === "web_search"
    ) {
      actions.push({
        type: "browse",
        query: task.result.query,
        success: true,
        summary: task.result.summary,
        sources: task.result.results,
        fetchedAt: new Date().toISOString(),
      });
    }
  }

  return actions;
};

/* =========================================================
   MAIN ORCHESTRATOR
   ========================================================= */

export const orchestrate = async ({
  message,
  sessionId = "default",
  userId = null,
  mode = "text",
  locationContext = null,
}) => {
  const timestamp = () =>
    new Date().toISOString();

  const normalizedMessage = String(
    message || ""
  ).trim();

  console.log("[ATHINA][ORCHESTRATOR] Request:", {
    sessionId,
    userId,
    mode,
    message: normalizedMessage,
  });

  if (!normalizedMessage) {
    return {
      success: false,
      reply: "Please enter a request.",
      actions: [],
      sessionId,
      timestamp: timestamp(),
    };
  }

  /* ---------------------------------------------------------
     1. SAFETY

     Safety rules always outrank planning, memory, and tools.
     --------------------------------------------------------- */

  const safety = checkSafety(normalizedMessage);

  if (!safety.safe) {
    console.log(
      "[ATHINA][ROUTING] Blocked by safety:",
      safety.reason
    );

    return {
      success: false,
      reply:
        "I cannot process this request: " +
        safety.reason,
      actions: [],
      sessionId,
      timestamp: timestamp(),
    };
  }

  /* ---------------------------------------------------------
     2. LOCATION CONTEXT
     --------------------------------------------------------- */

  if (
    locationContext &&
    typeof locationContext.lat === "number" &&
    typeof locationContext.lng === "number"
  ) {
    await saveContext(
      sessionId,
      "map_context",
      locationContext,
      userId
    );
  }

  /* ---------------------------------------------------------
     3. GLOBAL RESET COMMANDS

     These commands must run before pending workflows.
     --------------------------------------------------------- */

  if (
    isCancellation(normalizedMessage) ||
    requestsNewContext(normalizedMessage)
  ) {
    const pendingMeeting = await getContext(
      sessionId,
      PENDING_MEETING_CONTEXT_KEY,
      userId
    );

    if (pendingMeeting) {
      await clearPendingMeetingContext(
        sessionId,
        userId
      );

      const reply =
        "Okay, I cleared the pending meeting request. What would you like to do next?";

      await saveTurn(
        sessionId,
        normalizedMessage,
        reply,
        userId
      );

      return {
        success: true,
        reply,
        actions: [],
        sessionId,
        timestamp: timestamp(),
        workflowCleared: true,
      };
    }

    const reply =
      "Okay, we can start fresh. What would you like me to do?";

    await saveTurn(
      sessionId,
      normalizedMessage,
      reply,
      userId
    );

    return {
      success: true,
      reply,
      actions: [],
      sessionId,
      timestamp: timestamp(),
      workflowCleared: true,
    };
  }

  /* ---------------------------------------------------------
     4. PENDING WORKFLOW ROUTING

     Current explicit email intent can interrupt a pending
     meeting. Unrelated requests bypass the meeting workflow.
     --------------------------------------------------------- */

  const pendingMeetingResult =
    await handlePendingMeetingWorkflow({
      message: normalizedMessage,
      sessionId,
      userId,
    });

  if (pendingMeetingResult) {
    console.log(
      "[ATHINA][ROUTING] Meeting workflow handled the request."
    );

    await saveTurn(
      sessionId,
      normalizedMessage,
      pendingMeetingResult.reply,
      userId
    );

    return {
      success: Boolean(
        pendingMeetingResult.success
      ),
      reply: pendingMeetingResult.reply,
      actions:
        pendingMeetingResult.actions || [],
      sessionId,
      timestamp: timestamp(),
      directAction: true,
      workflowCleared: Boolean(
        pendingMeetingResult.workflowCleared
      ),
    };
  }

  const pendingMeeting = await getContext(
    sessionId,
    PENDING_MEETING_CONTEXT_KEY,
    userId
  );

  if (pendingMeeting && isVagueAcknowledgement(normalizedMessage)) {
    const missing =
      getMissingMeetingFields(
        pendingMeeting
      );

    const reply =
      missing.length > 0
        ? buildMeetingClarificationReply(
            pendingMeeting,
            missing
          )
        : "I have your meeting details ready. Say 'create it now' and I will add it to your calendar and send the invites.";

    await saveTurn(
      sessionId,
      normalizedMessage,
      reply,
      userId
    );

    return {
      success: true,
      reply,
      actions: [],
      sessionId,
      timestamp: timestamp(),
      directAction: true,
    };
  }

  /* ---------------------------------------------------------
     5. QUICK REPLIES
     --------------------------------------------------------- */

  const quickReply = getQuickReply(
    normalizedMessage
  );

  const locationNote =
    await buildLocationContext(
      sessionId,
      locationContext,
      userId
    );

  const requestKey = buildRequestKey(
    normalizedMessage,
    locationNote
  );

  if (quickReply) {
    console.log(
      "[ATHINA][ROUTING] Quick reply."
    );

    await saveTurn(
      sessionId,
      normalizedMessage,
      quickReply.reply,
      userId
    );

    await persistReusableMemory({
      sessionId,
      userId,
      message: normalizedMessage,
      reply: quickReply.reply,
      requestKey,
      source: "quick_reply",
    });

    return {
      success: true,
      reply: quickReply.reply,
      actions: [],
      sessionId,
      timestamp: timestamp(),
      quickReply: true,
    };
  }

  /* ---------------------------------------------------------
     6. DETERMINISTIC PRODUCTIVITY INTENTS
     --------------------------------------------------------- */

  const productivityIntentResult =
    await handleProductivityIntents({
      message: normalizedMessage,
      sessionId,
      userId,
    });

  if (productivityIntentResult) {
    console.log(
      "[ATHINA][ROUTING] Direct productivity handler."
    );

    await saveTurn(
      sessionId,
      normalizedMessage,
      productivityIntentResult.reply,
      userId
    );

    await persistReusableMemory({
      sessionId,
      userId,
      message: normalizedMessage,
      reply: productivityIntentResult.reply,
      actions:
        productivityIntentResult.actions || [],
      requestKey,
      source: "direct_productivity",
    });

    return {
      success: Boolean(
        productivityIntentResult.success
      ),
      reply: productivityIntentResult.reply,
      actions:
        productivityIntentResult.actions || [],
      sessionId,
      timestamp: timestamp(),
      directAction: true,
    };
  }

  /* ---------------------------------------------------------
     7. CACHE

     Never use cached responses for tool actions or live data.
     --------------------------------------------------------- */

  const canUseCache =
    !isActionOrLiveDataRequest(
      normalizedMessage
    );

  const cachedAnswer = canUseCache
    ? await findCachedAnswer({
        sessionId,
        userId,
        requestKey,
      })
    : null;

  if (cachedAnswer) {
    console.log(
      "[ATHINA][ROUTING] Cached informational reply."
    );

    await markCachedAnswerHit(cachedAnswer);

    await saveTurn(
      sessionId,
      normalizedMessage,
      cachedAnswer.reply,
      userId
    );

    return {
      success: true,
      reply: cachedAnswer.reply,
      actions: Array.isArray(
        cachedAnswer.actions
      )
        ? cachedAnswer.actions
        : [],
      sessionId,
      timestamp: timestamp(),
      cachedReply: true,
    };
  }

  /* ---------------------------------------------------------
     8. HISTORY AND SEMANTIC MEMORY
     --------------------------------------------------------- */

  const history = await getHistory(
    sessionId,
    8,
    userId
  );

  const relevantMemories =
    await loadRelevantMemories({
      message: normalizedMessage,
      locationNote,
      userId,
      sessionId,
    });

  const memoryNote = buildMemoryNote(
    relevantMemories
  );

  /* ---------------------------------------------------------
     9. PLANNING
     --------------------------------------------------------- */

  console.log(
    "[ATHINA][ROUTING] Sending request to planner."
  );

  const planResult = await plan({
    message: normalizedMessage,
    history,
    locationNote,
    memoryNote,
  });

  if (!planResult.requiresPlanning) {
    const reply =
      planResult.reply ||
      "I am here. How can I help?";

    const planningFailed =
      planResult.planningFailed === true;

    await saveTurn(
      sessionId,
      normalizedMessage,
      reply,
      userId
    );

    await persistReusableMemory({
      sessionId,
      userId,
      message: normalizedMessage,
      reply,
      requestKey,
      source: "planner_reply",
    });

    return {
      success: !planningFailed,
      reply,
      actions: [],
      sessionId,
      timestamp: timestamp(),
      planningFailed,
    };
  }

  /* ---------------------------------------------------------
     10. TASK VALIDATION
     --------------------------------------------------------- */

  const tasks = planResult.tasks || [];

  const taskValidation =
    validateTasks(tasks);

  if (!taskValidation.valid) {
    const reply =
      "I cannot execute these tasks: " +
      taskValidation.violations.join("; ");

    await saveTurn(
      sessionId,
      normalizedMessage,
      reply,
      userId
    );

    return {
      success: false,
      reply,
      actions: [],
      sessionId,
      timestamp: timestamp(),
    };
  }

  /* ---------------------------------------------------------
     10.5 WRITE INTENT FIREWALL

     Planner-generated write tasks must not execute unless the
     latest user turn explicitly requests execution or confirms it.
     This prevents ambiguous follow-ups from triggering writes.
     --------------------------------------------------------- */

  const includesWriteTask = tasks.some(
    isWriteTask
  );

  if (
    includesWriteTask &&
    !hasExplicitWriteIntent(
      normalizedMessage
    ) &&
    !hasExplicitWriteConfirmation(
      normalizedMessage
    )
  ) {
    const pendingMeeting = await getContext(
      sessionId,
      PENDING_MEETING_CONTEXT_KEY,
      userId
    );

    let reply =
      "I can continue, but I need explicit confirmation before I run write actions. Please say 'go ahead' or restate the exact action.";

    if (pendingMeeting) {
      const missing =
        getMissingMeetingFields(
          pendingMeeting
        );

      reply =
        missing.length > 0
          ? buildMeetingClarificationReply(
              pendingMeeting,
              missing
            )
          : "I have your meeting details. Please confirm by saying 'create it now' so I can add it to your calendar.";
    }

    await saveTurn(
      sessionId,
      normalizedMessage,
      reply,
      userId
    );

    return {
      success: true,
      reply,
      actions: [],
      sessionId,
      timestamp: timestamp(),
      planningFailed: true,
    };
  }

  /* ---------------------------------------------------------
     11. SAVE PLAN
     --------------------------------------------------------- */

  await savePlan(
    sessionId,
    {
      goal: planResult.goal,
      steps: planResult.steps,
      tasks,
    },
    userId
  );

  /* ---------------------------------------------------------
     12. EXECUTION
     --------------------------------------------------------- */

  console.log(
    "[ATHINA][EXECUTION] Executing tasks:",
    tasks.map((task) => ({
      id: task.id,
      tool: task.tool,
      description: task.description,
    }))
  );

  const { executed, summary } = await executeTasks(
    tasks,
    {
      saveTaskResult: (
        taskSessionId,
        taskId,
        tool,
        result
      ) =>
        saveTaskResult(
          taskSessionId,
          taskId,
          tool,
          result,
          userId
        ),
      sessionId,
      userId,
    }
  );

  /* ---------------------------------------------------------
     13. FINAL RESPONSE
     --------------------------------------------------------- */

  const finalReply =
    await buildCompactExecutionReply(executed);

  await saveTurn(
    sessionId,
    normalizedMessage,
    finalReply,
    userId
  );

  const actions = mapToActions(executed);

  /* ---------------------------------------------------------
     14. MEMORY PERSISTENCE
     --------------------------------------------------------- */

  await persistReusableMemory({
    sessionId,
    userId,
    message: normalizedMessage,
    reply: finalReply,
    tasks: executed,
    actions,
    requestKey,
    source: "task_execution",
  });

  return {
    success: Boolean(summary?.success),
    reply: finalReply,
    actions,
    sessionId,
    timestamp: timestamp(),
    plan: {
      goal: planResult.goal,
      steps: planResult.steps,
    },
    tasks: executed.map((task) => ({
      id: task.id,
      tool: task.tool,
      description: task.description,
      success: Boolean(
        task.result &&
          task.result.success
      ),
    })),
  };
};
