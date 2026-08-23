import { fetchWithTimeout } from "../utils/helpers.js";
import { getGoogleClients } from "../utils/googleWorkspace.js";

const DEFAULT_TIME_ZONE = process.env.ATHINA_TIME_ZONE || "Asia/Dubai";
const EMAIL_PATTERN = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i;
const ISO_WITH_EXPLICIT_ZONE_PATTERN = /(z|[+-]\d{2}:\d{2})$/i;
const LOCAL_ISO_PATTERN = /^(\d{4})-(\d{2})-(\d{2})(?:[t\s](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/i;

const normalizeAttendees = (attendees) => {
  const values = Array.isArray(attendees)
    ? attendees
    : typeof attendees === "string"
      ? attendees.split(/[;,]/)
      : [];

  return Array.from(
    new Set(
      values
        .map((value) => String(value || "").trim().toLowerCase())
        .filter((value) => EMAIL_PATTERN.test(value))
    )
  );
};

const isValidDate = (value) => value instanceof Date && !Number.isNaN(value.getTime());

const getTimeZoneOffsetMinutes = (date, timeZone) => {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });

  const parts = Object.fromEntries(
    formatter.formatToParts(date).filter((part) => part.type !== "literal").map((part) => [part.type, part.value])
  );

  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second)
  );

  return (asUtc - date.getTime()) / 60000;
};

const zonedLocalToUtc = ({ year, month, day, hour, minute }, timeZone = DEFAULT_TIME_ZONE) => {
  const utcGuess = new Date(Date.UTC(year, month - 1, day, hour, minute, 0, 0));
  const offsetMinutes = getTimeZoneOffsetMinutes(utcGuess, timeZone);
  return new Date(utcGuess.getTime() - offsetMinutes * 60000);
};

const parseLocalDateTimeInZone = (value, timeZone) => {
  const match = String(value || "").trim().match(LOCAL_ISO_PATTERN);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4] || 0);
  const minute = Number(match[5] || 0);
  const second = Number(match[6] || 0);

  if (hour < 0 || hour > 23 || minute < 0 || minute > 59 || second < 0 || second > 59) {
    return null;
  }

  const utcDate = zonedLocalToUtc({ year, month, day, hour, minute }, timeZone);
  if (!isValidDate(utcDate)) return null;

  if (second === 0) return utcDate;

  return new Date(utcDate.getTime() + second * 1000);
};

const parseClock = (raw) => {
  const text = String(raw || "").trim().toLowerCase();
  const match = text.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);
  if (!match) return null;

  let hour = Number(match[1]);
  const minute = Number(match[2] || 0);
  const meridiem = String(match[3] || "").toLowerCase();

  if (minute < 0 || minute > 59) return null;

  // Be forgiving with mixed formats such as "14:00 PM".
  if (hour > 12 && meridiem) {
    if (hour > 23) return null;
    return { hour, minute };
  }

  if (meridiem === "pm" && hour < 12) hour += 12;
  if (meridiem === "am" && hour === 12) hour = 0;
  if (hour < 0 || hour > 23) return null;

  return { hour, minute };
};

const resolveDateText = (dateText, timeZone = DEFAULT_TIME_ZONE) => {
  const text = String(dateText || "").trim().toLowerCase();
  const now = new Date();
  const localParts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(now)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  );

  let year = Number(localParts.year);
  let month = Number(localParts.month);
  let day = Number(localParts.day);

  if (!text || text === "today") return { year, month, day };

  if (text === "tomorrow") {
    const tomorrow = zonedLocalToUtc({ year, month, day, hour: 12, minute: 0 }, timeZone);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat("en-GB", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      })
        .formatToParts(tomorrow)
        .filter((part) => part.type !== "literal")
        .map((part) => [part.type, part.value])
    );
    return { year: Number(parts.year), month: Number(parts.month), day: Number(parts.day) };
  }

  const monthNames = {
    january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
    july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
  };

  let match = text.match(/^(\d{1,2})\s+(january|february|march|april|may|june|july|august|september|october|november|december)(?:\s+(\d{4}))?$/i);
  if (match) {
    day = Number(match[1]);
    month = monthNames[match[2].toLowerCase()];
    year = match[3] ? Number(match[3]) : year;
    return { year, month, day };
  }

  match = text.match(/^(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})(?:,?\s+(\d{4}))?$/i);
  if (match) {
    month = monthNames[match[1].toLowerCase()];
    day = Number(match[2]);
    year = match[3] ? Number(match[3]) : year;
    return { year, month, day };
  }

  match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };

  return null;
};

