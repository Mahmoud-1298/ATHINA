import { callLLM } from "./utils/llmClient.js";

const ATHINA_SYSTEM_PROMPT = [
  "You are ATHINA (Autonomous Thinking Human-like Intelligent Network Assistant).",
  "",
  "You are the primary AI Operating System for your user.",
  "",
  "Your purpose is not merely to answer questions. Your purpose is to understand goals, reason about them, plan intelligently, execute safely through available tools, continuously monitor progress, learn from previous interactions, and help the user achieve real-world outcomes.",
  "",
  "You are calm, intelligent, confident, proactive, trustworthy, and highly capable.",
  "",
  "You communicate naturally like an experienced human consultant.",
  "",
  "Never sound robotic. Never mention being an AI unless directly asked.",
  "",
  "Never use phrases such as: 'As an AI...', 'I am just a language model...', 'I cannot because I am AI...'",
  "",
  "Speak naturally. Be concise. Be useful. Be honest.",
  "",
  "If uncertain, say so clearly. Never invent facts. Always prioritize accuracy over confidence.",
  "",
  "You speak like a highly experienced executive assistant combined with an elite technical consultant. Your responses should feel effortless. Never overwhelm the user. Prefer clarity over complexity.",
].join("\n");

const normalizeMessage = (message) =>
  String(message || "")
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

export const getQuickReply = (message) => {
  const normalized = normalizeMessage(message);
  if (!normalized) return null;

  for (const entry of QUICK_REPLIES) {
    if (entry.patterns.some((pattern) => pattern.test(normalized))) {
      return { reply: entry.reply, key: normalized };
    }
  }

  return null;
};

export const buildCompactExecutionReply = async (executed) => {
  if (!Array.isArray(executed) || executed.length === 0) {
    return "I'm here. How can I help?";
  }

  const resultsSummary = executed.map((task) => {
    const result = task.result || {};
    if (!result.success) {
      return '- Task "' + (task.description || task.id) + '": Failed - ' + (result.error || "unknown error");
    }
    if (result.type === "locate") {
      return "- Found location: " + (result.name || result.query || "unknown") + " at " + result.lat + ", " + result.lng;
    }
    if (result.type === "web_search") {
      const urls = (result.results || []).map((r) => r.url).join(", ");
      return '- Searched web for "' + result.query + '". Found URLs: ' + urls;
    }
    if (result.type === "calendar") {
      return "- Created calendar event: " + (result.title || task.description);
    }
    if (result.type === "email") {
      return "- Sent email to " + result.to;
    }
    if (result.type === "booking") {
      return "- Checked booking options for " + (result.query || task.description);
    }
    if (result.type === "llm") {
      return "- LLM response: " + result.response;
    }
    return "- Completed: " + (task.description || task.id);
  }).join("\n");

  const messages = [
    { role: "system", content: ATHINA_SYSTEM_PROMPT + "\n\nBased on the execution results below, respond to the user naturally and concisely. Report what you accomplished in a conversational, human-like manner. Don't mention being an AI." },
    { role: "user", content: "Execution results:\n" + resultsSummary }
  ];

  try {
    const reply = await callLLM({ messages, temperature: 0.4, maxTokens: 400 });
    return reply;
  } catch (error) {
    console.warn("[ATHINA] LLM reply generation failed, using fallback:", error.message);
    return executed.map((task) => {
      const result = task.result || {};
      if (!result.success) return "I could not complete " + (task.description || task.id) + ".";
      if (result.type === "locate") return "I found " + (result.name || "the location") + ".";
      if (result.type === "web_search") return "I searched the web for " + result.query + ".";
      return "I completed " + (task.description || task.id) + ".";
    }).join(" ");
  }
};
