import { fetchWithTimeout } from "../utils/helpers.js";

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
  const { title, datetime, location, description } = params;
  if (!title || !datetime) {
    return { success: false, error: "Missing required parameters: title, datetime" };
  }

  const ics = generateICS({ title, datetime, location, description });

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
          start: { dateTime: datetime },
          end: { dateTime: new Date(new Date(datetime).getTime() + 60 * 60 * 1000).toISOString() },
        }),
      });
      if (res.ok) {
        const event = await res.json();
        return { type: "calendar", success: true, title, datetime, location, eventId: event.id, htmlLink: event.htmlLink };
      }
    } catch (e) {
      // Fall through to ICS
    }
  }

  return {
    type: "calendar",
    success: true,
    title,
    datetime,
    location,
    description,
    ics,
    icsUrl: "data:text/calendar;charset=utf8," + encodeURIComponent(ics),
  };
};

export const schema = {
  name: "calendar",
  description: "Add an event to the calendar (generates ICS or creates Google Calendar event)",
  params: {
    title: "string (required) - event title",
    datetime: "string (required) - ISO datetime string (e.g. 2025-01-15T09:00:00)",
    location: "string (optional) - event location",
    description: "string (optional) - event description",
  },
};
