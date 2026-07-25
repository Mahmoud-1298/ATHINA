import { fetchWithTimeout } from "../utils/helpers.js";
import { getGoogleClients } from "../utils/googleWorkspace.js";

// Generates an ICS calendar event and returns a data URL
// Future: integrate with Google Calendar API / Outlook API

const generateICS = ({ title, datetime, location, description }) => {
  const dt = new Date(datetime);
  const dtStart = dt.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const dtEnd = new Date(dt.getTime() + 60 * 60 * 1000).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//ATHINA//Calendar//EN",
    "BEGIN:VEVENT",
    "UID:" + Date.now() + "@athina",
    "DTSTAMP:" + new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, ""),
    "DTSTART:" + dtStart,
    "DTEND:" + dtEnd,
    "SUMMARY:" + (title || "ATHINA Event"),
    location ? "LOCATION:" + location : "",
    description ? "DESCRIPTION:" + description : "",
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter(Boolean).join("\r\n");
};

export const execute = async (params) => {
  const {
    action = "create_event",
    title,
    datetime,
    start,
    end,
    location,
    description,
    sessionId = "default",
    userId = null,
    timeMin,
    timeMax,
    maxResults = 10,
  } = params;

  const normalizedAction = String(action || "create_event").toLowerCase();

  const getWindow = () => {
    const startAt = start || datetime;
    const endAt = end || (startAt ? new Date(new Date(startAt).getTime() + 60 * 60 * 1000).toISOString() : null);
    return { startAt, endAt };
  };

  try {
    const { calendar } = await getGoogleClients({ sessionId, userId });

    if (normalizedAction === "list_events" || normalizedAction === "list") {
      const list = await calendar.events.list({
        calendarId: "primary",
        timeMin: timeMin || new Date().toISOString(),
        timeMax: timeMax || undefined,
        maxResults: Math.min(Number(maxResults) || 10, 25),
        singleEvents: true,
        orderBy: "startTime",
      });
      const items = (list.data.items || []).map((event) => ({
        id: event.id,
        title: event.summary || "Untitled event",
        start: event.start?.dateTime || event.start?.date || null,
        end: event.end?.dateTime || event.end?.date || null,
        location: event.location || "",
        htmlLink: event.htmlLink || null,
      }));
      return { type: "calendar", success: true, action: "list", events: items, count: items.length };
    }

    if (normalizedAction === "check_availability") {
      const { startAt, endAt } = getWindow();
      if (!startAt || !endAt) return { type: "calendar", success: false, error: "Missing start/end (or datetime) for check_availability." };

      const fb = await calendar.freebusy.query({
        requestBody: {
          timeMin: new Date(startAt).toISOString(),
          timeMax: new Date(endAt).toISOString(),
          items: [{ id: "primary" }],
        },
      });

      const busy = fb.data.calendars?.primary?.busy || [];
      return {
        type: "calendar",
        success: true,
        action: "check_availability",
        start: startAt,
        end: endAt,
        isFree: busy.length === 0,
        conflicts: busy,
      };
    }

    if (normalizedAction === "ensure_slot") {
      const { startAt, endAt } = getWindow();
      if (!title || !startAt || !endAt) {
        return { type: "calendar", success: false, error: "Missing required parameters: title and start/end (or datetime) for ensure_slot." };
      }

      const availability = await calendar.freebusy.query({
        requestBody: {
          timeMin: new Date(startAt).toISOString(),
          timeMax: new Date(endAt).toISOString(),
          items: [{ id: "primary" }],
        },
      });
      const busy = availability.data.calendars?.primary?.busy || [];
      if (busy.length > 0) {
        return {
          type: "calendar",
          success: true,
          action: "ensure_slot",
          created: false,
          isFree: false,
          conflicts: busy,
          note: "Time slot is already busy. Event not created.",
        };
      }

      const created = await calendar.events.insert({
        calendarId: "primary",
        requestBody: {
          summary: title,
          location: location || undefined,
          description: description || undefined,
          start: { dateTime: new Date(startAt).toISOString() },
          end: { dateTime: new Date(endAt).toISOString() },
        },
      });

      return {
        type: "calendar",
        success: true,
        action: "ensure_slot",
        created: true,
        isFree: true,
        eventId: created.data.id,
        htmlLink: created.data.htmlLink,
        title,
        start: startAt,
        end: endAt,
      };
    }

    const createStart = start || datetime;
    const createEnd = end || (createStart ? new Date(new Date(createStart).getTime() + 60 * 60 * 1000).toISOString() : null);
    if (!title || !createStart) {
      return { type: "calendar", success: false, error: "Missing required parameters: title and start/datetime." };
    }

    const event = await calendar.events.insert({
      calendarId: "primary",
      requestBody: {
        summary: title,
        location: location || undefined,
        description: description || undefined,
        start: { dateTime: new Date(createStart).toISOString() },
        end: { dateTime: new Date(createEnd).toISOString() },
      },
    });

    return {
      type: "calendar",
      success: true,
      action: "create_event",
      title,
      start: createStart,
      end: createEnd,
      location,
      eventId: event.data.id,
      htmlLink: event.data.htmlLink,
    };
  } catch (googleError) {
    // Continue to legacy behavior as fallback.
  }

  const fallbackStart = start || datetime;
  if (!title || !fallbackStart) {
    return { success: false, error: "Missing required parameters: title, datetime/start" };
  }

  const ics = generateICS({ title, datetime: fallbackStart, location, description });

  // If Google Calendar is configured, create event via API
  const googleToken = process.env.GOOGLE_CALENDAR_TOKEN;
  if (googleToken) {
    try {
      const res = await fetchWithTimeout("https://www.googleapis.com/calendar/v3/calendars/primary/events", {
        method: "POST",
        headers: {
          Authorization: "Bearer " + googleToken,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          summary: title,
          location: location || undefined,
          description: description || undefined,
          start: { dateTime: fallbackStart },
          end: { dateTime: new Date(new Date(fallbackStart).getTime() + 60 * 60 * 1000).toISOString() },
        }),
      });
      if (res.ok) {
        const event = await res.json();
        return { type: "calendar", success: true, title, datetime: fallbackStart, location, eventId: event.id, htmlLink: event.htmlLink };
      }
    } catch (e) {
      // Fall through to ICS
    }
  }

  return {
    type: "calendar",
    success: true,
    title,
    datetime: fallbackStart,
    location,
    description,
    ics,
    icsUrl: "data:text/calendar;charset=utf8," + encodeURIComponent(ics),
  };
};

export const schema = {
  name: "calendar",
  description: "Read and manage calendar events (Google Calendar OAuth), with ICS fallback",
  params: {
    action: "string (optional) - create_event | list_events | check_availability | ensure_slot",
    title: "string (required for create_event/ensure_slot) - event title",
    datetime: "string (optional) - ISO datetime shortcut start time",
    start: "string (optional) - ISO start datetime",
    end: "string (optional) - ISO end datetime",
    timeMin: "string (optional for list_events) - ISO range start",
    timeMax: "string (optional for list_events) - ISO range end",
    maxResults: "number (optional for list_events)",
    location: "string (optional) - event location",
    description: "string (optional) - event description",
    sessionId: "string (optional) - user session id for Google OAuth token lookup",
    userId: "string (optional) - user id for Google OAuth token lookup",
  },
};
