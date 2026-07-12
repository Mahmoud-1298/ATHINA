import { callLLM } from "./utils/llmClient.js";

const PLANNER_PROMPT = [
  "You are ATHINA Planner. Analyze the user request and decide if it requires tool-based actions or a simple conversational response.",
  "",
  "Return JSON: { \"requiresPlanning\": boolean, \"reply\": string (if no planning), \"goal\": string (if planning), \"steps\": string[] (if planning) }",
  "",
  "requiresPlanning MUST be true if the user asks to:",
  "- Find, show, locate, or point to any location on a map (e.g. 'show me Dubai mall', 'where is Abu Dhabi')",
  "- Search, look up, or browse anything on the web (e.g. 'search for hotels', 'open youtube.com')",
  "- Send an email or message",
  "- Create a calendar event, schedule, or reminder",
  "- Book, reserve, or search for hotels, flights, restaurants",
  "- Research anything that requires current/real-time information",
  "",
  "requiresPlanning should be false ONLY for casual conversation, greetings, or questions you can answer from general knowledge.",
  "",
  "Examples:",
  "'show me Dubai mall location' -> { requiresPlanning: true, goal: 'Show Dubai Mall on map', steps: ['Find Dubai Mall location'] }",
  "'where is the location for Dubai mall' -> { requiresPlanning: true, goal: 'Show Dubai Mall on map', steps: ['Find Dubai Mall location'] }",
  "'can you open youtube.com' -> { requiresPlanning: true, goal: 'Open youtube.com', steps: ['Browse youtube.com'] }",
  "'search for best restaurants in Dubai' -> { requiresPlanning: true, goal: 'Find best restaurants', steps: ['Search for best restaurants in Dubai'] }",
  "'hello' -> { requiresPlanning: false, reply: 'Hello! How can I assist you?' }",
  "'what is machine learning' -> { requiresPlanning: false, reply: 'Machine learning is...' }",
  "",
  "Return ONLY valid JSON.",
].join("\n");

const ACTION_KEYWORDS = [
  /\b(locat|map|where is|where.*\b|address|directions|near me|near\b|find me|show me|point to|pinpoint)\b/i,
  /\b(search|google|look up|lookup|browse|website|open.*(tab|site|page)|visit|url|youtube|www\.)\b/i,
  /\b(email|send.*mail|compose.*mail|e-mail)\b/i,
  /\b(calendar|schedule|remind|event|appointment|set.*reminder)\b/i,
  /\b(book|reserv|hotel|flight|restaurant|rent)\b/i,
];

export const plan = async ({ message, history }) => {
  const messages = [{ role: "system", content: PLANNER_PROMPT }, ...history.slice(-4), { role: "user", content: message }];
  const result = await callLLM({ messages, temperature: 0.1, maxTokens: 1200, jsonMode: true });

  let requiresPlanning = result.requiresPlanning || false;
  let reply = result.reply || "";
  let goal = result.goal || "";
  let steps = result.steps || [];

  if (!requiresPlanning) {
    const needsAction = ACTION_KEYWORDS.some((pattern) => pattern.test(message));
    if (needsAction) {
      requiresPlanning = true;
      goal = goal || message;
      steps = steps.length > 0 ? steps : [message];
      reply = "";
    }
  }

  return { requiresPlanning, reply, goal, steps };
};