const resolveDateTime = ({ value, date, time, timeZone = DEFAULT_TIME_ZONE }) => {
  if (value) {
    const raw = String(value).trim();

    if (ISO_WITH_EXPLICIT_ZONE_PATTERN.test(raw)) {
      const direct = new Date(raw);
      if (isValidDate(direct)) return direct;
    } else {
      const local = parseLocalDateTimeInZone(raw, timeZone);
      if (isValidDate(local)) return local;

      const direct = new Date(raw);
      if (isValidDate(direct)) return direct;
    }
  }

  const dateParts = resolveDateText(date, timeZone);
  const timeParts = parseClock(time);
  if (!dateParts || !timeParts) return null;

  const resolved = zonedLocalToUtc({ ...dateParts, ...timeParts }, timeZone);
  return isValidDate(resolved) ? resolved : null;
};

const normalizeWindow = (params, effectiveTimeZone = null) => {
  const timeZone = String(effectiveTimeZone || params.timeZone || DEFAULT_TIME_ZONE);
  const durationMinutes = Math.max(1, Math.min(Number(params.durationMinutes || 60), 24 * 60));

  const startDate = resolveDateTime({
    value: params.start || params.datetime,
    date: params.date,
    time: params.time,
    timeZone,
  });

  if (!startDate) return { startAt: null, endAt: null, durationMinutes, timeZone };

  const explicitEnd = resolveDateTime({ value: params.end, timeZone });
  const endDate = explicitEnd || new Date(startDate.getTime() + durationMinutes * 60 * 1000);

  return {
    startAt: startDate.toISOString(),
    endAt: endDate.toISOString(),
    durationMinutes,
    timeZone,
  };
};

const detectCalendarTimeZone = async (calendar) => {
  try {
    const primary = await calendar.calendars.get({ calendarId: "primary" });
    const tz = String(primary?.data?.timeZone || "").trim();
    if (tz) return tz;
  } catch (error) {
    console.warn("[CALENDAR] Could not read primary calendar timezone:", error?.message || error);
  }

  try {
    const setting = await calendar.settings.get({ setting: "timezone" });
    const tz = String(setting?.data?.value || "").trim();
    if (tz) return tz;
  } catch (error) {
    console.warn("[CALENDAR] Could not read calendar settings timezone:", error?.message || error);
  }

  return DEFAULT_TIME_ZONE;
};

const toIcsDate = (value) =>
  new Date(value).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

const escapeIcsText = (value) =>
  String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");

const generateICS = ({ title, start, end, location, description, attendees = [] }) => {
  const attendeeLines = normalizeAttendees(attendees).map(
    (email) => `ATTENDEE;CN=${escapeIcsText(email)}:MAILTO:${email}`
  );

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//ATHINA//Calendar//EN",
    "BEGIN:VEVENT",
    `UID:${Date.now()}-${Math.random().toString(36).slice(2)}@athina`,
    `DTSTAMP:${toIcsDate(new Date())}`,
    `DTSTART:${toIcsDate(start)}`,
    `DTEND:${toIcsDate(end)}`,
    `SUMMARY:${escapeIcsText(title || "ATHINA Event")}`,
    location ? `LOCATION:${escapeIcsText(location)}` : "",
    description ? `DESCRIPTION:${escapeIcsText(description)}` : "",
    ...attendeeLines,
    "END:VEVENT",
    "END:VCALENDAR",
  ]
    .filter(Boolean)
    .join("\r\n");
};

