const normalizeMessage = (message = "") =>
  String(message)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const QUICK_REPLIES = [
  {
    patterns: [/^(hi|hello|hey|hiya|good morning|good afternoon|good evening)$/i, /^(hi|hello|hey) athina$/i],
    reply: "Hello. How can I help?",
  },
  {
    patterns: [/^how are you$/i, /^how are you doing$/i, /^how's it going$/i],
    reply: "I'm ready and working well. How can I help?",
  },
  {
    patterns: [/^(ok|okay|alright|sure|yes|yep|yeah|noted|got it|roger|cool|fine)$/i],
    reply: "Noted.",
  },
  {
    patterns: [/^(thanks|thank you|thx|ty)$/i, /^(thanks|thank you|thx|ty) athina$/i],
    reply: "You're welcome.",
  },
  {
    patterns: [/^(good night|night)$/i],
    reply: "Good night.",
  },
  {
    patterns: [/^(what can you do|help|what do you do)$/i],
    reply: "I can answer questions, search the web, locate places, and handle supported actions.",
  },
];

export const getQuickReply = (message = "") => {
  const normalized = normalizeMessage(message);
  if (!normalized) return null;

  for (const entry of QUICK_REPLIES) {
    if (entry.patterns.some((pattern) => pattern.test(normalized))) {
      return { reply: entry.reply, key: normalized };
    }
  }

  return null;
};

export const buildCompactExecutionReply = (executed = []) => {
  if (!Array.isArray(executed) || executed.length === 0) {
    return "I’m here. How can I help?";
  }

  const sentences = [];

  for (const task of executed) {
    const result = task.result || {};

    if (!result.success) {
      sentences.push("I could not complete " + (task.description || task.id || task.tool) + ": " + (result.error || "unknown error") + ".");
      continue;
    }

    if (result.type === "locate") {
      sentences.push("I found " + (result.name || result.query || "the location") + (Number.isFinite(result.lat) && Number.isFinite(result.lng) ? " at " + result.lat.toFixed(4) + ", " + result.lng.toFixed(4) : "") + ".");
      continue;
    }

    if (result.type === "web_search") {
      const count = Array.isArray(result.results) ? result.results.length : 0;
      const firstResult = count > 0 ? result.results[0] : null;
      sentences.push("I searched the web for " + (result.query || task.description || "your request") + " and found " + count + " result" + (count === 1 ? "" : "s") + (firstResult?.title ? ", including " + firstResult.title : "") + ".");
      continue;
    }

    if (result.type === "calendar") {
      sentences.push("I created a calendar item for " + (result.title || task.description || "your event") + ".");
      continue;
    }

    if (result.type === "email") {
      sentences.push("I sent the email to " + (result.to || "the recipient") + ".");
      continue;
    }

    if (result.type === "booking") {
      sentences.push("I checked booking options for " + (result.query || task.description || "your request") + (result.selected?.name ? " and found " + result.selected.name : "") + ".");
      continue;
    }

    if (result.type === "llm") {
      sentences.push("I completed the request.");
      continue;
    }

    sentences.push("I completed " + (task.description || task.id || task.tool) + ".");
  }

  return sentences.join(" ");
};