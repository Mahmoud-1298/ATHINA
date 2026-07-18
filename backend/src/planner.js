import { callLLM } from "./utils/llmClient.js";
import { getToolSchemas } from "./tools/index.js";

const ATHINA_PERSONALITY = "You are ATHINA, an autonomous executive AI assistant. You are calm, intelligent, confident, and highly capable. You communicate naturally like an experienced human consultant. Never sound robotic. Never mention being an AI.";

const PLANNER_PROMPT = [
  ATHINA_PERSONALITY,
  "",
  "You are ATHINA Planner. Analyze the user request and decide if it requires tool-based actions or a simple conversational response.",
  "",
  'Return JSON: { "requiresPlanning": boolean, "reply": string, "tasks": array }',
  "",
  "If requiresPlanning is false: set reply to your conversational response, tasks to empty array [].",
  "If requiresPlanning is true: set tasks to array of task objects, reply to empty string.",
  'Each task: { "id": "task_1", "description": "", "tool": "tool_name", "params": {}, "depends_on": [] }',
  "",
  "Rules: Use ${task_X.field} in params to reference results from previous tasks. Each task uses one tool. Order by dependency. Max 5 tasks. Use llm tool if no specific tool fits.",
  "",
  "requiresPlanning MUST be true if the user asks to:",
  "- Find, show, locate, or point to any location on a map",
  "- Search, look up, or browse anything on the web",
  "- Send an email or message",
  "- Create a calendar event, schedule, or reminder",
  "- Book, reserve, or search for hotels, flights, restaurants",
  "- Research anything that requires current/real-time information",
  "",
  "requiresPlanning should be false ONLY for casual conversation, greetings, or questions you can answer from general knowledge.",
  "",
  "When requiresPlanning is false, your reply must be natural, conversational, and human-like.",
  "",
  "Examples:",
  "'show me Dubai mall' -> { requiresPlanning: true, reply: '', tasks: [{ id: 'task_1', description: 'Find Dubai Mall location', tool: 'maps', params: { query: 'Dubai Mall' }, depends_on: [] }] }",
  "'open youtube.com' -> { requiresPlanning: true, reply: '', tasks: [{ id: 'task_1', description: 'Browse youtube.com', tool: 'web_search', params: { query: 'youtube.com' }, depends_on: [] }] }",
  "'hello' -> { requiresPlanning: false, reply: 'Hello! How can I help?', tasks: [] }",
  "'what is machine learning' -> { requiresPlanning: false, reply: 'Machine learning is...', tasks: [] }",
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

export const plan = async ({ message, history, locationNote = "" }) => {
  const toolList = getToolSchemas().map((t) => "- " + t.name + ": " + t.description).join("\n");
  const userContent = locationNote ? locationNote + "\n\nUser request: " + message : message;
  const messages = [
    { role: "system", content: PLANNER_PROMPT + "\n\nAvailable tools:\n" + toolList },
    ...history.slice(-4),
    { role: "user", content: userContent },
  ];
  const result = await callLLM({ messages, temperature: 0.1, maxTokens: 1000, jsonMode: true });

  let requiresPlanning = result.requiresPlanning || false;
  let reply = result.reply || "";
  let tasks = result.tasks || [];

  if (!requiresPlanning) {
    const needsAction = ACTION_KEYWORDS.some((pattern) => pattern.test(message));
    if (needsAction) {
      requiresPlanning = true;
      reply = "";
      if (!Array.isArray(tasks) || tasks.length === 0) {
        tasks = [{ id: "task_1", description: message, tool: "llm", params: { prompt: message }, depends_on: [] }];
      }
    }
  }

  return { requiresPlanning, reply, goal: message, steps: tasks.map((t) => t.description), tasks };
};