const verifyCreateResult = ({ event, title, start, end, attendees, action }) => {
  const eventId = event?.data?.id || null;
  const htmlLink = event?.data?.htmlLink || null;

  if (!eventId) {
    return {
      type: "calendar",
      success: false,
      action,
      error: "Calendar provider did not return an event ID. Event creation could not be verified.",
    };
  }

  return {
    type: "calendar",
    success: true,
    action,
    created: true,
    verified: true,
    eventId,
    htmlLink,
    title,
    start,
    end,
    attendees,
  };
};

export const execute = async (params = {}) => {
  const {
    action = "create_event",
    title,
    location,
    description,
    attendees,
    sessionId = "default",
    userId = null,
    timeMin,
    timeMax,
    maxResults = 10,
    eventId,
    query,
  } = params;

  const normalizedAction = String(action || "create_event").trim().toLowerCase();
  const normalizedAttendees = normalizeAttendees(attendees);
  let effectiveTimeZone = String(params.timeZone || DEFAULT_TIME_ZONE);
  let window = normalizeWindow(params, effectiveTimeZone);

  if (["create_event", "ensure_slot", "check_availability"].includes(normalizedAction)) {
    if (!window.startAt || !window.endAt) {
      return {
        type: "calendar",
        success: false,
        action: normalizedAction,
        code: "MISSING_DATE_TIME",
        error: "I still need a valid date and start time for the calendar action.",
        missingFields: ["date", "time"],
      };
    }
  }

  if (["create_event", "ensure_slot"].includes(normalizedAction) && !String(title || "").trim()) {
    return {
      type: "calendar",
      success: false,
      action: normalizedAction,
      code: "MISSING_TITLE",
      error: "I still need a title for the calendar event.",
      missingFields: ["title"],
    };
  }

  try {
    const { calendar } = await getGoogleClients({ sessionId, userId });

    if (!params.timeZone) {
      effectiveTimeZone = await detectCalendarTimeZone(calendar);
      window = normalizeWindow(params, effectiveTimeZone);
    }

    const findTargetEvent = async () => {
      if (eventId) {
        const eventRes = await calendar.events.get({
          calendarId: "primary",
          eventId: String(eventId),
        });

        return eventRes.data || null;
      }

      const searchQuery = String(query || title || "").trim();
      if (!searchQuery) return null;

      const list = await calendar.events.list({
        calendarId: "primary",
        q: searchQuery,
        timeMin: new Date().toISOString(),
        maxResults: 10,
        singleEvents: true,
        orderBy: "startTime",
      });

      return (list.data.items || [])[0] || null;
    };

    if (["list_events", "list"].includes(normalizedAction)) {
      const list = await calendar.events.list({
        calendarId: "primary",
        timeMin: timeMin || new Date().toISOString(),
        timeMax: timeMax || undefined,
        maxResults: Math.min(Number(maxResults) || 10, 25),
        singleEvents: true,
        orderBy: "startTime",
      });

      const events = (list.data.items || []).map((event) => ({
        id: event.id,
        title: event.summary || "Untitled event",
        start: event.start?.dateTime || event.start?.date || null,
        end: event.end?.dateTime || event.end?.date || null,
        location: event.location || "",
        htmlLink: event.htmlLink || null,
      }));

      return { type: "calendar", success: true, action: "list_events", events, count: events.length };
    }

    if (normalizedAction === "check_availability") {
      const freeBusy = await calendar.freebusy.query({
        requestBody: {
          timeMin: window.startAt,
          timeMax: window.endAt,
          items: [{ id: "primary" }],
        },
      });

      const conflicts = freeBusy.data.calendars?.primary?.busy || [];
      return {
        type: "calendar",
        success: true,
        action: "check_availability",
        start: window.startAt,
        end: window.endAt,
        isFree: conflicts.length === 0,
        conflicts,
      };
    }

    if (["get_event", "find_event"].includes(normalizedAction)) {
      const found = await findTargetEvent();

      if (!found) {
        return {
          type: "calendar",
          success: false,
          action: normalizedAction,
          error: "I could not find a matching calendar event.",
          missingFields: eventId
            ? ["valid_event_id"]
            : ["eventId_or_query"],
        };
      }

      return {
        type: "calendar",
        success: true,
        action: "get_event",
        event: {
          id: found.id,
          title: found.summary || "Untitled event",
          start: found.start?.dateTime || found.start?.date || null,
          end: found.end?.dateTime || found.end?.date || null,
          location: found.location || "",
          description: found.description || "",
          htmlLink: found.htmlLink || null,
        },
      };
    }

    if (normalizedAction === "update_event") {
      const target = await findTargetEvent();
      if (!target?.id) {
        return {
          type: "calendar",
          success: false,
          action: normalizedAction,
          error: "I could not find the event to update.",
          missingFields: eventId
            ? ["valid_event_id"]
            : ["eventId_or_query"],
        };
      }

      const hasTimeUpdate = Boolean(params.start || params.end || params.datetime || params.date || params.time);
      const nextStart = hasTimeUpdate
        ? window.startAt || target.start?.dateTime || target.start?.date || null
        : target.start?.dateTime || target.start?.date || null;

      const nextEnd = hasTimeUpdate
        ? window.endAt || target.end?.dateTime || target.end?.date || null
        : target.end?.dateTime || target.end?.date || null;

      const updated = await calendar.events.patch({
        calendarId: "primary",
        eventId: target.id,
        sendUpdates: normalizedAttendees.length > 0 ? "all" : undefined,
        requestBody: {
          summary: String(title || target.summary || "Untitled event").trim(),
          location: location ?? target.location ?? undefined,
          description: description ?? target.description ?? undefined,
          start: nextStart
            ? { dateTime: nextStart, timeZone: effectiveTimeZone }
            : target.start,
          end: nextEnd
            ? { dateTime: nextEnd, timeZone: effectiveTimeZone }
            : target.end,
          attendees:
            normalizedAttendees.length > 0
              ? normalizedAttendees.map((email) => ({ email }))
              : target.attendees,
        },
      });

      return {
        type: "calendar",
        success: true,
        action: "update_event",
        eventId: updated.data.id,
        title: updated.data.summary || String(title || target.summary || "Untitled event").trim(),
        start: updated.data.start?.dateTime || updated.data.start?.date || nextStart,
        end: updated.data.end?.dateTime || updated.data.end?.date || nextEnd,
        htmlLink: updated.data.htmlLink || null,
        verified: true,
      };
    }

    if (normalizedAction === "move_event") {
      const target = await findTargetEvent();
      if (!target?.id) {
        return {
          type: "calendar",
          success: false,
          action: normalizedAction,
          error: "I could not find the event to reschedule.",
          missingFields: eventId
            ? ["valid_event_id"]
            : ["eventId_or_query"],
        };
      }

      if (!window.startAt || !window.endAt) {
        return {
          type: "calendar",
          success: false,
          action: normalizedAction,
          code: "MISSING_DATE_TIME",
          error: "I still need the new date and time to move this event.",
          missingFields: ["date", "time"],
        };
      }

      const moved = await calendar.events.patch({
        calendarId: "primary",
        eventId: target.id,
        sendUpdates: "all",
        requestBody: {
          start: { dateTime: window.startAt, timeZone: effectiveTimeZone },
          end: { dateTime: window.endAt, timeZone: effectiveTimeZone },
        },
      });

      return {
        type: "calendar",
        success: true,
        action: "move_event",
        eventId: moved.data.id,
        title: moved.data.summary || target.summary || "Untitled event",
        start: moved.data.start?.dateTime || moved.data.start?.date || window.startAt,
        end: moved.data.end?.dateTime || moved.data.end?.date || window.endAt,
        htmlLink: moved.data.htmlLink || null,
        verified: true,
      };
    }

    if (normalizedAction === "delete_event") {
      const target = await findTargetEvent();
      if (!target?.id) {
        return {
          type: "calendar",
          success: false,
          action: normalizedAction,
          error: "I could not find the event to delete.",
          missingFields: eventId
            ? ["valid_event_id"]
            : ["eventId_or_query"],
        };
      }

      await calendar.events.delete({
        calendarId: "primary",
        eventId: target.id,
        sendUpdates: "all",
      });

      return {
        type: "calendar",
        success: true,
        action: "delete_event",
        eventId: target.id,
        title: target.summary || "Untitled event",
        verified: true,
      };
    }

    if (normalizedAction === "ensure_slot") {
      const freeBusy = await calendar.freebusy.query({
        requestBody: {
          timeMin: window.startAt,
          timeMax: window.endAt,
          items: [{ id: "primary" }],
        },
      });

      const conflicts = freeBusy.data.calendars?.primary?.busy || [];
      if (conflicts.length > 0) {
        return {
          type: "calendar",
          success: true,
          action: "ensure_slot",
          created: false,
          verified: true,
          isFree: false,
          conflicts,
          start: window.startAt,
          end: window.endAt,
          note: "The time slot is busy, so no event was created.",
        };
      }
    }

    const created = await calendar.events.insert({
      calendarId: "primary",
      sendUpdates: normalizedAttendees.length > 0 ? "all" : undefined,
      requestBody: {
        summary: String(title).trim(),
        location: location || undefined,
        description: description || undefined,
        start: { dateTime: window.startAt, timeZone: effectiveTimeZone },
        end: { dateTime: window.endAt, timeZone: effectiveTimeZone },
        attendees:
          normalizedAttendees.length > 0
            ? normalizedAttendees.map((email) => ({ email }))
            : undefined,
      },
    });

    return verifyCreateResult({
      event: created,
      title: String(title).trim(),
      start: window.startAt,
      end: window.endAt,
      attendees: normalizedAttendees,
      action: normalizedAction === "ensure_slot" ? "ensure_slot" : "create_event",
    });
  } catch (googleError) {
    console.warn("[CALENDAR] Google Calendar unavailable:", googleError?.message || googleError);
  }

  // ICS is a prepared fallback, not proof that an event was added to a calendar.
  if (!["create_event", "ensure_slot"].includes(normalizedAction)) {
    return {
      type: "calendar",
      success: false,
      action: normalizedAction,
      error: "Google Calendar is not connected for this action.",
    };
  }

  const ics = generateICS({
    title: String(title).trim(),
    start: window.startAt,
    end: window.endAt,
    location,
    description,
    attendees: normalizedAttendees,
  });

  return {
    type: "calendar",
    success: true,
    action: "prepare_ics",
    created: false,
    verified: false,
    title: String(title).trim(),
    start: window.startAt,
    end: window.endAt,
    attendees: normalizedAttendees,
    ics,
    icsUrl: `data:text/calendar;charset=utf8,${encodeURIComponent(ics)}`,
    note: "The calendar event was prepared as an ICS file, but it was not added directly because Google Calendar is not connected.",
  };
};

