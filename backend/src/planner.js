import { callLLM } from "./utils/llmClient.js";
const PLANNER_PROMPT = [
  "You are ATHINA Planner. Analyze the user request and decide if it requires multi-step planning or a simple conversational response.",
  "If the request is a simple question or conversation needing no external actions, return: { \"requiresPlanning\": false, \"reply\": \"your direct response\" }",
  "If the request requires actions (searching, booking, emailing, calendar, maps, research), return: { \"requiresPlanning\": true, \"goal\": \"overall goal\", \"steps\": [\"step 1\", \"step 2\"] }",
  "Break complex requests into clear sequential steps. Each step is a single action.",
  "Example: traveling to Abu Dhabi, find hotel near ADNOC HQ, book cheapest 4+ star, add to calendar, email itinerary, remind me -> requiresPlanning: true with 7 steps",
  "Example: What is machine learning? -> requiresPlanning: false, reply with answer",
  "Return only valid JSON.",
].join("\n");
export const plan = async ({ message, history }) => {
  const messages = [{ role: "system", content: PLANNER_PROMPT }, ...history.slice(-8), { role: "user", content: message }];
  const result = await callLLM({ messages, temperature: 0.2, maxTokens: 600, jsonMode: true });
  return { requiresPlanning: result.requiresPlanning || false, reply: result.reply || "", goal: result.goal || "", steps: result.steps || [] };
};