export const schema = {
  description: "Read and manage calendar events through Google Calendar, with an ICS preparation fallback.",
  actions: ["create_event", "list_events", "get_event", "find_event", "check_availability", "ensure_slot", "update_event", "move_event", "delete_event"],
  parameters: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["create_event", "list_events", "get_event", "find_event", "check_availability", "ensure_slot", "update_event", "move_event", "delete_event"],
      },
      title: { type: "string" },
      eventId: { type: "string", description: "Calendar event ID used for get/update/move/delete." },
      query: { type: "string", description: "Event search query used for find/get/update/move/delete when eventId is not provided." },
      datetime: { type: "string", description: "ISO start date-time." },
      start: { type: "string", description: "ISO start date-time." },
      end: { type: "string", description: "ISO end date-time." },
      date: { type: "string", description: "Human date such as today, tomorrow, 30 July, or July 30." },
      time: { type: "string", description: "Human start time such as 2 PM, 14:00, or 14:00 PM." },
      durationMinutes: { type: "number", description: "Event duration in minutes. Defaults to 60." },
      timeZone: { type: "string", description: "IANA timezone. Defaults to your Google Calendar timezone, then Asia/Dubai." },
      timeMin: { type: "string" },
      timeMax: { type: "string" },
      maxResults: { type: "number" },
      location: { type: "string" },
      description: { type: "string" },
      attendees: {
        oneOf: [
          { type: "array", items: { type: "string" } },
          { type: "string" },
        ],
      },
    },
  },
};

export const __test__ = {
  parseLocalDateTimeInZone,
  normalizeWindow,
};
